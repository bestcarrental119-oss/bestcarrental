import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { isMasterEmail, isMasterUser } from '../../../../lib/master';

function errorMessage(value) {
  if (!value) return 'Unknown error';
  if (typeof value === 'string') return value;
  if (typeof value.message === 'string') return value.message;
  if (typeof value.error === 'string') return value.error;
  try { return JSON.stringify(value); }
  catch { return String(value); }
}

function isMissingOptionalSchemaError(error) {
  const code = String(error?.code ?? '');
  const message = errorMessage(error).toLowerCase();
  return code === '42P01'
    || code === '42703'
    || message.includes('does not exist')
    || message.includes('schema cache');
}

function bearerToken(req) {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? '';
}

async function readDeleteBody(req) {
  try { return await req.json(); }
  catch { return {}; }
}

async function isMasterDeleteRequest({ token, requesterId, requesterEmail }) {
  if (!token) return false;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return false;
  const tokenEmailIsMaster = isMasterEmail(data.user.email);
  const requesterEmailIsMaster = isMasterEmail(requesterEmail);
  if (!isMasterUser(data.user) && !(tokenEmailIsMaster && requesterEmailIsMaster)) return false;
  if (requesterId && data.user.id !== requesterId && !(tokenEmailIsMaster && requesterEmailIsMaster)) return false;
  return true;
}

function isMissingRpcError(error) {
  const code = String(error?.code ?? '');
  const message = errorMessage(error).toLowerCase();
  return isMissingOptionalSchemaError(error)
    || code === 'PGRST202'
    || message.includes('could not find the function')
    || message.includes('function public.master_force_delete_vehicle');
}

async function masterForceDeleteVehicle(vehicleId, vehicle) {
  const { data, error } = await supabaseAdmin
    .rpc('master_force_delete_vehicle', { target_vehicle_id: vehicleId });

  if (!error) {
    if (data?.success === false) throw new Error(`master_force_delete_vehicle: ${errorMessage(data.error ?? data)}`);
    return data ?? { success: true, mode: 'deleted' };
  }

  if (isMissingRpcError(error)) {
    throw new Error('Supabase SQL master_force_delete_vehicle is not installed. Run supabase/master_force_delete_vehicle.sql first.');
  }
  throw new Error(`master_force_delete_vehicle: ${errorMessage(error)}`);
}

export async function DELETE(req, { params }) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase service role not configured' }, { status: 503 });

    const { searchParams } = new URL(req.url);
    const body = await readDeleteBody(req);
    const ownerId = searchParams.get('ownerId');
    const ownerAuthId = searchParams.get('ownerAuthId');
    const masterToken = body?.accessToken || bearerToken(req);
    const attemptedMasterDelete = Boolean(
      masterToken ||
      body?.requesterEmail ||
      searchParams.get('requesterEmail')
    );
    const isMasterDelete = await isMasterDeleteRequest({
      token: masterToken,
      requesterId: body?.requesterId ?? searchParams.get('requesterId'),
      requesterEmail: body?.requesterEmail ?? searchParams.get('requesterEmail'),
    });

    // 対象の車両を取得
    const { data: vehicle, error: fetchError } = await supabaseAdmin
      .from('vehicles')
      .select('id, owner_id, owner_auth_id, cls')
      .eq('id', params.id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

    // オーナー本人からのリクエストは、自分の車両かどうかを検証する
    // （ownerId/ownerAuthId 無し = 管理者バックエンド経由として従来通り許可）
    if (ownerId || ownerAuthId) {
      // owners テーブルから、渡された ID に紐づくオーナーを解決
      const identifiers = [ownerId, ownerAuthId].filter(Boolean).map(String);
      const { data: owner } = await supabaseAdmin
        .from('owners')
        .select('id, user_id')
        .or(identifiers.map(v => `id.eq.${v},user_id.eq.${v}`).join(','))
        .maybeSingle();
      const ownerLookupIds = new Set(
        [ownerId, ownerAuthId, owner?.id, owner?.user_id].filter(Boolean).map(String)
      );

      const belongsToOwner =
        (vehicle.owner_id != null && ownerLookupIds.has(String(vehicle.owner_id))) ||
        (vehicle.owner_auth_id != null && ownerLookupIds.has(String(vehicle.owner_auth_id)));

      if (!belongsToOwner) {
        return NextResponse.json({ error: 'You can only delete your own vehicles' }, { status: 403 });
      }
    }

    if (!isMasterDelete && attemptedMasterDelete) {
      return NextResponse.json(
        {
          error: 'Master authentication failed. Please log out, log in again as the master account, and retry.',
          code: 'master_auth_failed',
        },
        { status: 403 }
      );
    }

    if (!isMasterDelete) {
      // 進行中の予約がある車両は通常削除できない。マスターの強制削除だけ例外。
      const { data: activeReservations, error: resError } = await supabaseAdmin
        .from('reservations')
        .select('id')
        .eq('vehicle_id', params.id)
        .not('status', 'in', '("cancelled","canceled","rejected","completed")');
      if (resError) throw resError;
      if ((activeReservations ?? []).length > 0) {
        return NextResponse.json(
          {
            error: 'This vehicle has active reservations and cannot be deleted',
            code: 'active_reservations',
            count: activeReservations.length,
          },
          { status: 409 }
        );
      }
    }

    if (isMasterDelete) {
      const result = await masterForceDeleteVehicle(params.id, vehicle);
      return NextResponse.json({ success: true, mode: result?.mode ?? 'deleted', log: result?.log ?? [] });
    }

    const { error } = await supabaseAdmin.from('vehicles').delete().eq('id', params.id);
    if (error) throw error;
    return NextResponse.json({ success: true, mode: 'deleted' });
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

// オーナーが自分の vehicle の status (active/inactive) を切り替える
export async function PATCH(req, { params }) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  try {
    const body = await req.json();
    const allowed = ['status', 'approval_status', 'holder']; // 更新を許可するフィールドのみ
    const updates = {};
    allowed.forEach(k => { if (body[k] !== undefined) updates[k] = body[k]; });
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('vehicles').update(updates).eq('id', params.id).select().single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
