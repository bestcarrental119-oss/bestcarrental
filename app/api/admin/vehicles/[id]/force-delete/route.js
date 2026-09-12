import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../../lib/supabase';
import { isMasterUser } from '../../../../../../lib/master';

export const dynamic = 'force-dynamic';

function errorMessage(value) {
  if (!value) return 'Unknown error';
  if (typeof value === 'string') return value;
  if (typeof value.message === 'string') return value.message;
  if (typeof value.error === 'string') return value.error;
  try { return JSON.stringify(value); }
  catch { return String(value); }
}

function bearerToken(req) {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? '';
}

function isMissingRpcError(error) {
  const code = String(error?.code ?? '');
  const message = errorMessage(error).toLowerCase();
  return code === '42P01'
    || code === '42703'
    || code === 'PGRST202'
    || message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('could not find the function')
    || message.includes('function public.master_force_delete_vehicle');
}

async function readBody(req) {
  try { return await req.json(); }
  catch { return {}; }
}

async function assertMaster(accessToken, requesterId) {
  if (accessToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (!error && data?.user) {
      if (!isMasterUser(data.user)) return { ok: false, status: 403, error: 'master only' };
      if (requesterId && data.user.id !== requesterId) return { ok: false, status: 403, error: 'requester mismatch' };
      return { ok: true };
    }
  }
  if (requesterId) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(requesterId);
    if (!error && data?.user && isMasterUser(data.user)) return { ok: true };
  }
  return { ok: false, status: 401, error: 'invalid master session' };
}

export async function POST(req, { params }) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase service role not configured' }, { status: 503 });

  const body = await readBody(req);
  const accessToken = body?.accessToken || bearerToken(req);
  const guard = await assertMaster(accessToken, body?.requesterId);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  try {
    const { data, error } = await supabaseAdmin
      .rpc('master_force_delete_vehicle', { target_vehicle_id: params.id });

    if (error) {
      if (isMissingRpcError(error)) {
        return NextResponse.json(
          { error: 'Supabase SQL master_force_delete_vehicle is not installed. Run supabase/master_force_delete_vehicle.sql first.' },
          { status: 503 }
        );
      }
      throw error;
    }

    if (data?.success === false) {
      return NextResponse.json({ error: errorMessage(data.error ?? data) }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, mode: data?.mode ?? 'deleted', log: data?.log ?? [] },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}