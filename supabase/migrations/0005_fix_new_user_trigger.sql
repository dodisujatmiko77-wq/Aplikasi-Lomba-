-- =====================================================================
-- 0005 — PERBAIKAN: "Database error creating new user" di Supabase
-- Penyebab: trigger on_auth_user_created membutuhkan baris role 'admin' (dari seed.sql).
-- Bila seed belum dijalankan, INSERT profil gagal dan pembuatan user Auth ikut gagal.
-- Aman dijalankan berulang (idempoten), juga pada proyek yang sudah berjalan.
-- =====================================================================
insert into public.roles (key, name, description) values
  ('superadmin', 'Superadmin', 'Kontrol penuh terhadap aplikasi'),
  ('admin', 'Admin', 'Mengelola event yang ditugaskan oleh Superadmin')
on conflict (key) do nothing;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into public.roles (key, name) values ('admin', 'Admin') on conflict (key) do nothing;
    insert into public.profiles (id, role_id, full_name, email, is_active)
    values (new.id, (select id from public.roles where key = 'admin'),
            coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email, false)
    on conflict (id) do nothing;
  exception when others then
    -- Pembuatan akun Auth tidak boleh diblokir oleh profil; bootstrap_superadmin akan membuat profil bila belum ada.
    raise warning 'handle_new_user gagal untuk %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

-- Profil untuk akun yang sudah terlanjur dibuat tanpa profil.
insert into public.profiles (id, role_id, full_name, email, is_active)
select u.id, (select id from public.roles where key = 'admin'), coalesce(u.raw_user_meta_data ->> 'full_name', ''), u.email, false
from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
