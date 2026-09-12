/**
 * 異地还车（オーナー間乗り捨て返却）API
 *
 * GET  ?ownerId=X&mode=settings   → このオーナーの受け入れ設定
 * GET  ?ownerId=X&mode=receivers  → 受け入れON の他オーナー一覧（返却先候補）
 * GET  ?ownerId=X&mode=list       → 自分が関与する取り決め＋共有写真
 * POST { type:'settings', ... }   → 受け入れ設定を保存
 * POST { type:'create',   ... }   → 取り決めを作成（origin=このオーナー）
 * PATCH { id, ... }               → ステータス/日数更新＋費用再計算
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import {
  buildCrossReturnPublicListing,
  bestGoInspectionKey,
  coerceCrossReturnBaseFee,
  coerceExpectedStorageDays,
  composeBestGoSharedInspections,
  computeCrossReturnCustomerFee,
  crossReturnVehicleAvailability,
  crossReturnModeRequiresOwnerId,
  homeReturnStatusOf,
} from '../../../../lib/crossReturn';
import { haversineKm, recommendedDeadlineISO } from '../../../../lib/oneWay';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' };

const DEFAULT_SETTINGS = {
  enabled: false, location: '', fee_mode: 'storage',
  storage_per_day: 0, split_type: 'percent', split_value: 50, note: '',
};

function settingsToClient(r, ownerId) {
  const s = r ?? { owner_id: ownerId, ...DEFAULT_SETTINGS };
  return {
    ownerId: s.owner_id, enabled: !!s.enabled, location: s.location ?? '',
    feeMode: s.fee_mode ?? 'storage', storagePerDay: Number(s.storage_per_day ?? 0),
    splitType: s.split_type ?? 'percent', splitValue: Number(s.split_value ?? 0), note: s.note ?? '',
    lat: s.lat != null ? Number(s.lat) : null, lng: s.lng != null ? Number(s.lng) : null,
  };
}

// サーバー側ジオコーディング（住所→座標）。車両に座標が無い場合の補完用。
const _geoCache = new Map();
async function geocodeServer(address) {
  const key = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key || !address) return null;
  if (_geoCache.has(address)) return _geoCache.get(address);
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}&language=ja&region=JP`);
    const d = await res.json();
    const loc = d.results?.[0]?.geometry?.location;
    const out = loc ? { lat: loc.lat, lng: loc.lng } : null;
    _geoCache.set(address, out);
    return out;
  } catch { return null; }
}

async function reservationTotalOf(reservationId) {
  if (!reservationId) return 0;
  const { data } = await supabaseAdmin.from('reservations').select('total').eq('id', reservationId).maybeSingle();
  return Number(data?.total ?? 0);
}

async function updateVehicleLocationForOwner(vehicleId, ownerId, fallbackLocation = null) {
  if (!vehicleId || !ownerId) return;
  const { data: ownerSetting } = await supabaseAdmin
    .from('cross_return_settings')
    .select('location, lat, lng')
    .eq('owner_id', ownerId)
    .maybeSingle();
  const nextLoc = ownerSetting?.location ?? fallbackLocation ?? null;
  const nextLat = ownerSetting?.lat == null ? null : Number(ownerSetting.lat);
  const nextLng = ownerSetting?.lng == null ? null : Number(ownerSetting.lng);
  if (nextLat != null && nextLng != null) {
    await supabaseAdmin.from('vehicles').update({ lat: nextLat, lng: nextLng, loc: nextLoc }).eq('id', vehicleId);
  } else if (nextLoc) {
    await supabaseAdmin.from('vehicles').update({ loc: nextLoc }).eq('id', vehicleId);
  }
}

function latestCrossReturnByVehicle(rows = []) {
  const byVehicle = new Map();
  for (const row of rows ?? []) {
    if (!row?.vehicle_id) continue;
    const key = String(row.vehicle_id);
    if (!byVehicle.has(key)) byVehicle.set(key, row);
  }
  return byVehicle;
}

// その予約の共有写真（AI点検10箇所＋引き渡し写真）を集める
async function sharedPhotosFor(reservationId, crossReturnId = null) {
  if (!reservationId) return { inspection: null, handover: [] };
  const inspectionIds = [
    reservationId,
    bestGoInspectionKey({ reservationId, crossReturnId, leg: 'outbound' }),
    bestGoInspectionKey({ reservationId, crossReturnId, leg: 'homeward' }),
  ].filter(Boolean);
  const [insp, rec] = await Promise.all([
    supabaseAdmin.from('damage_inspections').select('reservation_id, photos, analysis, est_cost, mode').in('reservation_id', inspectionIds),
    supabaseAdmin.from('pickup_records').select('photos').eq('reservation_id', reservationId).maybeSingle(),
  ]);
  const rows = Array.isArray(insp.data) ? insp.data : [];
  const inspectionById = Object.fromEntries(rows.map(row => [String(row.reservation_id), row]));
  const inspectionFor = (id, leg) => {
    const row = inspectionById[String(id)];
    return row ? {
      id: row.reservation_id,
      leg,
      photos: row.photos ?? {},
      estCost: row.est_cost ?? 0,
      analysis: row.analysis ?? null,
      mode: row.mode ?? null,
    } : null;
  };
  const outboundInspectionId = bestGoInspectionKey({ reservationId, crossReturnId, leg: 'outbound' });
  const inspections = composeBestGoSharedInspections({
    reservationInspection: inspectionFor(reservationId, 'reservation'),
    outboundInspection: inspectionFor(outboundInspectionId, 'outbound'),
    homewardInspection: inspectionFor(bestGoInspectionKey({ reservationId, crossReturnId, leg: 'homeward' }), 'homeward'),
    outboundInspectionId,
  });
  return {
    inspection: inspections[0] ?? null,
    inspections,
    handover: Array.isArray(rec.data?.photos) ? rec.data.photos : [],
  };
}

export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503, headers: NO_CACHE });
  const { searchParams } = new URL(req.url);
  const ownerId = searchParams.get('ownerId');
  const mode = searchParams.get('mode') || 'list';
  if (crossReturnModeRequiresOwnerId(mode) && !ownerId) {
    return NextResponse.json({ error: 'ownerId required' }, { status: 400, headers: NO_CACHE });
  }

  if (mode === 'settings') {
    const { data } = await supabaseAdmin.from('cross_return_settings').select('*').eq('owner_id', ownerId).maybeSingle();
    return NextResponse.json(settingsToClient(data, ownerId), { headers: NO_CACHE });
  }

  // 車両ごとの許可済み返却先（受け入れオーナーIDの配列＋想定保管日数）
  if (mode === 'vehicle-dests') {
    const vehicleId = searchParams.get('vehicleId');
    if (!vehicleId) return NextResponse.json({ receiverIds: [], expectedDays: 1 }, { headers: NO_CACHE });
    const { data } = await supabaseAdmin.from('cross_return_dests').select('receiving_owner_id, expected_days, base_fee').eq('vehicle_id', vehicleId);
    const receiverIds = (data ?? []).map(r => String(r.receiving_owner_id));
    const expectedDays = data && data.length ? Number(data[0].expected_days ?? 1) : 1;
    const baseFee = data && data.length ? Number(data[0].base_fee ?? 0) : 0;
    return NextResponse.json({ receiverIds, expectedDays, baseFee }, { headers: NO_CACHE });
  }

  // ユーザー向けブース：車両の出発地 → 許可された返却先 のリスト（地図アーチ用）
  if (mode === 'public-listings') {
    const { data: dests } = await supabaseAdmin.from('cross_return_dests').select('*');
    if (!dests || dests.length === 0) return NextResponse.json({ listings: [] }, { headers: NO_CACHE });
    const vehIds = [...new Set(dests.map(d => d.vehicle_id).filter(Boolean))];
    const recvIds = [...new Set(dests.map(d => d.receiving_owner_id).filter(Boolean))];
    const originIds = [...new Set(dests.map(d => d.origin_owner_id).filter(Boolean))];
    const { data: transfers } = vehIds.length
      ? await supabaseAdmin
        .from('cross_returns')
        .select('*')
        .in('vehicle_id', vehIds)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
      : { data: [] };
    const latestByVehicle = latestCrossReturnByVehicle(transfers ?? []);
    const transferOwnerIds = (transfers ?? []).flatMap(t => [t.origin_owner_id, t.receiving_owner_id]).filter(Boolean);
    const settingIds = [...new Set([...recvIds, ...originIds, ...transferOwnerIds])];
    const [{ data: vehicles }, { data: settings }, { data: owners }] = await Promise.all([
      supabaseAdmin.from('vehicles').select('id, owner_id, owner_auth_id, maker, model, img_url, cls, lat, lng, loc, price_day, status, approval_status').in('id', vehIds),
      settingIds.length ? supabaseAdmin.from('cross_return_settings').select('*').in('owner_id', settingIds) : Promise.resolve({ data: [] }),
      settingIds.length ? supabaseAdmin.from('owners').select('id, store_name, store_location').in('id', settingIds) : Promise.resolve({ data: [] }),
    ]);
    const vById = Object.fromEntries((vehicles ?? []).map(v => [String(v.id), v]));
    const sById = Object.fromEntries((settings ?? []).map(s => [String(s.owner_id), s]));
    const oById = Object.fromEntries((owners ?? []).map(o => [String(o.id), o]));
    const listings = [];
    for (const d of dests) {
      const v = vById[String(d.vehicle_id)];
      const latestTransfer = latestByVehicle.get(String(d.vehicle_id));
      const availability = crossReturnVehicleAvailability({ vehicle: v, latestTransfer });
      if (availability.mode === 'in_transit') continue;
      if (!availability.searchable) continue;

      const s = sById[String(d.receiving_owner_id)];
      const o = oById[String(d.receiving_owner_id)];
      if (!v || !s?.enabled) continue;              // 受け入れがOFFなら出さない
      if ((v.status ?? 'active') !== 'active') continue;
      if (s.lat == null || s.lng == null) continue; // 返却先の座標は必須
      // 出発地の座標を解決：車両 → 元オーナー拠点 → 住所ジオコーディング
      let fromLat = v.lat, fromLng = v.lng;
      if (fromLat == null || fromLng == null) {
        const os = sById[String(d.origin_owner_id)];
        if (os?.lat != null && os?.lng != null) { fromLat = os.lat; fromLng = os.lng; }
      }
      if ((fromLat == null || fromLng == null) && v.loc) {
        const g = await geocodeServer(v.loc);
        if (g) {
          fromLat = g.lat; fromLng = g.lng;
          // 次回以降のためキャッシュ（車両に書き戻す）
          supabaseAdmin.from('vehicles').update({ lat: g.lat, lng: g.lng }).eq('id', v.id).then(() => {}, () => {});
        }
      }
      if (fromLat == null || fromLng == null) continue; // どうしても座標が取れない場合のみ除外
      const listing = buildCrossReturnPublicListing({
        dest: d,
        vehicle: v,
        receiverSetting: s,
        receiverOwner: o,
        fromLat,
        fromLng,
      });
      if (listing) listings.push(listing);
    }
    return NextResponse.json({ listings }, { headers: NO_CACHE });
  }

  if (mode === 'receivers') {
    const { data: rows } = await supabaseAdmin.from('cross_return_settings').select('*').eq('enabled', true);
    const ids = (rows ?? []).map(r => r.owner_id).filter(id => String(id) !== String(ownerId));
    let owners = [];
    if (ids.length) {
      const { data: os } = await supabaseAdmin.from('owners').select('id, store_name, store_location').in('id', ids);
      owners = os ?? [];
    }
    const byId = Object.fromEntries(owners.map(o => [String(o.id), o]));
    const receivers = (rows ?? [])
      .filter(r => String(r.owner_id) !== String(ownerId))
      .map(r => {
        const o = byId[String(r.owner_id)];
        return {
          ownerId: r.owner_id,
          storeName: o?.store_name ?? 'Store',
          location: r.location || o?.store_location || '',
          feeMode: r.fee_mode, storagePerDay: Number(r.storage_per_day ?? 0),
          splitType: r.split_type, splitValue: Number(r.split_value ?? 0), note: r.note ?? '',
          lat: r.lat != null ? Number(r.lat) : null, lng: r.lng != null ? Number(r.lng) : null,
        };
      });
    return NextResponse.json(receivers, { headers: NO_CACHE });
  }

  // mode === 'list'
  const { data: rows } = await supabaseAdmin
    .from('cross_returns')
    .select('*')
    .or(`origin_owner_id.eq.${ownerId},receiving_owner_id.eq.${ownerId}`)
    .order('created_at', { ascending: false });

  const list = [];
  for (const r of rows ?? []) {
    const counterpartId = String(r.origin_owner_id) === String(ownerId) ? r.receiving_owner_id : r.origin_owner_id;
    const { data: cp } = counterpartId
      ? await supabaseAdmin.from('owners').select('store_name').eq('id', counterpartId).maybeSingle()
      : { data: null };
    const { data: veh } = r.vehicle_id
      ? await supabaseAdmin.from('vehicles').select('maker, model').eq('id', r.vehicle_id).maybeSingle()
      : { data: null };
    const shared = r.share_photos ? await sharedPhotosFor(r.reservation_id, r.id) : { inspection: null, inspections: [], handover: [] };
    list.push({
      id: r.id, reservationId: r.reservation_id, vehicleId: r.vehicle_id,
      role: String(r.origin_owner_id) === String(ownerId) ? 'origin' : 'receiving',
      counterpartName: cp?.store_name ?? '—',
      vehicleLabel: veh ? `${veh.maker ?? ''} ${veh.model ?? ''}`.trim() : (r.vehicle_id ?? ''),
      receivingLocation: r.receiving_location ?? '',
      feeMode: r.fee_mode, storagePerDay: Number(r.storage_per_day ?? 0), daysStored: Number(r.days_stored ?? 0),
      splitType: r.split_type, splitValue: Number(r.split_value ?? 0), feeTotal: Number(r.fee_total ?? 0),
      baseFee: Number(r.base_fee ?? 0),
      homeReturnMethod: r.home_return_method ?? 'undecided',
      homeReturnStatus: r.home_return_status ?? 'holding',
      homeReturnOneWayListingId: r.home_return_one_way_listing_id ?? null,
      homeReturnReservationId: r.home_return_reservation_id ?? null,
      homeReturnStartedAt: r.home_return_started_at ?? null,
      homeReturnCompletedAt: r.home_return_completed_at ?? null,
      sharePhotos: !!r.share_photos, status: r.status, note: r.note ?? '',
      sharedPhotos: shared,
      createdAt: r.created_at,
    });
  }
  return NextResponse.json(list, { headers: NO_CACHE });
}

export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503, headers: NO_CACHE });
  const body = await req.json();
  const { type } = body;

  if (type === 'settings') {
    const { ownerId, enabled, location, feeMode, storagePerDay, splitType, splitValue, note, lat, lng } = body;
    if (!ownerId) return NextResponse.json({ error: 'ownerId required' }, { status: 400, headers: NO_CACHE });
    const row = {
      owner_id: ownerId, enabled: !!enabled, location: location ?? '',
      fee_mode: feeMode === 'split' ? 'split' : 'storage',
      storage_per_day: Math.max(0, Math.round(Number(storagePerDay) || 0)),
      split_type: splitType === 'fixed' ? 'fixed' : 'percent',
      split_value: Math.max(0, Math.round(Number(splitValue) || 0)),
      note: note ?? '',
      lat: (lat === '' || lat == null) ? null : Number(lat),
      lng: (lng === '' || lng == null) ? null : Number(lng),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin.from('cross_return_settings').upsert(row, { onConflict: 'owner_id' }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE });
    return NextResponse.json(settingsToClient(data, ownerId), { headers: NO_CACHE });
  }

  // 車両ごとの返却先（許可する受け入れオーナー）を保存（置き換え）
  if (type === 'vehicle-dests') {
    const { vehicleId, originOwnerId, receiverIds, expectedDays } = body;
    if (!vehicleId) return NextResponse.json({ error: 'vehicleId required' }, { status: 400, headers: NO_CACHE });
    const days = coerceExpectedStorageDays(expectedDays);
    const baseFee = coerceCrossReturnBaseFee(body.baseFee);
    await supabaseAdmin.from('cross_return_dests').delete().eq('vehicle_id', vehicleId);
    const ids = [...new Set((Array.isArray(receiverIds) ? receiverIds : []).map(String))];
    if (ids.length) {
      const rows = ids.map(rid => ({ vehicle_id: vehicleId, origin_owner_id: originOwnerId ?? null, receiving_owner_id: rid, expected_days: days, base_fee: baseFee }));
      const { error } = await supabaseAdmin.from('cross_return_dests').insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE });
    }
    return NextResponse.json({ ok: true, count: ids.length }, { headers: NO_CACHE });
  }

  if (type === 'create') {
    const { originOwnerId, receivingOwnerId, reservationId, vehicleId, sharePhotos = true, feeTotal: feeOverride } = body;
    if (!originOwnerId || !receivingOwnerId || !reservationId) {
      return NextResponse.json({ error: 'originOwnerId, receivingOwnerId, reservationId required' }, { status: 400, headers: NO_CACHE });
    }
    // 同じ予約の重複作成を防ぐ
    const { data: exist } = await supabaseAdmin.from('cross_returns').select('id').eq('reservation_id', reservationId).maybeSingle();
    if (exist) return NextResponse.json({ id: exist.id, existing: true }, { headers: NO_CACHE });
    // 受け入れ側の設定を取り込み（費用条件のスナップショット）
    const { data: rs } = await supabaseAdmin.from('cross_return_settings').select('*').eq('owner_id', receivingOwnerId).maybeSingle();
    const recv = settingsToClient(rs, receivingOwnerId);
    const { data: dest } = vehicleId
      ? await supabaseAdmin.from('cross_return_dests').select('base_fee, expected_days').eq('vehicle_id', vehicleId).eq('receiving_owner_id', receivingOwnerId).maybeSingle()
      : { data: null };
    const baseFee = coerceCrossReturnBaseFee(body.baseFee ?? dest?.base_fee);
    const total = await reservationTotalOf(reservationId);
    // ユーザー決済に上乗せ済みの金額があればそれを採用（表示と一致させる）
    const feeTotal = (feeOverride != null && feeOverride !== '')
      ? Math.max(0, Math.round(Number(feeOverride) || 0))
      : computeCrossReturnCustomerFee({
          baseFee,
          feeMode: recv.feeMode, storagePerDay: recv.storagePerDay, expectedDays: dest?.expected_days ?? 1,
          splitType: recv.splitType, splitValue: recv.splitValue,
        }, total).total;
    const row = {
      reservation_id: reservationId, vehicle_id: vehicleId ?? null,
      origin_owner_id: originOwnerId, receiving_owner_id: receivingOwnerId,
      receiving_location: recv.location, fee_mode: recv.feeMode,
      storage_per_day: recv.storagePerDay, days_stored: 0,
      split_type: recv.splitType, split_value: recv.splitValue, base_fee: baseFee, fee_total: feeTotal,
      share_photos: !!sharePhotos, status: 'requested', updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin.from('cross_returns').insert(row).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE });
    return NextResponse.json({ id: data.id, feeTotal }, { status: 201, headers: NO_CACHE });
  }

  return NextResponse.json({ error: 'unknown type' }, { status: 400, headers: NO_CACHE });
}

export async function PATCH(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503, headers: NO_CACHE });
  const { id, ownerId, status, daysStored, action } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400, headers: NO_CACHE });

  const { data: cur } = await supabaseAdmin.from('cross_returns').select('*').eq('id', id).maybeSingle();
  if (!cur) return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_CACHE });
  const isOriginOwner = ownerId && String(ownerId) === String(cur.origin_owner_id);
  const isReceivingOwner = ownerId && String(ownerId) === String(cur.receiving_owner_id);
  const homeStatus = homeReturnStatusOf(cur);

  const now = new Date().toISOString();
  const updates = { updated_at: now };
  if (status) {
    updates.status = status;
    if (status === 'received') {
      updates.home_return_method = cur.home_return_method ?? 'undecided';
      updates.home_return_status = cur.home_return_status ?? 'holding';
    }
  }
  if (daysStored !== undefined) updates.days_stored = Math.max(0, Math.round(Number(daysStored) || 0));

  if (action === 'request-staff-return') {
    if (!isOriginOwner) {
      return NextResponse.json({ error: 'origin owner required' }, { status: 403, headers: NO_CACHE });
    }
    if (cur.status !== 'received') {
      return NextResponse.json({ error: 'vehicle must be received first' }, { status: 409, headers: NO_CACHE });
    }
    Object.assign(updates, {
      home_return_method: 'staff',
      home_return_status: 'staff_requested',
    });
  }

  if (action === 'request-one-way-return') {
    if (!isOriginOwner) {
      return NextResponse.json({ error: 'origin owner required' }, { status: 403, headers: NO_CACHE });
    }
    if (cur.status !== 'received') {
      return NextResponse.json({ error: 'vehicle must be received first' }, { status: 409, headers: NO_CACHE });
    }
    Object.assign(updates, {
      home_return_method: 'best_one_way',
      home_return_status: 'one_way_requested',
    });
  }

  if (action === 'start-staff-return') {
    if (!isReceivingOwner) {
      return NextResponse.json({ error: 'receiving owner required' }, { status: 403, headers: NO_CACHE });
    }
    if (cur.status !== 'received') {
      return NextResponse.json({ error: 'vehicle must be received first' }, { status: 409, headers: NO_CACHE });
    }
    if (homeStatus !== 'staff_requested') {
      return NextResponse.json({ error: 'staff return has not been requested' }, { status: 409, headers: NO_CACHE });
    }
    Object.assign(updates, {
      home_return_method: 'staff',
      home_return_status: 'staff_returning',
      home_return_started_at: now,
    });
  }

  if (action === 'mark-returned-home') {
    if (!isOriginOwner) {
      return NextResponse.json({ error: 'origin owner required' }, { status: 403, headers: NO_CACHE });
    }
    Object.assign(updates, {
      home_return_status: 'returned_home',
      home_return_completed_at: now,
    });
  }

  if (action === 'publish-home-return-one-way') {
    if (!isReceivingOwner) {
      return NextResponse.json({ error: 'receiving owner required' }, { status: 403, headers: NO_CACHE });
    }
    if (cur.status !== 'received') {
      return NextResponse.json({ error: 'vehicle must be received first' }, { status: 409, headers: NO_CACHE });
    }
    if (homeStatus !== 'one_way_requested' && !cur.home_return_one_way_listing_id) {
      return NextResponse.json({ error: 'Best Match return has not been requested' }, { status: 409, headers: NO_CACHE });
    }
    if (cur.home_return_one_way_listing_id) {
      updates.home_return_method = 'best_one_way';
      updates.home_return_status = cur.home_return_status === 'one_way_booked' ? 'one_way_booked' : 'one_way_listed';
    } else {
      const [{ data: vehicle }, { data: settingsRows }] = await Promise.all([
        cur.vehicle_id
          ? supabaseAdmin
            .from('vehicles')
            .select('id, owner_id, owner_auth_id, maker, model, img_url, cls, price_day, insurance_plans, status, approval_status')
            .eq('id', cur.vehicle_id)
            .maybeSingle()
          : Promise.resolve({ data: null }),
        supabaseAdmin
          .from('cross_return_settings')
          .select('*')
          .in('owner_id', [cur.receiving_owner_id, cur.origin_owner_id].filter(Boolean)),
      ]);
      if (!vehicle) return NextResponse.json({ error: 'vehicle not found' }, { status: 404, headers: NO_CACHE });
      const settingsByOwner = Object.fromEntries((settingsRows ?? []).map(row => [String(row.owner_id), row]));
      const holderSetting = settingsByOwner[String(cur.receiving_owner_id)];
      const homeSetting = settingsByOwner[String(cur.origin_owner_id)];
      const fromLat = holderSetting?.lat == null ? null : Number(holderSetting.lat);
      const fromLng = holderSetting?.lng == null ? null : Number(holderSetting.lng);
      const toLat = homeSetting?.lat == null ? null : Number(homeSetting.lat);
      const toLng = homeSetting?.lng == null ? null : Number(homeSetting.lng);
      if ([fromLat, fromLng, toLat, toLng].some(v => v == null || Number.isNaN(v))) {
        return NextResponse.json({ error: 'home and holding locations need map coordinates' }, { status: 400, headers: NO_CACHE });
      }
      const distanceKm = haversineKm(fromLat, fromLng, toLat, toLng);
      const { data: listing, error: listingError } = await supabaseAdmin
        .from('one_way_listings').insert({
          owner_id: vehicle.owner_id ?? cur.origin_owner_id ?? null,
          owner_auth_id: vehicle.owner_auth_id ?? null,
          vehicle_id: vehicle.id,
          maker: vehicle.maker ?? null,
          model: vehicle.model ?? null,
          cls: vehicle.cls ?? 'standard',
          img_url: vehicle.img_url ?? null,
          from_name: holderSetting?.location ?? cur.receiving_location ?? '',
          from_lat: fromLat,
          from_lng: fromLng,
          to_name: homeSetting?.location ?? 'Home',
          to_lat: toLat,
          to_lng: toLng,
          distance_km: distanceKm,
          base_price: Math.max(0, Math.round(Number(vehicle.price_day) || 0)),
          deadline_at: recommendedDeadlineISO(distanceKm),
          available_from: now,
          insurance_plans: Array.isArray(vehicle.insurance_plans) ? vehicle.insurance_plans : ['waiver', 'waiverPlus', 'perfect'],
          status: 'open',
          custody_status: 'received',
          home_owner_id: cur.origin_owner_id ?? null,
          current_owner_id: cur.receiving_owner_id ?? null,
          route_policy: 'homeward_only',
          source_cross_return_id: cur.id,
          service_owner_id: cur.receiving_owner_id ?? null,
          service_fee_total: Math.max(0, Math.round(Number(cur.fee_total) || 0)),
        })
        .select('id')
        .single();
      if (listingError) return NextResponse.json({ error: listingError.message }, { status: 500, headers: NO_CACHE });
      updates.home_return_method = 'best_one_way';
      updates.home_return_status = 'one_way_listed';
      updates.home_return_one_way_listing_id = listing.id;
      updates.home_return_started_at = now;
    }
  }

  // 費用再計算
  const days = updates.days_stored ?? cur.days_stored;
  const total = await reservationTotalOf(cur.reservation_id);
  updates.fee_total = computeCrossReturnCustomerFee({
    baseFee: cur.base_fee, feeMode: cur.fee_mode, storagePerDay: cur.storage_per_day, daysStored: days,
    splitType: cur.split_type, splitValue: cur.split_value,
  }, total).total;

  const { data, error } = await supabaseAdmin.from('cross_returns').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE });
  if (status === 'received' && cur.vehicle_id && cur.receiving_owner_id) {
    await updateVehicleLocationForOwner(cur.vehicle_id, cur.receiving_owner_id, cur.receiving_location);
  }
  if (action === 'mark-returned-home' && cur.vehicle_id && cur.origin_owner_id) {
    await updateVehicleLocationForOwner(cur.vehicle_id, cur.origin_owner_id);
  }
  return NextResponse.json({
    id: data.id,
    status: data.status,
    feeTotal: data.fee_total,
    daysStored: data.days_stored,
    homeReturnMethod: data.home_return_method ?? 'undecided',
    homeReturnStatus: data.home_return_status ?? 'holding',
    homeReturnOneWayListingId: data.home_return_one_way_listing_id ?? null,
    homeReturnReservationId: data.home_return_reservation_id ?? null,
  }, { headers: NO_CACHE });
}
