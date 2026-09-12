/**
 * Supabase clients
 *
 * - supabase      : anon key — safe to use in browser (respects RLS)
 * - supabaseAdmin : service role key — server-side only, bypasses RLS
 */
import { createClient } from '@supabase/supabase-js';

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const fallbackUrl = 'https://placeholder.supabase.co';
const fallbackAnon = 'placeholder-anon-key';

if (!url || !anon) {
  console.warn('[supabase] NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set');
}

// ── Browser / server (anon key, respects Row Level Security) ────
export const supabase = createClient(url || fallbackUrl, anon || fallbackAnon);

// ── Server only (service role, bypasses RLS) ─────────────────────
export const supabaseAdmin = svc
  ? createClient(url || fallbackUrl, svc, { auth: { persistSession: false } })
  : null;
