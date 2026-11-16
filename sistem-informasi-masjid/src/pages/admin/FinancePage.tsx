import { useMemo, useState } from 'react'
import { Download, HandCoins, Landmark, QrCode, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CrudPage } from '@/components/admin/CrudPage'
import { Badge, Button, PageHeader, Section, StatCard } from '@/components/ui'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'
import { fmtDate, isoDate, monthLabel, rupiah, rupiahShort } from '@/lib/format'
import type { FieldDef } from '@/lib/form'
import type { DonationAccount, FinancialTransaction } from '@/lib/types'

const opt = (list: string[]) => list.map((c) => ({ value: c, label: c }))

const txFields: FieldDef[] = [
  { name: 'type', label: 'Jenis transaksi', type: 'select', required: true, options: [{ value: 'income', label: 'Pemasukan' }, { value: 'expense', label: 'Pengeluaran' }] },
  { name: 'transaction_date', label: 'Tanggal', type: 'date', required: true },
  { name: 'category_income', label: 'Kategori', type: 'select', required: true, options: opt(INCOME_CATEGORIES), showIf: (v) => v.type === 'income' },
  { name: 'category_expense', label: 'Kategori', type: 'select', required: true, options: opt(EXPENSE_CATEGORIES), showIf: (v) => v.type === 'expense' },
  { name: 'amount', label: 'Jumlah', type: 'number', required: true, min: 1, max: 999_999_999_999, suffix: 'Rupiah', placeholder: 'Mis. 1500000' },
  { name: 'description', label: 'Keterangan', type: 'textarea', maxLength: 300, rows: 2 },
]

const accountFields: FieldDef[] = [
  { name: 'label', label: 'Nama rekening / tujuan', type: 'text', required: true, minLength: 2, maxLength: 80, placeholder: 'Mis. Infak Operasional Masjid' },
  { name: 'bank_name', label: 'Bank', type: 'text', maxLength: 60, placeholder: 'Mis. Bank Syariah Indonesia (BSI)' },
  { name: 'account_number', label: 'Nomor rekening', type: 'text', maxLength: 40, pattern: { regex: /^[0-9 .-]+$/, message: 'Hanya angka, spasi, titik, atau strip' } },
  { name: 'account_holder', label: 'Atas nama', type: 'text', maxLength: 80 },
  { name: 'qr_content', label: 'Tautan donasi / kode QRIS (teks)', type: 'text', maxLength: 600, full: true, hint: 'Opsional. Tautan (https://…) atau string QRIS — otomatis dibuat menjadi kode QR di layar.' },
  { name: 'qris_image_url', label: 'Gambar QRIS', type: 'file', accept: 'image', folder: 'qris', pathField: 'qris_image_path', hint: 'Opsional. Unggah gambar QRIS resmi dari bank bila ada (lebih diutamakan daripada teks di atas).' },
  { name: 'is_active', label: 'Aktif', type: 'toggle', hint: 'Tampilkan di layar', full: true },
]

export default function FinancePage() {
  const [tab, setTab] = useState<'tx' | 'acc'>('tx')
  const [month, setMonth] = useState('')

  return (
    <div>
      <PageHeader title="Keuangan & Donasi" subtitle="Catat pemasukan dan pengeluaran kas masjid serta kelola rekening donasi. Rincian transaksi hanya dapat dilihat Super Admin dan Admin Masjid." />
      <div className="mb-5 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="tablist">
        {([['tx', 'Kas & Transaksi', Wallet], ['acc', 'Rekening & QR Donasi', QrCode]] as const).map(([k, label, Icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === k ? 'bg-emerald-700 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'tx' ? (
        <CrudPage<FinancialTransaction>
          embedded table="financial_transactions" noun="transaksi" icon={<Wallet />} stampCreator
          fields={txFields}
          defaults={{ type: 'income', transaction_date: isoDate(), category_income: 'Infak Jumat', category_expense: 'Listrik & Air', amount: '', description: '' }}
          order={[['transaction_date', false], ['created_at', false]]} searchKeys={['category', 'description']}
          filter={(r) => !month || r.transaction_date.startsWith(month)}
          validate={(v) => (String(v.transaction_date ?? '') > isoDate() ? { transaction_date: 'Tanggal tidak boleh di masa depan' } : {})}
          load={(r) => ({ ...r, category_income: INCOME_CATEGORIES.includes(r.category) ? r.category : 'Lainnya', category_expense: EXPENSE_CATEGORIES.includes(r.category) ? r.category : 'Lainnya' })}
          prepare={(payload) => {
            const { category_income, category_expense, ...rest } = payload
            return { ...rest, category: payload.type === 'income' ? category_income : category_expense }
          }}
          rowLabel={(r) => `${r.category} ${rupiah(r.amount)}`}
          toolbar={<input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Filter bulan" />}
          above={({ rows }) => <FinanceSummary rows={rows} month={month} />}
          columns={[
            { header: 'Tanggal', render: (r) => <span className="whitespace-nowrap">{fmtDate(r.transaction_date)}</span> },
            { header: 'Kategori', render: (r) => (<div><p className="font-medium text-slate-900">{r.category}</p>{r.description && <p className="line-clamp-1 max-w-xs text-xs text-slate-500">{r.description}</p>}</div>) },
            { header: 'Jenis', render: (r) => <Badge tone={r.type === 'income' ? 'green' : 'red'}>{r.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</Badge> },
            { header: 'Jumlah', className: 'text-right', render: (r) => <span className={`tabular whitespace-nowrap font-semibold ${r.type === 'income' ? 'text-emerald-700' : 'text-red-600'}`}>{r.type === 'income' ? '+' : '−'} {rupiah(r.amount)}</span> },
          ]}
        />
      ) : (
        <CrudPage<DonationAccount>
          embedded table="donation_accounts" noun="rekening donasi" icon={<Landmark />}
          fields={accountFields}
          defaults={{ label: 'Infak & Sedekah', bank_name: '', account_number: '', account_holder: '', qr_content: '', qris_image_url: null, qris_image_path: null, is_active: true }}
          order={[['sort_order'], ['created_at']]}
          validate={(v) => (!String(v.account_number ?? '').trim() && !String(v.qr_content ?? '').trim() && !v.qris_image_url
            ? { account_number: 'Isi nomor rekening, tautan/kode QRIS, atau unggah gambar QRIS' } : String(v.account_number ?? '').trim() && !String(v.bank_name ?? '').trim() ? { bank_name: 'Nama bank wajib diisi' } : {})}
          prepare={(payload, editing, rows) => (editing ? payload : { ...payload, sort_order: (Math.max(0, ...rows.map((r) => r.sort_order)) || 0) + 10 })}
          rowLabel={(r) => r.label}
          columns={[
            { header: 'Rekening', render: (r) => (<div><p className="font-medium text-slate-900">{r.label}</p><p className="text-xs text-slate-500">{r.bank_name}</p></div>) },
            { header: 'Nomor', render: (r) => (<div><p className="tabular font-semibold">{r.account_number || '-'}</p>{r.account_holder && <p className="text-xs text-slate-500">a.n. {r.account_holder}</p>}</div>) },
            { header: 'QR', render: (r) => r.qris_image_url ? <img src={r.qris_image_url} alt="QRIS" className="h-14 w-14 rounded border border-slate-200 object-contain" />
              : r.qr_content ? <QRCodeSVG value={r.qr_content} size={56} /> : <span className="text-slate-400">-</span> },
          ]}
        />
      )}
    </div>
  )
}

function FinanceSummary({ rows, month }: { rows: FinancialTransaction[]; month: string }) {
  const stats = useMemo(() => {
    const sum = (list: FinancialTransaction[], type: string) => list.filter((r) => r.type === type).reduce((a, r) => a + Number(r.amount), 0)
    const period = month || isoDate().slice(0, 7)
    const inPeriod = rows.filter((r) => r.transaction_date.startsWith(period))
    const months: string[] = []
    const base = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const infak = rows.filter((r) => r.type === 'income' && /infak/i.test(r.category) && r.transaction_date.startsWith(period))
    const byCat = new Map<string, number>()
    infak.forEach((r) => byCat.set(r.category, (byCat.get(r.category) ?? 0) + Number(r.amount)))
    return {
      period,
      balance: sum(rows, 'income') - sum(rows, 'expense'),
      income: sum(inPeriod, 'income'),
      expense: sum(inPeriod, 'expense'),
      infakTotal: infak.reduce((a, r) => a + Number(r.amount), 0),
      infakByCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]),
      chart: months.map((m) => {
        const list = rows.filter((r) => r.transaction_date.startsWith(m))
        return { name: monthLabel(m), Pemasukan: sum(list, 'income'), Pengeluaran: sum(list, 'expense') }
      }),
    }
  }, [rows, month])

  const exportCsv = () => {
    const list = rows.filter((r) => !month || r.transaction_date.startsWith(month))
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const csv = ['Tanggal;Jenis;Kategori;Jumlah;Keterangan', ...list.map((r) => [r.transaction_date, r.type === 'income' ? 'Pemasukan' : 'Pengeluaran', esc(r.category), Number(r.amount), esc(r.description)].join(';'))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `laporan-keuangan-${month || 'semua'}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const label = monthLabel(stats.period)
  return (
    <div className="mb-5 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Wallet />} label="Saldo kas masjid" value={<span data-testid="finance-balance">{rupiah(stats.balance)}</span>} hint="Seluruh transaksi" />
        <StatCard icon={<TrendingUp />} label={`Pemasukan ${label}`} value={rupiah(stats.income)} tone="sky" />
        <StatCard icon={<TrendingDown />} label={`Pengeluaran ${label}`} value={rupiah(stats.expense)} tone="rose" />
        <StatCard icon={<HandCoins />} label={`Infak ${label}`} value={rupiah(stats.infakTotal)} tone="gold" hint={stats.infakByCat.map(([c, n]) => `${c}: ${rupiahShort(n)}`).join(' · ') || 'Belum ada infak tercatat'} />
      </div>
      <Section title="Grafik laporan keuangan" description="Pemasukan dan pengeluaran 6 bulan terakhir"
        aside={<Button variant="secondary" size="sm" icon={<Download />} onClick={exportCsv} disabled={!rows.length}>Unduh CSV{month ? ` (${monthLabel(month)})` : ''}</Button>}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.chart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v: number) => rupiahShort(v).replace('Rp ', '')} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={56} />
              <Tooltip formatter={(v: number) => rupiah(v)} cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Bar dataKey="Pemasukan" fill="#047857" radius={[6, 6, 0, 0]} maxBarSize={36} />
              <Bar dataKey="Pengeluaran" fill="#d4af37" radius={[6, 6, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
    </div>
  )
}
