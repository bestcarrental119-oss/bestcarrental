/**
 * GET /api/cron/purge-pickup-records
 *
 * Deletes owner pickup (IDP) records whose retention window has passed
 * (purge_after < now = 30 days after the reservation's return date). This keeps
 * sensitive documents only as long as needed. Schedule daily via Vercel Cron.
 * Protected by CRON_SECRET.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase';
import { removeObjects, BUCKET_HANDOVER, BUCKET_IDP } from '../../../../lib/storage';

export async function GET(req) {
  const secret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const now = new Date().toISOString();
  // Fetch the rows first so we can also delete their Storage objects (photos +
  // IDP images), otherwise the files would be orphaned in the bucket.
  const { data: dueRows, error: fetchErr } = await supabaseAdmin
    .from('owner_pickup_records')
    .select('id, photos, documents')
    .lt('purge_after', now);
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const handoverPaths = [];
  const idpPaths = [];
  for (const r of dueRows ?? []) {
    (Array.isArray(r.photos) ? r.photos : []).forEach(p => p?.path && handoverPaths.push(p.path));
    Object.values(r.documents ?? {}).forEach(v => v?.path && idpPaths.push(v.path));
  }
  await removeObjects(BUCKET_HANDOVER, handoverPaths);
  await removeObjects(BUCKET_IDP, idpPaths);

  const { data, error } = await supabaseAdmin
    .from('owner_pickup_records')
    .delete()
    .lt('purge_after', now)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purged: data?.length ?? 0, filesRemoved: handoverPaths.length + idpPaths.length });
}
