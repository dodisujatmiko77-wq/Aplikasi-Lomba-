// Pembuat presentasi untuk panitia — Lomba Rangking 1.
// Prasyarat (di folder sementara mana pun): npm i pptxgenjs react-icons react react-dom sharp
// Jalankan:  PPT_MODULES=<folder>/node_modules node docs/presentasi/build-ppt.cjs
const path = require('path')
// Semua pustaka dimuat dari satu lokasi (PPT_MODULES = folder node_modules tempat pptxgenjs dst. dipasang)
// agar versi React tidak bercampur dengan React milik aplikasi.
const L = (m) => require(require.resolve(m, { paths: [process.env.PPT_MODULES || __dirname] }))
const React = L('react')
const ReactDOMServer = L('react-dom/server')
const sharp = L('sharp')
const pptxgen = L('pptxgenjs')
const fa = L('react-icons/fa')

const ROOT = path.resolve(__dirname, '../..')
const IMG = (f) => path.join(ROOT, 'docs/panduan/img', f)
const OWN = (f) => path.join(__dirname, 'img', f)
const OUT = path.join(__dirname, 'Presentasi-Lomba-Rangking-1.pptx')

const THEME = {
  name: 'Lomba Rangking 1',
  headFontFace: 'Arial',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '1A2238', lt1: 'FFFFFF', dk2: '0B1B3F', lt2: 'F3F6FB',
    accent1: '1F7BFF', accent2: 'F97316', accent3: 'F5C542', accent4: '16A34A', accent5: '7F9ED8', accent6: '5B6577',
    hlink: '1F7BFF', folHlink: '5B6577',
  },
}
const HEX = THEME.colors

async function icon(name, hex, px = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(fa[name], { color: '#' + hex, size: px }))
  const buf = await sharp(Buffer.from(svg)).png().toBuffer()
  return 'image/png;base64,' + buf.toString('base64')
}

;(async () => {
  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE' // 13.33 x 7.5
  pres.title = 'Lomba Rangking 1 — Presentasi untuk Panitia'
  pres.author = 'Dodi Sujatmiko'
  pres.company = 'UPT SMPN 1 Baradatu'
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace }
  const C = pres.SchemeColor
  const W = 13.333

  // ---------- layout ----------
  pres.defineSlideMaster({
    title: 'DARK',
    background: { color: HEX.dk2 },
    objects: [],
    margin: [0.5, 0.6, 0.5, 0.6],
  })
  pres.defineSlideMaster({
    title: 'LIGHT',
    background: { color: HEX.lt1 },
    margin: [0.5, 0.6, 0.6, 0.6],
    slideNumber: { x: 12.1, y: 7.02, w: 0.6, h: 0.3, fontFace: 'Calibri', fontSize: 11, color: HEX.accent6, align: 'right' },
    objects: [
      { text: { text: 'Lomba Rangking 1  ·  Penyelenggara: PGRI Kabupaten Way Kanan  ·  Produk UPT SMPN 1 Baradatu', options: { x: 0.6, y: 7.02, w: 10, h: 0.3, fontSize: 11, color: HEX.accent6, fontFace: 'Calibri', margin: 0 } } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.4, w: 12.1, h: 0.9, fontFace: 'Arial', fontSize: 30, bold: true, color: HEX.dk2, align: 'left', valign: 'middle', margin: 0 }, text: '' } },
    ],
  })

  // ---------- util ----------
  const shadow = () => ({ type: 'outer', color: '0B1B3F', opacity: 0.14, blur: 10, offset: 3, angle: 90 })
  const card = (s, name, x, y, w, h, fill = C.background1) =>
    s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: 'DFE5EF', width: 0.75 }, shadow: shadow(), objectName: name })
  const ico = async (s, name, x, y, d, iconName, bg = C.accent1, fg = 'FFFFFF') => {
    s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: bg }, line: { color: bg, width: 0 }, objectName: name + ' (lingkaran)' })
    const p = d * 0.26
    s.addImage({ data: await icon(iconName, fg), x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p, altText: iconName, objectName: name })
  }
  const frame = (s, name, file, x, y, w, h, fit = true) => {
    s.addShape(pres.ShapeType.roundRect, { x: x - 0.06, y: y - 0.06, w: w + 0.12, h: h + 0.12, rectRadius: 0.1, fill: { color: 'FFFFFF' }, line: { color: 'DFE5EF', width: 0.75 }, shadow: shadow(), objectName: name + ' (bingkai)' })
    s.addImage({ path: file, x, y, w, h, altText: name, objectName: name })
  }
  const T = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, fontFace: 'Calibri', ...o })

  const addLight = (title, section, notes) => {
    const s = pres.addSlide({ masterName: 'LIGHT', sectionTitle: section })
    s.addText(title, { placeholder: 'title' })
    s.addNotes(notes)
    return s
  }

  // ================= SECTION: Pengantar =================
  pres.addSection({ title: 'Pengantar' })

  // 1. Sampul
  {
    const s = pres.addSlide({ masterName: 'DARK', sectionTitle: 'Pengantar' })
    s.addImage({ path: OWN('logo.png'), x: 0.9, y: 1.1, w: 5.3, h: 5.3 * 713 / 900, altText: 'Logo Lomba Rangking 1', objectName: 'Logo' })
    T(s, 'PRESENTASI UNTUK PANITIA', { x: 7.0, y: 1.35, w: 5.7, h: 0.4, fontSize: 14, bold: true, color: HEX.accent3, charSpacing: 4, objectName: 'Label' })
    T(s, 'Lomba Rangking 1', { x: 7.0, y: 1.85, w: 5.8, h: 1.1, fontSize: 42, bold: true, fontFace: 'Arial', color: C.background1, valign: 'middle', objectName: 'Judul' })
    T(s, 'Sistem lomba cerdas cermat real-time: juara ditentukan oleh kecepatan dan ketepatan menjawab.', { x: 7.0, y: 3.1, w: 5.7, h: 1.2, fontSize: 20, color: 'CADCFC', objectName: 'Subjudul' })
    T(s, '“Siapa Cepat, Siapa Tepat, Dialah Juara!”', { x: 7.0, y: 4.45, w: 5.7, h: 0.5, fontSize: 20, italic: true, bold: true, color: HEX.accent2, objectName: 'Tagline' })
    T(s, [
      { text: 'Penyelenggara lomba: ', options: { color: '9FB3D6' } }, { text: 'PGRI Kabupaten Way Kanan', options: { bold: true, color: C.background1, breakLine: true } },
      { text: 'Produk: ', options: { color: '9FB3D6' } }, { text: 'UPT SMPN 1 Baradatu', options: { bold: true, color: C.background1, breakLine: true } },
      { text: 'Dikembangkan oleh: ', options: { color: '9FB3D6' } }, { text: 'Dodi Sujatmiko', options: { bold: true, color: C.background1 } },
    ], { x: 7.0, y: 5.35, w: 5.7, h: 1.2, fontSize: 16, paraSpaceAfter: 4, objectName: 'Identitas' })
    s.addNotes('Selamat datang. Hari ini saya perkenalkan Lomba Rangking 1: aplikasi lomba cerdas cermat yang dikembangkan UPT SMPN 1 Baradatu untuk mendukung lomba yang diselenggarakan PGRI Kabupaten Way Kanan. Aplikasi sudah online di lomba-rangking1.vercel.app.')
  }

  // 2. Ringkasan
  {
    const s = addLight('Lomba cerdas cermat yang cepat, adil, dan transparan', 'Pengantar',
      'Pesan utama: juara ditentukan oleh gabungan kecepatan dan ketepatan. Peserta pakai HP sendiri, skor dihitung server sehingga adil, dan klasemen tampil langsung di layar besar. Dirancang untuk 135 peserta bersamaan.')
    T(s, 'Peserta menjawab lewat HP masing-masing. Skor dihitung oleh server dari jam server, bukan dari HP. Klasemen berubah langsung di layar utama, dan setiap keputusan operator tercatat.', { x: 0.6, y: 1.5, w: 12.1, h: 1.2, fontSize: 20, color: C.text1, objectName: 'Ringkasan' })
    const stats = [['135', 'peserta menjawab bersamaan', 'Dirancang dan diuji untuk beban ini'], ['3', 'jenjang', 'SD · SMP · SMA/SMK'], ['15', 'kecamatan', 'Kabupaten Way Kanan']]
    stats.forEach(([big, lab, sub], i) => {
      const x = 0.6 + i * 4.1
      card(s, `Kartu statistik ${i + 1}`, x, 3.2, 3.9, 3.0)
      T(s, big, { x, y: 3.45, w: 3.9, h: 1.4, fontSize: 80, bold: true, fontFace: 'Arial', color: [C.accent1, C.accent2, C.text2][i], align: 'center', valign: 'middle', objectName: `Angka ${i + 1}` })
      T(s, lab, { x: x + 0.2, y: 4.9, w: 3.5, h: 0.5, fontSize: 20, bold: true, color: C.text2, align: 'center', objectName: `Label ${i + 1}` })
      T(s, sub, { x: x + 0.2, y: 5.4, w: 3.5, h: 0.5, fontSize: 14, color: C.accent6, align: 'center', objectName: `Keterangan ${i + 1}` })
    })
  }

  // 3. Manual vs aplikasi
  {
    const s = addLight('Mengapa perlu aplikasi ini?', 'Pengantar',
      'Bandingkan dengan cara manual. Pada cara manual kecepatan sulit diukur adil dan rekap memakan waktu. Dengan aplikasi, waktu dicatat server sampai milidetik, hasil seketika, dan keputusan operator tercatat sehingga mengurangi keberatan.')
    card(s, 'Kartu cara manual', 0.6, 1.6, 5.9, 4.9, C.background2)
    T(s, 'Cara manual', { x: 0.95, y: 1.9, w: 5.2, h: 0.5, fontSize: 24, bold: true, color: C.accent6, objectName: 'Judul manual' })
    T(s, ['Kecepatan menjawab sulit diukur secara adil', 'Penilaian bergantung pada juri dan pencatat', 'Rekap nilai memakan waktu', 'Rawan perbedaan hasil dan keberatan'].map((t, i, a) => ({ text: t, options: { bullet: true, breakLine: i < a.length - 1 } })),
      { x: 0.95, y: 2.75, w: 5.2, h: 3.5, fontSize: 21, color: C.text1, paraSpaceAfter: 20, valign: 'top', objectName: 'Daftar manual' })
    s.addShape(pres.ShapeType.roundRect, { x: 6.83, y: 1.6, w: 5.9, h: 4.9, rectRadius: 0.12, fill: { color: C.text2 }, line: { color: C.text2, width: 0 }, shadow: shadow(), objectName: 'Kartu Lomba Rangking 1' })
    T(s, 'Lomba Rangking 1', { x: 7.18, y: 1.9, w: 5.2, h: 0.5, fontSize: 24, bold: true, color: C.accent3, objectName: 'Judul aplikasi' })
    T(s, ['Skor otomatis dari waktu server', 'Kecepatan terukur hingga milidetik', 'Klasemen berubah seketika di layar besar', 'Setiap keputusan operator tercatat'].map((t, i, a) => ({ text: t, options: { bullet: true, breakLine: i < a.length - 1 } })),
      { x: 7.18, y: 2.75, w: 5.2, h: 3.5, fontSize: 21, color: C.background1, paraSpaceAfter: 20, valign: 'top', objectName: 'Daftar aplikasi' })
  }

  // ================= SECTION: Cara kerja =================
  pres.addSection({ title: 'Cara kerja' })

  // 4. Rumus skor + grafik
  {
    const s = addLight('Skor: makin cepat dan benar, makin tinggi', 'Cara kerja',
      'Jelaskan rumus: 100 poin untuk jawaban benar ditambah bonus kecepatan sampai 50 poin, sebanding sisa waktu. Contoh pada durasi 20 detik: detik ke-2 dapat 145, detik ke-10 dapat 125, detik ke-18 dapat 105. Salah atau tidak menjawab 0. Angka 100, 50, durasi, dan pembulatan bisa diatur Superadmin; durasi juga bisa per soal.')
    s.addShape(pres.ShapeType.roundRect, { x: 0.6, y: 1.6, w: 5.6, h: 4.9, rectRadius: 0.12, fill: { color: C.text2 }, line: { color: C.text2, width: 0 }, shadow: shadow(), objectName: 'Kartu rumus' })
    T(s, 'RUMUS JAWABAN BENAR', { x: 0.95, y: 1.9, w: 4.9, h: 0.4, fontSize: 14, bold: true, color: C.accent3, charSpacing: 3, objectName: 'Label rumus' })
    T(s, [
      { text: '100', options: { color: C.background1, bold: true, fontSize: 40 } }, { text: '  +  ', options: { color: '9FB3D6', fontSize: 28 } },
      { text: '50', options: { color: C.accent2, bold: true, fontSize: 40, breakLine: true } },
      { text: '×  sisa waktu ÷ total waktu', options: { color: 'CADCFC', fontSize: 22 } },
    ], { x: 0.95, y: 2.4, w: 4.9, h: 1.8, fontFace: 'Arial', valign: 'top', objectName: 'Rumus' })
    T(s, [
      { text: 'Salah atau tidak menjawab = 0 poin', options: { bold: true, color: C.background1, breakLine: true } },
      { text: 'Nilai 100, 50, durasi, dan pembulatan dapat diatur Superadmin. Durasi bisa berbeda untuk tiap soal.', options: { color: 'CADCFC' } },
    ], { x: 0.95, y: 4.5, w: 4.9, h: 1.8, fontSize: 16, paraSpaceAfter: 8, valign: 'top', objectName: 'Catatan rumus' })
    card(s, 'Kartu grafik', 6.5, 1.6, 6.23, 4.9)
    s.addChart(pres.charts.BAR, [{ name: 'Skor', labels: ['Detik ke-2', 'Detik ke-10', 'Detik ke-18', 'Salah / kosong'], values: [145, 125, 105, 0] }], {
      x: 6.7, y: 1.75, w: 5.83, h: 4.6, barDir: 'col', chartColors: [HEX.accent1],
      showTitle: true, title: 'Skor jawaban benar (durasi 20 detik)', titleFontSize: 16, titleColor: HEX.dk2, titleFontFace: 'Calibri',
      showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 16, dataLabelFontBold: true, dataLabelColor: HEX.dk2, dataLabelFontFace: 'Calibri',
      catAxisLabelColor: HEX.dk1, catAxisLabelFontSize: 14, catAxisLabelFontFace: 'Calibri',
      valAxisLabelColor: HEX.accent6, valAxisLabelFontSize: 12, valAxisLabelFontFace: 'Calibri', valAxisMinVal: 0, valAxisMaxVal: 175, valAxisMajorUnit: 25,
      valGridLine: { color: 'E3E8F1', size: 0.75 }, catGridLine: { style: 'none' }, showLegend: false, barGapWidthPct: 60,
    })
  }

  // 5. Tiga layar
  {
    const s = addLight('Tiga layar bekerja bersamaan', 'Cara kerja',
      'Ada tiga layar: HP peserta untuk menjawab, panel operator di laptop untuk mengendalikan, dan monitor di TV atau proyektor untuk penonton. Ketiganya terhubung ke satu server terpercaya yang menyimpan kunci jawaban, jam, dan skor.')
    const cols = [
      ['HP peserta', 'Peserta', 'Masuk dengan kode dan PIN, membaca soal, mengirim jawaban.', IMG('pe-04-soal.jpg'), 780 / 1560],
      ['Panel operator', 'Operator di laptop', 'Memulai babak, menayangkan soal, membuka jawaban, mengumumkan juara.', IMG('ad-15-kontrol-soal.jpg'), 1280 / 800],
      ['Monitor', 'TV / proyektor 16:9', 'Soal, hitung mundur, klasemen langsung, dan podium juara.', IMG('tv-4-soal-jawaban.jpg'), 1280 / 720],
    ]
    cols.forEach(([h, role, desc, file, ratio], i) => {
      const x = 0.6 + i * 4.15
      card(s, `Kartu ${h}`, x, 1.55, 3.85, 4.55)
      s.addShape(pres.ShapeType.roundRect, { x: x + 0.15, y: 1.7, w: 3.55, h: 2.55, rectRadius: 0.08, fill: { color: C.background2 }, line: { color: C.background2, width: 0 }, objectName: `Latar ${h}` })
      let iw = 3.35, ih = iw / ratio
      if (ih > 2.35) { ih = 2.35; iw = ih * ratio }
      s.addImage({ path: file, x: x + 0.15 + (3.55 - iw) / 2, y: 1.7 + (2.55 - ih) / 2, w: iw, h: ih, altText: h, objectName: `Gambar ${h}` })
      T(s, h, { x: x + 0.2, y: 4.4, w: 3.45, h: 0.4, fontSize: 20, bold: true, color: C.text2, objectName: `Judul ${h}` })
      T(s, role, { x: x + 0.2, y: 4.8, w: 3.45, h: 0.3, fontSize: 14, bold: true, color: i === 0 ? C.accent2 : C.accent1, objectName: `Peran ${h}` })
      T(s, desc, { x: x + 0.2, y: 5.12, w: 3.45, h: 0.9, fontSize: 14, color: C.text1, valign: 'top', objectName: `Keterangan ${h}` })
    })
    s.addShape(pres.ShapeType.roundRect, { x: 0.6, y: 6.3, w: 12.1, h: 0.55, rectRadius: 0.27, fill: { color: C.text2 }, line: { color: C.text2, width: 0 }, objectName: 'Pita server' })
    T(s, 'Ketiganya terhubung ke satu server: kunci jawaban, jam, dan skor hanya ada di sana', { x: 0.6, y: 6.3, w: 12.1, h: 0.55, fontSize: 16, bold: true, color: C.background1, align: 'center', valign: 'middle', objectName: 'Teks server' })
  }

  // 6. 135 peserta
  {
    const s = addLight('Struktur peserta: 3 jenjang × 15 kecamatan × 3 peserta', 'Cara kerja',
      'Setiap kecamatan mengirim tiga peserta per jenjang. Jadi 45 peserta per jenjang dan 135 peserta seluruhnya. Jumlah ini bisa disesuaikan untuk event lain. Data peserta diimpor dari Excel, kode dan PIN dibuat otomatis, dan kartu peserta bisa dicetak.')
    const items = [['3', 'jenjang', C.accent1], ['×', '', null], ['15', 'kecamatan', C.accent2], ['×', '', null], ['3', 'peserta per kecamatan', C.accent1], ['=', '', null], ['135', 'peserta', C.text2]]
    let x = 1.45 // total lebar deret 10,4" dipusatkan pada area 12,1"
    items.forEach(([big, lab, col], i) => {
      if (!col) { T(s, big, { x, y: 2.05, w: 0.6, h: 1.4, fontSize: 48, bold: true, color: C.accent6, align: 'center', valign: 'middle', objectName: `Operator ${i}` }); x += 0.6; return }
      const w = big === '135' ? 2.6 : 2.0
      card(s, `Kartu ${lab}`, x, 1.7, w, 2.1)
      T(s, big, { x, y: 1.85, w, h: 1.1, fontSize: 60, bold: true, fontFace: 'Arial', color: col, align: 'center', valign: 'middle', objectName: `Angka ${lab}` })
      T(s, lab, { x: x + 0.1, y: 3.0, w: w - 0.2, h: 0.6, fontSize: 16, bold: true, color: C.text2, align: 'center', valign: 'top', objectName: `Label ${lab}` })
      x += w
    })
    // total lebar = 3 operator*0.6 + 2.0*3 + 2.6 = 10.4 -> pusatkan
    const notes = [['FaFileExcel', 'Impor dari Excel', 'Satu berkas berisi nomor, nama, sekolah, jenjang, dan kecamatan.'], ['FaIdCard', 'Kartu kode + PIN', 'Dibuat otomatis dan dicetak; PIN disimpan terenkripsi.'], ['FaSlidersH', 'Dapat disesuaikan', 'Jumlah peserta dan kecamatan dapat diubah untuk event lain.']]
    for (let i = 0; i < notes.length; i++) {
      const [ic, h, d] = notes[i]
      const nx = 0.6 + i * 4.1
      card(s, `Kartu ${h}`, nx, 4.3, 3.9, 2.2)
      await ico(s, `Ikon ${h}`, nx + 0.25, 4.55, 0.7, ic, [C.accent1, C.accent2, C.accent4][i])
      T(s, h, { x: nx + 1.15, y: 4.55, w: 2.6, h: 0.7, fontSize: 18, bold: true, color: C.text2, valign: 'middle', objectName: `Judul ${h}` })
      T(s, d, { x: nx + 0.25, y: 5.4, w: 3.45, h: 0.95, fontSize: 14, color: C.text1, valign: 'top', objectName: `Isi ${h}` })
    }
  }

  // 7. Alur lomba
  {
    const s = addLight('Alur satu lomba dari awal sampai akhir', 'Cara kerja',
      'Tujuh langkah. Warna menunjukkan siapa yang bertindak: biru operator atau admin, oranye peserta, navy sistem. Langkah 3 sampai 6 diulang untuk setiap soal. Kontrol ada di tangan operator, sehingga langkah yang salah tidak bisa dijalankan.')
    const steps = [
      ['1', 'Persiapan', 'Admin impor peserta dan soal', C.accent1], ['2', 'Peserta masuk', 'Kode + PIN dari HP', C.accent2],
      ['3', 'Soal tayang', 'Hitung mundur 3, 2, 1', C.accent1], ['4', 'Peserta menjawab', 'Satu kali, tidak bisa diubah', C.accent2],
      ['5', 'Soal ditutup', 'Operator buka jawaban', C.accent1], ['6', 'Klasemen berubah', 'Server hitung skor', C.text2],
      ['7', 'Juara diumumkan', 'Podium di monitor', C.accent1],
    ]
    steps.forEach(([n, t, d, col], i) => {
      const x = 0.6 + i * 1.75
      card(s, `Langkah ${n}`, x, 1.9, 1.6, 3.1)
      s.addShape(pres.ShapeType.ellipse, { x: x + 0.45, y: 2.1, w: 0.7, h: 0.7, fill: { color: col }, line: { color: col, width: 0 }, objectName: `Nomor ${n}` })
      T(s, n, { x: x + 0.45, y: 2.1, w: 0.7, h: 0.7, fontSize: 24, bold: true, fontFace: 'Arial', color: 'FFFFFF', align: 'center', valign: 'middle', objectName: `Angka ${n}` })
      T(s, t, { x: x + 0.1, y: 3.0, w: 1.4, h: 0.75, fontSize: 15, bold: true, color: C.text2, align: 'center', valign: 'top', objectName: `Judul ${n}` })
      T(s, d, { x: x + 0.1, y: 3.8, w: 1.4, h: 1.0, fontSize: 12, color: C.text1, align: 'center', valign: 'top', objectName: `Isi ${n}` })
    })
    s.addShape(pres.ShapeType.roundRect, { x: 0.6 + 2 * 1.75 - 0.08, y: 1.75, w: 4 * 1.75 - 0.1, h: 3.4, rectRadius: 0.15, fill: { color: 'FFFFFF', transparency: 100 }, line: { color: HEX.accent2, width: 1.5, dashType: 'dash' }, objectName: 'Bingkai pengulangan' })
    T(s, 'diulang untuk setiap soal', { x: 0.6 + 2 * 1.75, y: 5.2, w: 4 * 1.75 - 0.2, h: 0.35, fontSize: 14, italic: true, bold: true, color: C.accent2, align: 'center', objectName: 'Label pengulangan' })
    const leg = [['Operator / Admin', C.accent1], ['Peserta', C.accent2], ['Sistem (otomatis)', C.text2]]
    leg.forEach(([l, c], i) => {
      const lx = 3.2 + i * 2.7
      s.addShape(pres.ShapeType.ellipse, { x: lx, y: 6.07, w: 0.25, h: 0.25, fill: { color: c }, line: { color: c, width: 0 }, objectName: `Legenda ${l}` })
      T(s, l, { x: lx + 0.4, y: 6.0, w: 2.2, h: 0.4, fontSize: 14, color: C.text1, valign: 'middle', objectName: `Teks legenda ${l}` })
    })
  }

  // 8. Mode babak
  {
    const s = addLight('Empat mode babak, bisa dirangkai sesuai kebutuhan', 'Cara kerja',
      'Normal untuk penyisihan, Kecepatan mengutamakan waktu tercepat, Eliminasi menggugurkan peserta menurut aturan, Final menentukan juara 1 sampai 3. Bila tiga besar seri, operator menjalankan soal tambahan. Panitia bisa merangkai babak sesuai tata tertib lomba.')
    const modes = [
      ['FaUsers', 'Normal', 'Semua peserta menjawab semua soal. Yang salah tetap lanjut.', C.accent1],
      ['FaBolt', 'Kecepatan', 'Seperti Normal, peringkat mendahulukan waktu benar tercepat.', C.accent2],
      ['FaUserMinus', 'Eliminasi', 'Gugur setelah N kesalahan, di bawah ambang skor, atau keputusan operator (tercatat).', C.accent5],
      ['FaTrophy', 'Final', 'Menentukan juara 1–3 dari peringkat teratas atau pilihan operator.', C.accent3],
    ]
    for (let i = 0; i < modes.length; i++) {
      const [ic, h, d, col] = modes[i]
      const x = 0.6 + i * 3.05
      card(s, `Kartu ${h}`, x, 1.6, 2.85, 3.5)
      await ico(s, `Ikon ${h}`, x + 0.25, 1.85, 0.8, ic, col, col === C.accent3 ? '0B1B3F' : 'FFFFFF')
      T(s, h, { x: x + 0.25, y: 2.8, w: 2.4, h: 0.5, fontSize: 22, bold: true, color: C.text2, objectName: `Judul ${h}` })
      T(s, d, { x: x + 0.25, y: 3.35, w: 2.4, h: 1.6, fontSize: 14, color: C.text1, valign: 'top', objectName: `Isi ${h}` })
    }
    T(s, 'Contoh susunan lomba', { x: 0.6, y: 5.4, w: 4, h: 0.4, fontSize: 18, bold: true, color: C.text2, objectName: 'Label contoh' })
    const flow = ['Penyisihan (Normal)', 'Eliminasi', 'Final (Top-3)', 'Soal tambahan bila seri']
    flow.forEach((t, i) => {
      const x = 0.6 + i * 3.05
      s.addShape(pres.ShapeType.chevron, { x, y: 5.85, w: 2.95, h: 0.8, fill: { color: i === 3 ? C.accent2 : C.text2 }, line: { color: i === 3 ? C.accent2 : C.text2, width: 0 }, objectName: `Alur ${i + 1}` })
      T(s, t, { x: x + 0.45, y: 5.85, w: 2.2, h: 0.8, fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', objectName: `Teks alur ${i + 1}` })
    })
  }

  // 9. HP peserta
  {
    const s = addLight('HP peserta: sederhana dan jelas', 'Cara kerja',
      'Tampilan HP dirancang mobile-first: tombol besar, hitung mundur jelas, tanpa elemen yang mengganggu. Peserta memilih jawaban lalu menekan Kirim; jawaban tidak bisa diubah. Hasil benar atau salah baru muncul setelah operator membuka jawaban.')
    const phones = [['pe-01-login.jpg', 'Masuk kode + PIN'], ['pe-04-soal.jpg', 'Soal dan waktu'], ['pe-08-benar.jpg', 'Hasil setelah dibuka']]
    phones.forEach(([f, cap], i) => {
      const h = 4.55, w = h / 2, x = 0.7 + i * 2.55
      frame(s, cap, IMG(f), x, 1.55, w, h)
      T(s, cap, { x: x - 0.2, y: 6.2, w: w + 0.4, h: 0.35, fontSize: 12, color: C.accent6, align: 'center', objectName: `Keterangan ${cap}` })
    })
    const pts = [['Tombol jawaban besar', ' mudah ditekan di layar kecil'], ['Hitung mundur dari jam server', ' tidak bergantung jam HP'], ['Jawaban dikirim sekali', ' tidak bisa diubah'], ['Tersambung ulang otomatis', ' bila internet sempat putus']]
    T(s, pts.flatMap(([b, r], i) => [{ text: b, options: { bold: true, color: C.text2, bullet: true } }, { text: r, options: { color: C.text1, breakLine: i < pts.length - 1 } }]),
      { x: 8.5, y: 1.9, w: 4.2, h: 3.9, fontSize: 18, paraSpaceAfter: 14, valign: 'top', objectName: 'Poin HP' })
  }

  // 10. Monitor
  {
    const s = addLight('Monitor 16:9 untuk TV dan proyektor', 'Cara kerja',
      'Monitor dibuka lewat alamat khusus tanpa login. Tampilannya berganti otomatis mengikuti tindakan operator: menunggu, hitung mundur, soal, memproses, hasil, klasemen, dan podium. Kunci jawaban baru tampil setelah operator membukanya.')
    frame(s, 'Monitor saat soal berjalan', IMG('tv-4-soal-jawaban.jpg'), 0.66, 1.56, 7.3, 4.106)
    frame(s, 'Monitor klasemen', IMG('tv-7-klasemen.jpg'), 8.5, 1.56, 4.15, 2.334)
    frame(s, 'Monitor podium', IMG('tv-8-podium.jpg'), 8.5, 4.2, 4.15, 2.334)
    T(s, 'Tujuh tampilan berganti otomatis: tunggu · hitung mundur · soal · memproses · hasil · klasemen · podium juara. Tombol F untuk layar penuh.', { x: 0.66, y: 5.95, w: 7.3, h: 0.75, fontSize: 14, color: C.text1, valign: 'top', objectName: 'Keterangan monitor' })
  }

  // 11. Panel operator
  {
    const s = addLight('Panel operator: semua kendali di satu layar', 'Cara kerja',
      'Operator hanya melihat tombol yang boleh ditekan pada keadaan itu, jadi tidak bisa menjalankan langkah yang salah. Ada jeda, pembatalan soal bermasalah, eliminasi manual dengan alasan, soal tambahan untuk seri, dan pengumuman pemenang. Semua tindakan tercatat di audit log.')
    frame(s, 'Panel kontrol operator', IMG('ad-15-kontrol-soal.jpg'), 0.66, 1.56, 7.4, 4.625)
    const items = ['Mulai babak dan tayangkan soal', 'Tutup soal, tampilkan jawaban benar', 'Jeda dan lanjutkan (waktu tidak berkurang)', 'Batalkan soal bermasalah', 'Eliminasi peserta dengan alasan tercatat', 'Soal tambahan bila tiga besar seri', 'Umumkan pemenang dan tampilkan podium']
    T(s, items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1 } })), { x: 8.5, y: 1.6, w: 4.2, h: 4.4, fontSize: 16, color: C.text1, paraSpaceAfter: 10, valign: 'top', objectName: 'Daftar kendali' })
    T(s, 'Tombol menyesuaikan keadaan lomba: langkah yang salah tidak bisa ditekan.', { x: 0.66, y: 6.35, w: 7.4, h: 0.5, fontSize: 14, italic: true, color: C.accent6, objectName: 'Catatan panel' })
  }

  // ================= SECTION: Keadilan & hasil =================
  pres.addSection({ title: 'Keadilan dan hasil' })

  // 12. Adil dan aman
  {
    const s = addLight('Adil dan aman: peserta tidak bisa mengubah hasil', 'Keadilan dan hasil',
      'Enam jaminan: skor dihitung server, waktu dari jam server, satu jawaban per soal dijamin database, kunci jawaban tidak pernah dikirim ke HP atau monitor selama soal aktif, hak akses dibedakan per peran dan per event, dan semua tindakan penting tercatat di audit log.')
    const g = [
      ['FaServer', 'Skor dihitung server', 'HP hanya mengirim pilihan jawaban; skor tidak bisa diubah dari HP.'],
      ['FaClock', 'Waktu dari jam server', 'Hitung mundur dan batas waktu mengikuti server, bukan jam HP.'],
      ['FaCheckDouble', 'Satu jawaban per soal', 'Dijamin database. Kirim ganda tidak tercatat dua kali.'],
      ['FaLock', 'Kunci jawaban terjaga', 'Tidak dikirim ke HP atau monitor selama soal masih aktif.'],
      ['FaUserShield', 'Hak akses per peran', 'Superadmin, Admin per event, dan Peserta punya batas masing-masing.'],
      ['FaClipboardList', 'Audit log', 'Keputusan operator dan perubahan data tercatat lengkap dengan pelakunya.'],
    ]
    for (let i = 0; i < g.length; i++) {
      const [ic, h, d] = g[i]
      const x = 0.6 + (i % 3) * 4.1, y = 1.55 + Math.floor(i / 3) * 2.7
      card(s, `Kartu ${h}`, x, y, 3.9, 2.5)
      await ico(s, `Ikon ${h}`, x + 0.25, y + 0.25, 0.7, ic, [C.accent1, C.accent2, C.accent1, C.text2, C.accent2, C.accent1][i])
      T(s, h, { x: x + 1.15, y: y + 0.25, w: 2.6, h: 0.7, fontSize: 18, bold: true, color: C.text2, valign: 'middle', objectName: `Judul ${h}` })
      T(s, d, { x: x + 0.25, y: y + 1.1, w: 3.45, h: 1.3, fontSize: 14, color: C.text1, valign: 'top', objectName: `Isi ${h}` })
    }
  }

  // 13. Hasil & laporan
  {
    const s = addLight('Hasil, laporan, dan sertifikat langsung jadi', 'Keadilan dan hasil',
      'Setelah lomba, hasil bisa diunduh sebagai Excel atau PDF, dicetak, dan dipublikasikan di beranda. Piagam juara dan sertifikat peserta dibuat otomatis dalam PDF, dengan nama penyelenggara dan kolom tanda tangan.')
    frame(s, 'Halaman hasil perlombaan', IMG('ad-18-hasil.jpg'), 0.66, 1.56, 6.9, 4.31)
    T(s, 'Peringkat ditentukan server: poin → jumlah benar → waktu benar tercepat → soal tambahan.', { x: 0.66, y: 6.1, w: 6.9, h: 0.7, fontSize: 14, color: C.text1, valign: 'top', objectName: 'Keterangan hasil' })
    frame(s, 'Contoh piagam juara', OWN('sertifikat.png'), 8.0, 1.56, 4.7, 4.7 * 827 / 1170 - 0.02)
    T(s, [
      { text: 'Excel · PDF · Cetak', options: { bold: true, color: C.text2, breakLine: true } },
      { text: 'Piagam juara 1–3 dan sertifikat semua peserta', options: { color: C.text1 } },
    ], { x: 8.0, y: 5.25, w: 4.7, h: 1.2, fontSize: 16, paraSpaceAfter: 6, valign: 'top', objectName: 'Keterangan sertifikat' })
  }

  // 14. Pengujian & kesiapan
  {
    const s = addLight('Sudah diuji, dan sudah online', 'Keadilan dan hasil',
      'Yang sudah diuji: 64 tes otomatis pada database mencakup hak akses, skor, deadline, kirim ganda, eliminasi, dan seri. Simulasi 135 peserta menjawab enam soal berturut-turut, tiga kali, semuanya lulus. Saya jujur menyampaikan bahwa gladi resik di lokasi dengan HP dan jaringan sungguhan tetap diperlukan sebelum hari-H.')
    const st = [['64', 'tes otomatis lulus', 'Hak akses, skor, deadline, kirim ganda, eliminasi, seri'], ['135', 'peserta disimulasikan', '6 soal × 3 kali berjalan, semuanya lulus'], ['1', 'alamat, sudah online', 'lomba-rangking1.vercel.app']]
    st.forEach(([big, lab, sub], i) => {
      const x = 0.6 + i * 4.1
      card(s, `Kartu uji ${i + 1}`, x, 1.55, 3.9, 2.75)
      T(s, big, { x, y: 1.65, w: 3.9, h: 1.2, fontSize: 64, bold: true, fontFace: 'Arial', color: [C.accent1, C.accent2, C.text2][i], align: 'center', valign: 'middle', objectName: `Angka uji ${i + 1}` })
      T(s, lab, { x: x + 0.2, y: 2.9, w: 3.5, h: 0.45, fontSize: 18, bold: true, color: C.text2, align: 'center', objectName: `Label uji ${i + 1}` })
      T(s, sub, { x: x + 0.2, y: 3.4, w: 3.5, h: 0.8, fontSize: 14, color: C.text1, align: 'center', valign: 'top', objectName: `Isi uji ${i + 1}` })
    })
    const checks = ['Peserta tidak dapat membaca kunci jawaban', 'Reconnect saat internet terputus', 'Ekspor Excel, PDF, dan sertifikat', 'Balapan menutup soal tidak menghilangkan jawaban']
    for (let i = 0; i < checks.length; i++) {
      const x = 0.6 + (i % 2) * 6.15, y = 4.6 + Math.floor(i / 2) * 0.6
      s.addImage({ data: await icon('FaCheckCircle', HEX.accent4), x, y: y + 0.05, w: 0.32, h: 0.32, altText: 'Centang', objectName: `Centang ${i + 1}` })
      T(s, checks[i], { x: x + 0.5, y, w: 5.5, h: 0.42, fontSize: 16, color: C.text1, valign: 'middle', objectName: `Uji ${i + 1}` })
    }
    s.addShape(pres.ShapeType.roundRect, { x: 0.6, y: 5.95, w: 12.1, h: 0.75, rectRadius: 0.12, fill: { color: 'FFF5EC' }, line: { color: HEX.accent2, width: 1 }, objectName: 'Kotak gladi resik' })
    T(s, [{ text: 'Langkah berikutnya: ', options: { bold: true, color: C.accent2 } }, { text: 'gladi resik di lokasi dengan HP peserta dan jaringan sungguhan.', options: { color: C.text1 } }], { x: 0.9, y: 5.95, w: 11.5, h: 0.75, fontSize: 18, valign: 'middle', objectName: 'Teks gladi resik' })
  }

  // ================= SECTION: Persiapan =================
  pres.addSection({ title: 'Persiapan' })

  // 15. Kebutuhan dari panitia
  {
    const s = addLight('Yang kami butuhkan dari panitia', 'Persiapan',
      'Enam hal. Data peserta dalam Excel, soal beserta kunci dan soal cadangan untuk kondisi seri, perangkat dan jaringan termasuk hotspot cadangan, operator yang dilatih, jadwal dan lokasi, serta penandatangan sertifikat.')
    const n = [
      ['FaFileExcel', 'Data peserta (Excel)', 'Nomor, nama, sekolah, jenjang, kecamatan untuk 135 peserta.'],
      ['FaQuestionCircle', 'Soal dan kunci jawaban', 'Termasuk soal cadangan untuk memutus seri.'],
      ['FaLaptop', 'Perangkat', 'Laptop operator, TV atau proyektor, dan sambungan ke layar.'],
      ['FaWifi', 'Internet stabil', 'Wi-Fi lokasi dan hotspot cadangan untuk laptop operator.'],
      ['FaUserCog', 'Operator terlatih', 'Dua sampai tiga orang; pelatihan singkat dan gladi resik.'],
      ['FaSignature', 'Jadwal dan penandatangan', 'Waktu, lokasi, serta nama dan jabatan penanda tangan sertifikat.'],
    ]
    for (let i = 0; i < n.length; i++) {
      const [ic, h, d] = n[i]
      const x = 0.6 + (i % 3) * 4.1, y = 1.55 + Math.floor(i / 3) * 2.7
      card(s, `Kartu ${h}`, x, y, 3.9, 2.5)
      await ico(s, `Ikon ${h}`, x + 0.25, y + 0.25, 0.7, ic, [C.accent1, C.accent2, C.text2, C.accent1, C.accent2, C.text2][i])
      T(s, h, { x: x + 1.15, y: y + 0.25, w: 2.6, h: 0.7, fontSize: 18, bold: true, color: C.text2, valign: 'middle', objectName: `Judul ${h}` })
      T(s, d, { x: x + 0.25, y: y + 1.1, w: 3.45, h: 1.3, fontSize: 14, color: C.text1, valign: 'top', objectName: `Isi ${h}` })
    }
  }

  // 16. Jadwal usulan
  {
    const s = addLight('Usulan jadwal persiapan menuju hari-H', 'Persiapan',
      'Ini usulan, bisa disesuaikan dengan jadwal lomba. Intinya, gladi resik di lokasi minimal tiga hari sebelumnya agar masih ada waktu memperbaiki kendala jaringan atau perangkat.')
    const m = [
      ['H-14', 'Data peserta dan soal terkumpul', C.accent1], ['H-7', 'Impor peserta, cetak kartu, siapkan sesi', C.accent1],
      ['H-3', 'Gladi resik di lokasi', C.accent2], ['H-1', 'Cek perangkat dan jaringan', C.accent1],
      ['Hari-H', 'Pelaksanaan lomba', C.text2], ['H+1', 'Laporan dan sertifikat', C.accent4],
    ]
    m.forEach(([d, t, col], i) => {
      const x = 0.6 + i * 2.04
      card(s, `Tahap ${d}`, x, 1.9, 1.9, 3.7)
      s.addShape(pres.ShapeType.roundRect, { x: x + 0.2, y: 2.35, w: 1.5, h: 0.65, rectRadius: 0.32, fill: { color: col }, line: { color: col, width: 0 }, objectName: `Penanda ${d}` })
      T(s, d, { x: x + 0.2, y: 2.35, w: 1.5, h: 0.65, fontSize: 20, bold: true, fontFace: 'Arial', color: 'FFFFFF', align: 'center', valign: 'middle', objectName: `Hari ${d}` })
      T(s, t, { x: x + 0.15, y: 3.35, w: 1.6, h: 2.1, fontSize: 18, bold: true, color: C.text2, align: 'center', valign: 'top', objectName: `Isi ${d}` })
    })
    T(s, 'Jadwal bersifat usulan dan dapat disesuaikan dengan agenda panitia.', { x: 0.6, y: 5.95, w: 12.1, h: 0.4, fontSize: 14, italic: true, color: C.accent6, objectName: 'Catatan jadwal' })
  }

  // 17. Risiko & cadangan (tabel asli)
  {
    const s = addLight('Bagaimana jika terjadi kendala?', 'Persiapan',
      'Rencana cadangan untuk pertanyaan yang biasanya muncul dari panitia. Intinya hampir semua kendala sudah punya jalan keluar yang tercatat di aplikasi.')
    const head = (t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: HEX.dk2 }, fontSize: 16, fontFace: 'Calibri' } })
    const cell = (t, alt, bold = false) => ({ text: t, options: { color: HEX.dk1, bold, fill: { color: alt ? HEX.lt2 : 'FFFFFF' }, fontSize: 15, fontFace: 'Calibri' } })
    const rows = [
      ['Internet peserta atau laptop putus', 'Halaman tersambung ulang otomatis dan mengambil keadaan terbaru; siapkan hotspot cadangan.'],
      ['Peserta lupa atau salah PIN', 'Reset PIN di meja registrasi; salah 5 kali mengunci akun 5 menit.'],
      ['Soal ternyata bermasalah', 'Operator membatalkan soal; skor soal itu dihapus dan peserta yang gugur karenanya dikembalikan.'],
      ['Tiga besar seri', 'Soal tambahan memutus seri; pemenang tidak bisa diumumkan sebelum seri diputus.'],
      ['Salah menyentuh pilihan', 'Pilihan baru terkirim setelah menekan tombol Kirim jawaban.'],
    ]
    s.addTable([[head('Kendala'), head('Penanganan')], ...rows.map((r, i) => [cell(r[0], i % 2 === 1, true), cell(r[1], i % 2 === 1)])], {
      x: 0.6, y: 1.6, w: 12.1, colW: [3.9, 8.2], rowH: [0.5, 0.78, 0.78, 0.78, 0.78, 0.78], border: { type: 'solid', color: 'DFE5EF', pt: 0.75 }, valign: 'middle', margin: [0.06, 0.12, 0.06, 0.12], objectName: 'Tabel kendala',
    })
  }

  // 18. Penutup
  {
    const s = pres.addSlide({ masterName: 'DARK', sectionTitle: 'Persiapan' })
    s.addImage({ path: OWN('logo.png'), x: 0.9, y: 1.5, w: 4.6, h: 4.6 * 713 / 900, altText: 'Logo Lomba Rangking 1', objectName: 'Logo' })
    T(s, 'Terima kasih', { x: 6.4, y: 1.5, w: 6.3, h: 1.0, fontSize: 50, bold: true, fontFace: 'Arial', color: C.background1, objectName: 'Judul penutup' })
    T(s, 'Tanya jawab dan diskusi', { x: 6.4, y: 2.6, w: 6.3, h: 0.6, fontSize: 24, color: C.accent3, bold: true, objectName: 'Subjudul penutup' })
    T(s, 'lomba-rangking1.vercel.app', { x: 6.4, y: 3.5, w: 6.3, h: 0.5, fontSize: 24, bold: true, color: C.accent1, hyperlink: { url: 'https://lomba-rangking1.vercel.app/', tooltip: 'Buka aplikasi' }, objectName: 'Alamat' })
    T(s, '“Siapa Cepat, Siapa Tepat, Dialah Juara!”', { x: 6.4, y: 4.3, w: 6.3, h: 0.5, fontSize: 20, italic: true, color: 'CADCFC', objectName: 'Tagline penutup' })
    T(s, [
      { text: 'Penyelenggara lomba: PGRI Kabupaten Way Kanan', options: { breakLine: true } },
      { text: 'Produk: UPT SMPN 1 Baradatu', options: { breakLine: true } },
      { text: 'Dikembangkan oleh: Dodi Sujatmiko' },
    ], { x: 6.4, y: 5.3, w: 6.3, h: 1.1, fontSize: 16, color: '9FB3D6', paraSpaceAfter: 4, objectName: 'Identitas penutup' })
    s.addNotes('Terima kasih. Silakan bertanya. Usulan tindak lanjut: sepakati jadwal gladi resik dan serahkan data peserta serta soal.')
  }

  await pres.writeFile({ fileName: OUT })
  const { applyTheme } = require('/root/.claude/skills/synced/22891054-c13b-48c4-8674-17e38d68b8c0_76ebc5e6-7bff-4ec0-9217-672c78a9305c/pptx/scripts/apply_theme.js')
  await applyTheme(OUT, THEME)
  console.log('OK', OUT)
})().catch((e) => { console.error(e); process.exit(1) })
