-- 0006 — Pisahkan "Penyelenggara lomba" (PGRI Kab. Way Kanan) dari "Produk" (UPT SMPN 1 Baradatu).
-- Idempoten. Aman dijalankan pada proyek yang sudah berisi data.
update public.app_settings
   set value = value || jsonb_build_object('organizer', 'PGRI Kabupaten Way Kanan', 'product_owner', 'UPT SMPN 1 Baradatu')
 where key = 'branding';

-- Event yang masih memakai UPT SMPN 1 Baradatu sebagai penyelenggara (nilai bawaan lama).
update public.events set organizer = 'PGRI Kabupaten Way Kanan' where organizer = 'UPT SMPN 1 Baradatu';
