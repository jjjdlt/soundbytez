-- soundbytez: per-user tracks + stem storage.
-- Run once in the Supabase dashboard → SQL Editor (or `supabase db push` with the CLI).
--
-- Write path: the backend (secret/service-role key, bypasses RLS) inserts and
-- updates rows and uploads stem files. Read/delete path: the browser, as the
-- signed-in user, limited by the RLS policies below to that user's own data.

-- ---------------------------------------------------------------- tracks table
create table if not exists public.tracks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  type        text not null default 'stem_separation',   -- later: midi_transcription, lyric_alignment
  name        text not null,                             -- original upload filename
  status      text not null default 'processing'
              check (status in ('processing', 'done', 'error')),
  error       text,
  job_id      text,                                      -- backend job, for live progress while processing
  stems       jsonb not null default '[]'::jsonb,        -- [{ "name": "vocals", "path": "<uid>/<track>/vocals.flac", "size": 123 }]
  size_bytes  bigint not null default 0,                 -- total bytes stored for this track
  created_at  timestamptz not null default now()
);

create index if not exists tracks_user_created_idx on public.tracks (user_id, created_at desc);

alter table public.tracks enable row level security;

drop policy if exists "read own tracks" on public.tracks;
create policy "read own tracks" on public.tracks
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "delete own tracks" on public.tracks;
create policy "delete own tracks" on public.tracks
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update policies on purpose: only the backend writes rows.

-- ---------------------------------------------------------------- stems bucket
-- Private bucket; files live at <user_id>/<track_id>/<stem>.flac
-- 50 MB per-file cap matches the free-tier limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stems', 'stems', false, 52428800, array['audio/flac'])
on conflict (id) do nothing;

drop policy if exists "read own stems" on storage.objects;
create policy "read own stems" on storage.objects
  for select to authenticated
  using (bucket_id = 'stems' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "delete own stems" on storage.objects;
create policy "delete own stems" on storage.objects
  for delete to authenticated
  using (bucket_id = 'stems' and (storage.foldername(name))[1] = (select auth.uid())::text);
