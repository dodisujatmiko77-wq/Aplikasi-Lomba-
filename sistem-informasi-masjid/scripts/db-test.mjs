// Uji keamanan database (RLS, trigger, RPC) pada PostgreSQL lokal.
//   scripts/pg-local.sh start && npm run test:db
import { resetDatabase, makeApi } from './harness.mjs'

const su = await resetDatabase()
const api = makeApi()
let pass = 0, fail = 0
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : '  ← GAGAL ' + extra}`) }
const denied = async (name, fn) => {
  try {
    const r = await fn()
    ok(name, r.rowCount === 0, `(${r.rowCount} baris terpengaruh)`)
  } catch (e) { ok(name, ['42501', '23514'].includes(e.code), e.message) }
}
const rows = async (who, q, p) => (await api.sql(who, q, p)).rows
const newUser = async (email) => (await su.query(`insert into auth.users (email, password, raw_user_meta_data) values ($1, 'x', '{"full_name":"Uji"}') returning id`, [email])).rows[0].id

console.log('Penyiapan & bootstrap')
const mosque = (await su.query(`select id from mosque_profiles`)).rows[0].id
ok('seed membuat 1 masjid + pengaturan + layar utama', (await su.query(`select (select count(*) from prayer_schedules) + (select count(*) from display_settings) + (select count(*) from display_devices) n`)).rows[0].n === '3')
ok('has_users() = false sebelum ada akun', (await rows(null, `select has_users() v`))[0].v === false)
const superId = await newUser('super@uji.local')
const adminId = await newUser('admin@uji.local')
const opId = await newUser('operator@uji.local')
const u = Object.fromEntries((await su.query(`select email, role, is_active from users`)).rows.map((r) => [r.email, r]))
ok('akun pertama otomatis Super Admin aktif', u['super@uji.local'].role === 'super_admin' && u['super@uji.local'].is_active)
ok('akun berikutnya operator NONAKTIF', u['admin@uji.local'].role === 'operator' && !u['admin@uji.local'].is_active && !u['operator@uji.local'].is_active)

console.log('Pengguna')
await denied('akun nonaktif tidak bisa menulis pengumuman', () => api.sql(opId, `insert into announcements (mosque_id, title) values ($1, 'coba')`, [mosque]))
await denied('pengguna tidak bisa menaikkan perannya sendiri', () => api.sql(opId, `update users set role = 'super_admin', is_active = true where id = $1`, [opId]))
await api.sql(superId, `update users set role = 'admin_masjid', is_active = true where id = $1`, [adminId])
await api.sql(superId, `update users set is_active = true where id = $1`, [opId])
ok('Super Admin mengaktifkan & menetapkan peran', (await su.query(`select count(*) n from users where is_active`)).rows[0].n === '3')
ok('operator hanya melihat profilnya sendiri', (await rows(opId, `select * from users`)).length === 1)
ok('Super Admin melihat semua pengguna', (await rows(superId, `select * from users`)).length === 3)
await denied('anon tidak bisa membaca tabel users', () => api.sql(null, `select * from users`))
await denied('Admin Masjid tidak bisa mengubah peran orang lain', () => api.sql(adminId, `update users set role = 'admin_masjid' where id = $1`, [opId]))
await denied('Super Admin terakhir tidak bisa menurunkan dirinya', () => api.sql(superId, `update users set role = 'operator' where id = $1`, [superId]))
await denied('operator tidak bisa menghapus pengguna', () => api.sql(opId, `select admin_delete_user($1)`, [adminId]))

console.log('Konten (operator boleh, anon hanya membaca yang aktif)')
await api.sql(opId, `insert into announcements (mosque_id, title, is_active) values ($1, 'Aktif', true), ($1, 'Disembunyikan', false)`, [mosque])
ok('anon hanya melihat pengumuman aktif', (await rows(null, `select * from announcements`)).length === 1)
ok('staf melihat semua pengumuman', (await rows(opId, `select * from announcements`)).length === 2)
await denied('anon tidak bisa menambah pengumuman', () => api.sql(null, `insert into announcements (mosque_id, title) values ($1, 'spam')`, [mosque]))
await denied('anon tidak bisa menghapus pengumuman', () => api.sql(null, `delete from announcements`))
await api.sql(opId, `insert into mosque_events (mosque_id, name, is_routine, weekday, start_time) values ($1, 'Kajian Ahad', true, 0, '05:30')`, [mosque])
await api.sql(opId, `insert into islamic_contents (mosque_id, translation, source) values ($1, 'Teks uji', 'Sumber')`, [mosque])
await api.sql(opId, `insert into slideshow_contents (mosque_id, title, media_type, media_url) values ($1, 'Poster', 'image', 'http://x/y.png')`, [mosque])
ok('operator mengelola kegiatan, ayat, slideshow', true)
try { await su.query(`insert into mosque_events (mosque_id, name, is_routine, start_time) values ($1, 'Tanpa tanggal', false, '10:00')`, [mosque]); ok('kegiatan tanpa tanggal ditolak', false) } catch (e) { ok('kegiatan tanpa tanggal ditolak (check constraint)', e.code === '23514') }

console.log('Pengaturan (hanya pengelola)')
await denied('operator tidak bisa mengubah profil masjid', () => api.sql(opId, `update mosque_profiles set name = 'Diretas'`))
await denied('operator tidak bisa mengubah jadwal salat', () => api.sql(opId, `update prayer_schedules set timezone = 'WIT'`))
await denied('operator tidak bisa mengubah pengaturan display', () => api.sql(opId, `update display_settings set theme = 'light'`))
await denied('anon tidak bisa mengubah pengaturan display', () => api.sql(null, `update display_settings set theme = 'light'`))
await denied('operator tidak bisa menambah rekening donasi', () => api.sql(opId, `insert into donation_accounts (mosque_id, account_number) values ($1, '123')`, [mosque]))
ok('Admin Masjid mengubah profil', (await api.sql(adminId, `update mosque_profiles set name = 'Masjid Uji'`)).rowCount === 1)
ok('Admin Masjid mengubah jadwal salat', (await api.sql(adminId, `update prayer_schedules set timezone = 'WITA'`)).rowCount === 1)
ok('anon membaca profil, jadwal, dan pengaturan', (await rows(null, `select m.name from mosque_profiles m join prayer_schedules p on p.mosque_id = m.id join display_settings d on d.mosque_id = m.id`))[0].name === 'Masjid Uji')

console.log('Keuangan (rahasia)')
await api.sql(adminId, `insert into financial_transactions (mosque_id, type, category, amount) values ($1, 'income', 'Infak Jumat', 1500000), ($1, 'expense', 'Listrik & Air', 400000)`, [mosque])
await denied('anon tidak bisa membaca transaksi', () => api.sql(null, `select * from financial_transactions`))
ok('operator tidak melihat satu pun transaksi', (await rows(opId, `select * from financial_transactions`)).length === 0)
await denied('operator tidak bisa mencatat transaksi', () => api.sql(opId, `insert into financial_transactions (mosque_id, type, category, amount) values ($1, 'income', 'Infak', 1)`, [mosque]))
ok('ringkasan keuangan tertutup bagi anon bila slide keuangan nonaktif', (await rows(null, `select get_finance_summary($1) v`, [mosque]))[0].v === null)
ok('operator juga tidak mendapat ringkasan', (await rows(opId, `select get_finance_summary($1) v`, [mosque]))[0].v === null)
const sum = (await rows(adminId, `select get_finance_summary($1) v`, [mosque]))[0].v
ok('pengelola mendapat ringkasan yang benar (saldo 1.100.000)', Number(sum.balance) === 1100000 && Number(sum.week_infak) === 1500000 && sum.monthly.length === 6, JSON.stringify(sum))
await api.sql(adminId, `update display_settings set show_slide_finance = true`)
const pub = (await rows(null, `select get_finance_summary($1) v`, [mosque]))[0].v
ok('setelah diaktifkan admin, anon hanya mendapat agregat', Number(pub.balance) === 1100000 && !('transactions' in pub))
try { await su.query(`insert into financial_transactions (mosque_id, type, category, amount) values ($1, 'income', 'Infak', -5)`, [mosque]); ok('jumlah negatif ditolak', false) } catch (e) { ok('jumlah negatif ditolak (check constraint)', e.code === '23514') }

console.log('Perangkat display & sinkronisasi')
await denied('anon tidak bisa membaca daftar perangkat', () => api.sql(null, `select * from display_devices`))
const v0 = Number((await su.query(`select data_version from display_settings`)).rows[0].data_version)
const hb = (await rows(null, `select display_heartbeat('UTAMA', '1920x1080') v`))[0].v
ok('heartbeat anon mengenali kode layar (tanpa peka huruf besar)', hb?.code === 'utama' && hb.mosque_id === mosque)
ok('heartbeat mencatat last_seen_at', (await su.query(`select last_seen_at is not null and screen_info = '1920x1080' v from display_devices`)).rows[0].v)
ok('heartbeat TIDAK memicu sinkronisasi', Number((await su.query(`select data_version from display_settings`)).rows[0].data_version) === v0)
ok('kode tidak dikenal → null', (await rows(null, `select display_heartbeat('tidak-ada') v`))[0].v === null)
await api.sql(opId, `update announcements set title = 'Diubah' where title = 'Aktif'`)
const v1 = Number((await su.query(`select data_version from display_settings`)).rows[0].data_version)
ok('perubahan pengumuman menaikkan data_version', v1 === v0 + 1)
await api.sql(adminId, `insert into financial_transactions (mosque_id, type, category, amount) values ($1, 'income', 'Sedekah', 1000)`, [mosque])
await api.sql(adminId, `update mosque_profiles set address = 'Jl. Uji'`)
await api.sql(adminId, `update display_settings set theme = 'light'`)
await api.sql(adminId, `insert into display_devices (mosque_id, name, code) values ($1, 'TV Serambi', 'serambi')`, [mosque])
ok('keuangan, profil, pengaturan, dan perangkat ikut memicu sinkronisasi', Number((await su.query(`select data_version from display_settings`)).rows[0].data_version) === v1 + 4)
await denied('operator tidak bisa menambah perangkat', () => api.sql(opId, `insert into display_devices (mosque_id, name, code) values ($1, 'TV Liar', 'liar')`, [mosque]))

console.log('Storage')
await denied('anon tidak bisa mengunggah', () => api.sql(null, `insert into storage.objects (bucket_id, name) values ('media', $1)`, [`${mosque}/slides/a.png`]))
ok('staf mengunggah ke folder masjidnya', (await api.sql(opId, `insert into storage.objects (bucket_id, name) values ('media', $1)`, [`${mosque}/slides/a.png`])).rowCount === 1)
await denied('staf tidak bisa mengunggah ke folder masjid lain', () => api.sql(opId, `insert into storage.objects (bucket_id, name) values ('media', '00000000-0000-0000-0000-000000000000/slides/a.png')`))
ok('publik dapat membaca berkas media', (await rows(null, `select * from storage.objects`)).length === 1)

console.log('Hapus pengguna')
await api.sql(superId, `select admin_delete_user($1)`, [opId])
ok('Super Admin menghapus pengguna (profil + akun auth)', (await su.query(`select (select count(*) from users where id = $1) + (select count(*) from auth.users where id = $1) n`, [opId])).rows[0].n === '0')
await denied('Super Admin tidak bisa menghapus dirinya sendiri', () => api.sql(superId, `select admin_delete_user($1)`, [superId]))

console.log(`\n${pass} lulus, ${fail} gagal`)
await api.pool.end()
await su.end()
process.exit(fail ? 1 : 0)
