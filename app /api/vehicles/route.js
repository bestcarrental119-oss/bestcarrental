import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabase';
import { geocodeAddress } from '../../../lib/geocode';
import { normalizeOfferedPlanIds } from '../../../lib/insurance';

export const dynamic = 'force-dynamic';

const BUCKET_PHOTOS    = process.env.SUPABASE_BUCKET_VEHICLES ?? 'vehicle-photos';
const BUCKET_CERTS     = 'inspection-certs';
const BUCKET_INSURANCE = 'insurance-certs';

// ── GET — approved vehicles only (frontend) ───────────────────────
export async function GET(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { searchParams } = new URL(req.url);
  const all = searchParams.get('all') === '1'; // admin only

  let q = supabaseAdmin.from('vehicles').select('id, maker, model, year, grade, cls, type, pax, fuel, trans, price_day, price_hour, deposit, insurance, rating, reviews, loc, lat, lng, img_url, inspection_expiry, badge, badge_bg, tags, status, one_way_enabled, airports, airport_fees, holder, created_at, updated_at, owner_id, approval_status, approval_note, license_plate, large_suitcases, small_bags, owner_auth_id, insurance_plans').order('created_at', { ascending: false });
  if (!all) q = q.eq('approval_status', 'approved');

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// ── POST — create/update vehicle (JSON or FormData) ───────────────
export async function POST(req) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  try {
    const ct = req.headers.get('content-type') ?? '';
    let vehicle = {};

    if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
      // ── FormData (admin with file uploads) ────────────────────
      const formData = await req.formData();
      const raw = formData.get('vehicle');
      if (!raw) return NextResponse.json({ error: 'Missing vehicle field' }, { status: 400 });
      vehicle = JSON.parse(raw);

      const uploadFile = async (file, bucket, prefix) => {
        if (!file || file.size === 0) return null;
        const ext  = file.name.split('.').pop();
        const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const buf  = Buffer.from(await file.arrayBuffer());
        const { error } = await supabaseAdmin.storage.from(bucket).upload(path, buf, { contentType: file.type, upsert: true });
        if (error) throw new Error(`Upload failed: ${error.message}`);
        return supabaseAdmin.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      };

      const imgUrl  = await uploadFile(formData.get('image'), BUCKET_PHOTOS, 'photos');
      const certUrl = await uploadFile(formData.get('cert'), BUCKET_CERTS, 'certs');
      const insUrl  = await uploadFile(formData.get('insuranceCert'), BUCKET_INSURANCE, 'insurance');
      if (imgUrl)  vehicle.img_url             = imgUrl;
      if (certUrl) vehicle.inspection_cert_url = certUrl;
      if (insUrl)  vehicle.insurance_cert_url  = insUrl;

    } else {
      // ── JSON (owner dashboard / admin JS save) ────────────────
      vehicle = await req.json();
    }

    // ── Build DB row ──────────────────────────────────────────────
    // approval_status: admin (no owner_id) → approved, owner → pending
    const isOwnerSubmission = !!vehicle.owner_id;
    const approvalStatus = vehicle.approvalStatus
      ?? (isOwnerSubmission ? 'pending' : 'approved');

    const row = {
      maker:               vehicle.maker,
      model:               vehicle.model,
      year:                Number(vehicle.year)     || null,
      grade:               vehicle.grade            || null,
      cls:                 vehicle.cls              || 'standard',
      type:                vehicle.type             || 'corporate',
      pax:                 Number(vehicle.pax)      || 5,
      fuel:                vehicle.fuel             || 'Gasoline',
      trans:               vehicle.trans            || 'AT',
      price_day:           Number(vehicle.priceDay) || 0,
      large_suitcases:     Number(vehicle.largeSuitcases ?? vehicle.large_suitcases ?? 0) || 0,
      small_bags:          Number(vehicle.smallBags ?? vehicle.small_bags ?? 0) || 0,
      price_hour:          Number(vehicle.priceHour)|| 0,
      deposit:             Number(vehicle.deposit)  || 0,
      insurance:           Number(vehicle.insurance)|| 1100,
      insurance_plans:     normalizeOfferedPlanIds(vehicle.insurancePlans ?? vehicle.insurance_plans),
      loc:                 vehicle.loc              || null,
      lat:                 vehicle.lat ? Number(vehicle.lat) : null,
      lng:                 vehicle.lng ? Number(vehicle.lng) : null,
      img_url:             vehicle.img_url ?? vehicle.img ?? null,
      inspection_cert_url: vehicle.inspection_cert_url ?? vehicle.inspectionCertUrl ?? null,
      insurance_cert_url:  vehicle.insurance_cert_url  ?? vehicle.insuranceCertUrl  ?? null,
      inspection_expiry:   vehicle.inspectionExpiry || null,
      license_plate:       vehicle.licensePlate     || null,
      badge:               vehicle.badge            || null,
      badge_bg:            vehicle.badgeBg          || null,
      tags:                Array.isArray(vehicle.tags) ? vehicle.tags : [],
      status:              vehicle.status           || 'active',
      approval_status:     approvalStatus,
      one_way_enabled:     vehicle.oneWayEnabled    ?? false,
      airports:            Array.isArray(vehicle.airports) ? vehicle.airports : [],
      airport_fees:        buildAirportFees(vehicle),
      holder:              vehicle.holder           || null,
      owner_id:            vehicle.owner_id         || null,
      owner_auth_id:       vehicle.owner_auth_id ?? vehicle.ownerAuthId ?? null,
    };

    // Auto-geocode: if no coordinates were provided but we have an address,
    // resolve lat/lng from the address so the vehicle shows at the right spot
    // on the map. Best-effort — never blocks the save if geocoding fails.
    if ((row.lat == null || row.lng == null) && row.loc) {
      try {
        const geo = await geocodeAddress(row.loc);
        if (geo) { row.lat = geo.lat; row.lng = geo.lng; }
      } catch (e) {
        console.warn('[vehicles] geocode failed:', e.message);
      }
    }

    // 保存。DBにまだ存在しない列（未マイグレーションの新カラム）があっても、
    // その列だけ自動的に外して再試行し、保存が失敗しないようにする。
    let payload = vehicle.id ? { ...row, id: vehicle.id } : { ...row };
    let saved = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const q = vehicle.id
        ? supabaseAdmin.from('vehicles').upsert(payload).select().single()
        : supabaseAdmin.from('vehicles').insert(payload).select().single();
      const { data, error: dbErr } = await q;
      if (!dbErr) { saved = data; break; }
      // 未定義カラムのエラーなら、その列名を特定して除去し再試行
      const msg = dbErr.message || '';
      const m =
        /column "?([a-zA-Z0-9_]+)"? of relation/.exec(msg) ||
        /column "?vehicles\.([a-zA-Z0-9_]+)"? does not exist/.exec(msg) ||
        /Could not find the '([a-zA-Z0-9_]+)' column/.exec(msg) ||
        /column "?([a-zA-Z0-9_]+)"? does not exist/.exec(msg);
      if (m && m[1] && Object.prototype.hasOwnProperty.call(payload, m[1])) {
        delete payload[m[1]];
        continue;
      }
      throw new Error(`DB error: ${msg}`);
    }
    if (!saved) throw new Error('DB error: could not save vehicle');

    return NextResponse.json(saved, { status: 201 });
  } catch (e) {
    console.error('[POST /api/vehicles]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function buildAirportFees(v) {
  const fees = {};
  Object.keys(v).forEach(k => {
    const m = k.match(/^airportFee_([A-Z]{3})$/);
    if (m && v[k]) fees[m[1]] = Number(v[k]);
  });
  return fees;
}