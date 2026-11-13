-- =====================================================================
-- LOMBA RANGKING 1 — SEED DATA
-- Aman dijalankan berulang. TIDAK membuat akun/kredensial apa pun.
-- Superadmin pertama dibuat lewat prosedur bootstrap (lihat docs/DEPLOYMENT.md):
--   1. Supabase Dashboard > Authentication > Users > Add user (email + password, Auto Confirm)
--   2. SQL Editor:  select public.bootstrap_superadmin('email-anda@contoh.id');
-- =====================================================================

insert into public.roles (key, name, description) values
  ('superadmin', 'Superadmin', 'Kontrol penuh terhadap aplikasi'),
  ('admin', 'Admin', 'Mengelola event yang ditugaskan oleh Superadmin')
on conflict (key) do nothing;

insert into public.education_levels (code, name, sort_order) values
  ('SD', 'SD', 1), ('SMP', 'SMP', 2), ('SMA', 'SMA/SMK', 3)
on conflict (code) do nothing;

-- 15 kecamatan (Kabupaten Way Kanan). Dapat diubah/ditambah dari menu Data Kecamatan.
insert into public.districts (name, code, sort_order) values
  ('Bahuga', 'BHG', 1), ('Banjit', 'BJT', 2), ('Baradatu', 'BRD', 3), ('Blambangan Umpu', 'BBU', 4),
  ('Buay Bahuga', 'BBG', 5), ('Bumi Agung', 'BMA', 6), ('Gunung Labuhan', 'GLB', 7), ('Kasui', 'KSI', 8),
  ('Negara Batin', 'NGB', 9), ('Negeri Agung', 'NGA', 10), ('Negeri Besar', 'NGS', 11), ('Pakuan Ratu', 'PKR', 12),
  ('Rebang Tangkas', 'RBT', 13), ('Umpu Semenguk', 'UMS', 14), ('Way Tuba', 'WTB', 15)
on conflict (name) do nothing;

insert into public.app_settings (key, value, is_public) values
  ('branding', jsonb_build_object(
     'app_name', 'Lomba Rangking 1',
     'tagline', 'Siapa Cepat, Siapa Tepat, Dialah Juara!',
     'organizer', 'UPT SMPN 1 Baradatu',
     'developer', 'Dodi Sujatmiko',
     'logo_url', null,
     'description', 'Platform kompetisi Rangking 1 yang menentukan juara dari kombinasi kecepatan dan ketepatan menjawab. Peserta menjawab lewat HP masing-masing, skor dihitung server, dan klasemen tampil langsung di layar utama.'), true),
  ('default_scoring', jsonb_build_object(
     'base_points', 100, 'speed_bonus', 50, 'wrong_penalty', 0, 'duration_seconds', 20,
     'lead_seconds', 3, 'rounding_mode', 'round', 'rounding_decimals', 2), false)
on conflict (key) do nothing;

insert into public.question_categories (name) values
  ('Pengetahuan Umum'), ('Matematika'), ('IPA'), ('IPS'), ('Bahasa Indonesia'), ('Bahasa Inggris'), ('PPKn')
on conflict (name) do nothing;

-- Contoh event + contoh soal (hanya bila belum ada event sama sekali)
do $$
declare v_event uuid; v_smp uuid; v_pkg uuid; v_q uuid; v_cat uuid; v_i int := 0;
  v_rows jsonb := '[
    {"t":"multiple_choice","c":"Pengetahuan Umum","q":"Ibu kota Provinsi Lampung adalah …","o":["Bandar Lampung","Metro","Kotabumi","Liwa"],"k":0},
    {"t":"multiple_choice","c":"Matematika","q":"Hasil dari 12 × 12 adalah …","o":["124","144","164","122"],"k":1},
    {"t":"multiple_choice","c":"IPA","q":"Planet terbesar di tata surya adalah …","o":["Saturnus","Bumi","Jupiter","Neptunus"],"k":2},
    {"t":"multiple_choice","c":"IPS","q":"Proklamasi kemerdekaan Indonesia dibacakan pada tanggal …","o":["17 Agustus 1945","1 Juni 1945","28 Oktober 1928","10 November 1945"],"k":0},
    {"t":"multiple_choice","c":"PPKn","q":"Sila ketiga Pancasila berbunyi …","o":["Ketuhanan Yang Maha Esa","Kemanusiaan yang adil dan beradab","Persatuan Indonesia","Keadilan sosial bagi seluruh rakyat Indonesia"],"k":2},
    {"t":"multiple_choice","c":"IPA","q":"Proses tumbuhan membuat makanan dengan bantuan cahaya matahari disebut …","o":["Respirasi","Fotosintesis","Transpirasi","Fermentasi"],"k":1},
    {"t":"multiple_choice","c":"Bahasa Inggris","q":"The opposite of \"difficult\" is …","o":["hard","easy","heavy","far"],"k":1},
    {"t":"true_false","c":"IPA","q":"Air mendidih pada suhu 100 °C di permukaan laut.","o":["Benar","Salah"],"k":0},
    {"t":"true_false","c":"Pengetahuan Umum","q":"Kabupaten Way Kanan berada di Provinsi Sumatera Selatan.","o":["Benar","Salah"],"k":1},
    {"t":"short_answer","c":"Matematika","q":"Berapakah akar kuadrat dari 81?","o":["9","sembilan"],"k":0},
    {"t":"short_answer","c":"Pengetahuan Umum","q":"Siapakah presiden pertama Republik Indonesia?","o":["Soekarno","Sukarno","Ir. Soekarno","Ir Soekarno"],"k":0},
    {"t":"short_answer","c":"IPS","q":"Benua terluas di dunia adalah …","o":["Asia"],"k":0}
  ]'::jsonb;
  v_row jsonb; v_o text; v_j int;
begin
  if exists (select 1 from public.events) then return; end if;
  select id into v_smp from public.education_levels where code = 'SMP';

  insert into public.events (name, description, location, organizer, start_date, status, is_public)
  values ('Lomba Rangking 1 Tingkat Kabupaten',
          'Lomba cerdas cermat format Rangking 1 untuk jenjang SD, SMP, dan SMA/SMK. Setiap kecamatan mengirim 3 peserta per jenjang.',
          'Aula UPT SMPN 1 Baradatu', 'UPT SMPN 1 Baradatu', current_date + 14, 'published', true)
  returning id into v_event;

  insert into public.question_packages (event_id, education_level_id, name, description)
  values (v_event, v_smp, 'Paket Contoh', 'Paket contoh untuk uji coba sistem') returning id into v_pkg;

  for v_row in select * from jsonb_array_elements(v_rows) loop
    v_i := v_i + 1;
    select id into v_cat from public.question_categories where name = v_row ->> 'c';
    insert into public.questions (event_id, category_id, education_level_id, type, question_text)
    values (v_event, v_cat, v_smp, v_row ->> 't', v_row ->> 'q') returning id into v_q;
    v_j := 0;
    for v_o in select jsonb_array_elements_text(v_row -> 'o') loop
      insert into public.question_options (question_id, option_text, is_correct, sort_order)
      values (v_q, v_o, (v_row ->> 't') = 'short_answer' or v_j = (v_row ->> 'k')::int, v_j + 1);
      v_j := v_j + 1;
    end loop;
    insert into public.package_questions (package_id, question_id, sort_order) values (v_pkg, v_q, v_i);
  end loop;

  insert into public.announcements (event_id, type, title, body, is_published)
  values (v_event, 'schedule', 'Technical meeting & registrasi ulang',
          'Peserta hadir 60 menit sebelum lomba dimulai untuk registrasi ulang dan uji coba perangkat.', true);
end $$;
