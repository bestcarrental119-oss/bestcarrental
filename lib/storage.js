/**
 * Server-side Supabase Storage helpers.
 *
 * Sensitive images (handover photos, IDP / licence / passport scans) are kept
 * in object storage, NOT in the database. The DB only holds the storage path;
 * the app serves images through short-lived signed URLs. This keeps the
 * database tiny and lets us delete the files on a retention schedule.
 */
import { supabaseAdmin } from './supabase';

export const BUCKET_HANDOVER = 'handover-photos';
export const BUCKET_IDP = 'idp-docs';

export function parseDataUrl(dataUrl) {
  const m = /^data:(.+?);base64,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  return { contentType: m[1] || 'application/octet-stream', buffer: Buffer.from(m[2], 'base64') };
}

export function extFor(contentType = '') {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.includes('webp')) return 'webp';
  return 'jpg';
}

/** Upload a data-URL to a bucket at `path`. Returns the path, or null on failure. */
export async function uploadDataUrl(bucket, path, dataUrl) {
  if (!supabaseAdmin) return null;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, parsed.buffer, { contentType: parsed.contentType, upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

/** Create a short-lived signed URL for a stored object. */
export async function signUrl(bucket, path, seconds = 3600) {
  if (!supabaseAdmin || !path) return null;
  try {
    const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, seconds);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/** Best-effort delete of objects (ignores errors). */
export async function removeObjects(bucket, paths = []) {
  if (!supabaseAdmin || !paths.length) return;
  try { await supabaseAdmin.storage.from(bucket).remove(paths); } catch { /* ignore */ }
}
