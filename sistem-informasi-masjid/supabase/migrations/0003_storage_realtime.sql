-- =====================================================================
-- SISTEM INFORMASI MASJID — 0003: Storage (logo, poster, foto, video, QRIS) & Realtime
-- =====================================================================

-- Bucket publik "media": berkas dapat ditampilkan layar TV tanpa login.
-- Struktur path: <mosque_id>/<folder>/<nama-berkas>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'video/mp4', 'video/webm'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media_public_read"  on storage.objects;
drop policy if exists "media_staff_insert" on storage.objects;
drop policy if exists "media_staff_update" on storage.objects;
drop policy if exists "media_staff_delete" on storage.objects;

create policy "media_public_read" on storage.objects for select
  using (bucket_id = 'media');

-- Hanya staf aktif yang boleh mengunggah, dan hanya ke folder masjidnya sendiri.
create policy "media_staff_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.staff_of(((storage.foldername(name))[1])::uuid));

create policy "media_staff_update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.staff_of(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'media' and public.staff_of(((storage.foldername(name))[1])::uuid));

create policy "media_staff_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.staff_of(((storage.foldername(name))[1])::uuid));

-- Realtime: layar TV berlangganan pada display_settings (sinyal data_version).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'display_settings') then
    alter publication supabase_realtime add table public.display_settings;
  end if;
end $$;
