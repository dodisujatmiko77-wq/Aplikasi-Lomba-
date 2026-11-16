-- Menghapus SELURUH Audit Log (riwayat tindakan admin/operator). Tidak bisa dibatalkan.
-- Jalankan di Supabase > SQL Editor. Data lain tidak tersentuh.
select count(*) as jumlah_audit_sebelum from public.audit_logs;

begin;
truncate table public.audit_logs restart identity;
commit;

select count(*) as jumlah_audit_sesudah from public.audit_logs;
