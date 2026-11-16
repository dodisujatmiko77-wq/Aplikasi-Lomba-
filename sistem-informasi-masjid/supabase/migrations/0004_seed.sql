-- =====================================================================
-- SISTEM INFORMASI MASJID — 0004: Data awal
-- =====================================================================
-- Membuat SATU profil masjid kosong (nama & alamat diisi lewat menu Admin > Profil Masjid)
-- beserta pengaturan bawaan, satu layar utama (kode: utama), dan kumpulan ayat & hadis
-- pembuka yang dapat diubah/ditambah lewat menu Admin > Ayat & Hadis.
-- Aman dijalankan ulang: tidak melakukan apa pun bila profil masjid sudah ada.

do $$
declare v_id uuid;
begin
  if exists (select 1 from public.mosque_profiles) then
    return;
  end if;

  insert into public.mosque_profiles (name, address)
  values ('Masjid Kami', 'Lengkapi nama dan alamat masjid melalui halaman Admin')
  returning id into v_id;

  insert into public.islamic_contents (mosque_id, type, arabic_text, translation, source) values
    (v_id, 'ayat', 'وَأَقِيمُوا الصَّلَاةَ وَآتُوا الزَّكَاةَ وَارْكَعُوا مَعَ الرَّاكِعِينَ',
     'Dan dirikanlah salat, tunaikanlah zakat, dan rukuklah beserta orang-orang yang rukuk.', 'QS. Al-Baqarah: 43'),
    (v_id, 'ayat', 'إِنَّمَا يَعْمُرُ مَسَاجِدَ اللَّهِ مَنْ آمَنَ بِاللَّهِ وَالْيَوْمِ الْآخِرِ',
     'Sesungguhnya yang memakmurkan masjid-masjid Allah hanyalah orang yang beriman kepada Allah dan hari kemudian.', 'QS. At-Taubah: 18'),
    (v_id, 'ayat', 'أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ',
     'Ingatlah, hanya dengan mengingat Allah hati menjadi tenteram.', 'QS. Ar-Ra''d: 28'),
    (v_id, 'ayat', 'إِنَّ الصَّلَاةَ تَنْهَىٰ عَنِ الْفَحْشَاءِ وَالْمُنكَرِ',
     'Sesungguhnya salat itu mencegah dari perbuatan keji dan mungkar.', 'QS. Al-''Ankabut: 45'),
    (v_id, 'ayat', 'فَإِنَّ مَعَ الْعُسْرِ يُسْرًا',
     'Maka sesungguhnya bersama kesulitan ada kemudahan.', 'QS. Asy-Syarh: 5'),
    (v_id, 'ayat', 'لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ',
     'Sesungguhnya jika kamu bersyukur, niscaya Aku akan menambah (nikmat) kepadamu.', 'QS. Ibrahim: 7'),
    (v_id, 'hadis', 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ',
     'Sesungguhnya setiap amal itu bergantung pada niatnya.', 'HR. Bukhari dan Muslim'),
    (v_id, 'hadis', 'خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ',
     'Sebaik-baik kalian adalah orang yang mempelajari Al-Qur''an dan mengajarkannya.', 'HR. Bukhari'),
    (v_id, 'hadis', 'صَلَاةُ الْجَمَاعَةِ أَفْضَلُ مِنْ صَلَاةِ الْفَذِّ بِسَبْعٍ وَعِشْرِينَ دَرَجَةً',
     'Salat berjamaah lebih utama dua puluh tujuh derajat daripada salat sendirian.', 'HR. Bukhari dan Muslim'),
    (v_id, 'hadis', 'الطُّهُورُ شَطْرُ الْإِيمَانِ',
     'Kesucian (kebersihan) itu sebagian dari iman.', 'HR. Muslim'),
    (v_id, 'hadis', 'مَا نَقَصَتْ صَدَقَةٌ مِنْ مَالٍ',
     'Sedekah tidak akan mengurangi harta.', 'HR. Muslim'),
    (v_id, 'hadis', 'مَنْ بَنَى مَسْجِدًا لِلَّهِ بَنَى اللَّهُ لَهُ فِي الْجَنَّةِ مِثْلَهُ',
     'Barang siapa membangun masjid karena Allah, niscaya Allah membangunkan baginya yang semisal di surga.', 'HR. Muslim');
end $$;
