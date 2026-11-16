import { BookOpenText } from 'lucide-react'
import { CrudPage } from '@/components/admin/CrudPage'
import { Badge } from '@/components/ui'
import { ISLAMIC_TYPES, labelOf } from '@/lib/constants'
import type { FieldDef } from '@/lib/form'
import type { IslamicContent } from '@/lib/types'

const fields: FieldDef[] = [
  { name: 'type', label: 'Jenis', type: 'select', required: true, options: ISLAMIC_TYPES },
  { name: 'source', label: 'Sumber', type: 'text', required: true, minLength: 2, maxLength: 120, placeholder: 'Mis. QS. Al-Baqarah: 153 / HR. Muslim' },
  { name: 'arabic_text', label: 'Teks Arab', type: 'textarea', rtl: true, maxLength: 600, hint: 'Opsional. Pastikan penulisan dan harakat sudah benar.' },
  { name: 'translation', label: 'Terjemahan / isi', type: 'textarea', required: true, minLength: 5, maxLength: 800 },
  { name: 'is_active', label: 'Aktif', type: 'toggle', hint: 'Tampilkan bergantian di slideshow', full: true },
]

const defaults = { type: 'ayat', source: '', arabic_text: '', translation: '', is_active: true }

export default function IslamicPage() {
  return (
    <CrudPage<IslamicContent>
      table="islamic_contents" noun="konten islami" title="Ayat & Hadis" icon={<BookOpenText />}
      subtitle="Kutipan ayat Al-Qur’an, hadis, doa, dan nasihat yang tampil bergantian di layar TV."
      fields={fields} defaults={defaults} order={[['created_at']]} searchKeys={['translation', 'source']}
      rowLabel={(r) => r.source}
      columns={[
        { header: 'Isi', render: (r) => (
          <div className="max-w-xl">
            {r.arabic_text && <p dir="rtl" lang="ar" className="line-clamp-1 font-arabic text-lg text-slate-900">{r.arabic_text}</p>}
            <p className="line-clamp-2 text-slate-700">{r.translation}</p>
          </div>
        ) },
        { header: 'Sumber', render: (r) => <span className="whitespace-nowrap font-medium">{r.source}</span> },
        { header: 'Jenis', render: (r) => <Badge tone={r.type === 'ayat' ? 'green' : r.type === 'hadis' ? 'blue' : 'gray'}>{labelOf(ISLAMIC_TYPES, r.type)}</Badge> },
      ]}
    />
  )
}
