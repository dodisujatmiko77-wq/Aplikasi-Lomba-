-- =====================================================================
-- KOSONGKAN DATA UJI COBA — Lomba Rangking 1
-- Jalankan di: Supabase > SQL Editor > New query > tempel seluruh isi > Run
--
-- DIHAPUS PERMANEN (tidak bisa dibatalkan):
--   event + pengaturan event + penugasan admin ke event, peserta (kode, PIN, sesi login,
--   kunci perangkat), bank soal + opsi, paket soal, sesi kompetisi, babak, soal tayang,
--   jawaban peserta, skor, klasemen/live skor, hasil perlombaan, laporan, pengumuman,
--   dan catatan pembatas laju (rate limit).
--
-- DIPERTAHANKAN:
--   akun Superadmin/Admin (profiles) dan role, Data Kecamatan, Data Jenjang,
--   kategori soal, pengaturan global/branding (app_settings), Audit Log (lihat opsi di bawah).
--
-- Seluruhnya berjalan dalam SATU transaksi: bila ada error, tidak ada yang terhapus.
-- =====================================================================

-- 1) Hitungan SEBELUM (hanya untuk dilihat)
select 'events' as tabel, count(*) from public.events
union all select 'participants', count(*) from public.participants
union all select 'questions', count(*) from public.questions
union all select 'question_packages', count(*) from public.question_packages
union all select 'competition_sessions', count(*) from public.competition_sessions
union all select 'participant_answers', count(*) from public.participant_answers
union all select 'scores', count(*) from public.scores
union all select 'profiles (dipertahankan)', count(*) from public.profiles
union all select 'districts (dipertahankan)', count(*) from public.districts;

begin;

-- 2) Hapus. CASCADE ikut mengosongkan semua tabel turunan
--    (event_settings, admin_assignments, event_participants, questions, question_options,
--     question_packages, package_questions, competition_sessions, session_participants,
--     competition_rounds, competition_questions, participant_answers, scores, leaderboards,
--     announcements, participant_credentials, participant_sessions).
truncate table public.events, public.participants restart identity cascade;
truncate table public.rate_limits;

-- OPSIONAL — hapus juga Audit Log (riwayat tindakan admin/operator). Hilangkan tanda "--" untuk menjalankan.
-- truncate table public.audit_logs;

commit;

-- 3) Hitungan SESUDAH (semua yang dihapus harus 0; yang dipertahankan tetap)
select 'events' as tabel, count(*) from public.events
union all select 'event_settings', count(*) from public.event_settings
union all select 'admin_assignments', count(*) from public.admin_assignments
union all select 'participants', count(*) from public.participants
union all select 'participant_credentials', count(*) from public.participant_credentials
union all select 'participant_sessions', count(*) from public.participant_sessions
union all select 'event_participants', count(*) from public.event_participants
union all select 'questions', count(*) from public.questions
union all select 'question_options', count(*) from public.question_options
union all select 'question_packages', count(*) from public.question_packages
union all select 'competition_sessions', count(*) from public.competition_sessions
union all select 'competition_rounds', count(*) from public.competition_rounds
union all select 'competition_questions', count(*) from public.competition_questions
union all select 'participant_answers', count(*) from public.participant_answers
union all select 'scores', count(*) from public.scores
union all select 'leaderboards', count(*) from public.leaderboards
union all select 'announcements', count(*) from public.announcements
union all select 'profiles (dipertahankan)', count(*) from public.profiles
union all select 'districts (dipertahankan)', count(*) from public.districts
union all select 'education_levels (dipertahankan)', count(*) from public.education_levels
union all select 'audit_logs', count(*) from public.audit_logs;
