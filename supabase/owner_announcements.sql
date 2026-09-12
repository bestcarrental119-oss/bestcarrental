-- ============================================================
-- オーナー向け「一斉お知らせ」機能  (Supabase SQL Editor で1回実行)
--   owner_announcements       : 管理者/マスターが作成するお知らせ
--   owner_announcement_reads  : オーナーごとの既読管理
-- APIはサービスロールで動作するためRLSはバイパスされます。
-- 念のためRLSを有効化し、オーナー本人が読める/既読を書ける最小ポリシーも付与。
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.owner_announcements (
  id                uuid primary key default gen_random_uuid(),
  title             text,
  body              text not null,
  created_by        uuid,
  created_by_email  text,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create table if not exists public.owner_announcement_reads (
  announcement_id   uuid not null references public.owner_announcements(id) on delete cascade,
  user_id           uuid not null,
  read_at           timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists idx_owner_ann_active_created
  on public.owner_announcements (active, created_at desc);
create index if not exists idx_owner_ann_reads_user
  on public.owner_announcement_reads (user_id);

alter table public.owner_announcements      enable row level security;
alter table public.owner_announcement_reads enable row level security;

-- 認証ユーザーは有効なお知らせを読める
drop policy if exists "read active announcements" on public.owner_announcements;
create policy "read active announcements" on public.owner_announcements
  for select to authenticated using (active = true);

-- 自分の既読だけ読める / 書ける
drop policy if exists "read own reads" on public.owner_announcement_reads;
create policy "read own reads" on public.owner_announcement_reads
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "insert own reads" on public.owner_announcement_reads;
create policy "insert own reads" on public.owner_announcement_reads
  for insert to authenticated with check (auth.uid() = user_id);
