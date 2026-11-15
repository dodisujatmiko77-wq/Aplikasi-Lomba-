-- 0008 — Tempat berkas APK untuk diunduh peserta lewat alamat situs sendiri
-- (https://<situs>/Lomba-Rangking-1.apk diteruskan ke bucket publik ini, sehingga alamat GitHub tidak perlu dibagikan).
-- Bucket publik hanya-baca; tidak ada kebijakan unggah untuk peserta/admin (unggah lewat Dashboard Supabase atau kunci service_role).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('apk', 'apk', true, 52428800, array['application/vnd.android.package-archive', 'application/octet-stream'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
