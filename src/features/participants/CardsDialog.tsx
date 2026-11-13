import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IdCard, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { list, rpc } from '@/services/db'
import { useDistricts, useLevels } from '@/contexts/EventContext'
import { useConfirm } from '@/components/confirm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SwitchRow } from '@/components/ui/switch'
import { exportParticipantCards, type CardData, type CardEvent } from '@/utils/cards'
import { publicBaseUrl } from '@/lib/publicUrl'

export interface CardRow {
  id: string; code: string; full_name: string; participant_number: string; school: string
  photo_url: string | null; education_level_id: string; district_id: string
}

/** Data umum kartu (alamat masuk, penyelenggara, pemilik produk). */
export function useCardEvent(eventName: string, organizer: string | null | undefined): CardEvent {
  const { data } = useQuery({ queryKey: ['app_settings'], queryFn: () => list<{ key: string; value: unknown }>('app_settings'), staleTime: 60_000 })
  const branding = (data?.find((s) => s.key === 'branding')?.value ?? {}) as { product_owner?: string }
  return { eventName, organizer: organizer || 'PGRI Kabupaten Way Kanan', productOwner: branding.product_owner || 'UPT SMPN 1 Baradatu', loginUrl: `${publicBaseUrl()}/peserta` }
}

export function useCardMaker() {
  const { levelMap } = useLevels()
  const { districtMap } = useDistricts()
  return (r: CardRow, pin: string): CardData => ({
    name: r.full_name, number: r.participant_number, school: r.school,
    level: levelMap.get(r.education_level_id)?.name ?? '', district: districtMap.get(r.district_id)?.name ?? '',
    code: r.code, pin, photoUrl: r.photo_url,
  })
}

const byNumber = (a: CardData, b: CardData) => a.number.localeCompare(b.number, 'id', { numeric: true })

export default function CardsDialog({ open, onOpenChange, eventId, eventName, organizer, all, filtered, selected, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; eventId: string; eventName: string; organizer: string | null | undefined
  all: CardRow[]; filtered: CardRow[]; selected: CardRow[]; onDone: () => void
}) {
  const confirm = useConfirm()
  const makeCard = useCardMaker()
  const ev = useCardEvent(eventName, organizer)
  const [scopeChoice, setScopeChoice] = useState<'selected' | 'filtered' | 'all' | null>(null)
  const [photos, setPhotos] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const scope = scopeChoice ?? (selected.length ? 'selected' : filtered.length !== all.length ? 'filtered' : 'all')
  const rows = useMemo(() => (scope === 'selected' ? selected : scope === 'filtered' ? filtered : all), [scope, selected, filtered, all])
  const options: { key: 'selected' | 'filtered' | 'all'; label: string; n: number }[] = [
    { key: 'selected', label: 'Peserta yang dicentang', n: selected.length },
    { key: 'filtered', label: 'Sesuai penyaring saat ini', n: filtered.length },
    { key: 'all', label: 'Semua peserta event', n: all.length },
  ]
  const file = `kartu-peserta-${eventName.replace(/[^\w]+/g, '-').toLowerCase()}`

  const sample = async () => {
    if (!rows.length) return
    setBusy('Membuat contoh…')
    try {
      await exportParticipantCards([makeCard(rows[0], '******')], ev, 'contoh-kartu-peserta', { includePhotos: photos })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal membuat contoh')
    } finally { setBusy(null) }
  }

  const generate = async () => {
    if (!rows.length) return
    const yes = await confirm({
      title: `Buat ${rows.length} kartu dengan PIN baru?`,
      description: <>PIN lama tidak dapat ditampilkan (disimpan terenkripsi), jadi setiap kartu memakai <b>PIN baru</b>. PIN lama langsung tidak berlaku dan peserta yang sedang masuk akan dikeluarkan. Lakukan ini <b>sebelum</b> kartu dibagikan.</>,
      confirmLabel: 'Buat kartu', destructive: true,
    })
    if (!yes) return
    try {
      setBusy('Membuat PIN baru…')
      const creds: { id: string; code: string; pin: string }[] = []
      for (let i = 0; i < rows.length; i += 100)
        creds.push(...(await rpc<{ id: string; code: string; pin: string }[]>('admin_reset_pins', { p_event_id: eventId, p_participant_ids: rows.slice(i, i + 100).map((r) => r.id) })))
      const byId = new Map(rows.map((r) => [r.id, r]))
      const cards = creds.map((c) => byId.get(c.id) && makeCard(byId.get(c.id)!, c.pin)).filter((c): c is CardData => !!c).sort(byNumber)
      setBusy('Menyusun kartu PDF…')
      await exportParticipantCards(cards, ev, file, { includePhotos: photos, onProgress: (d, t) => setBusy(`Menyusun kartu… ${d}/${t}`) })
      toast.success(`${cards.length} kartu dibuat. Simpan berkas PDF-nya baik-baik — PIN tidak dapat ditampilkan lagi.`)
      onDone()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal membuat kartu')
    } finally { setBusy(null) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kartu peserta</DialogTitle>
          <DialogDescription>Kartu PDF siap cetak: foto, nama, sekolah, kode + PIN, dan QR untuk masuk. 8 kartu per halaman A4.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-navy-900">Kartu untuk</p>
            <div className="space-y-1.5">
              {options.map((o) => (
                <label key={o.key} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 ${scope === o.key ? 'border-electric-500 bg-blue-50/60' : 'bg-white'} ${!o.n ? 'opacity-50' : ''}`}>
                  <input type="radio" name="scope" checked={scope === o.key} disabled={!o.n} onChange={() => setScopeChoice(o.key)} className="h-4 w-4 accent-[#1f7bff]" />
                  <span className="flex-1 text-sm font-medium text-navy-900">{o.label}</span>
                  <span className="tabular text-sm text-muted-foreground">{o.n} peserta</span>
                </label>
              ))}
            </div>
          </div>
          <SwitchRow label="Sertakan foto peserta" hint="Bila peserta belum punya foto, kartu menampilkan inisial nama." checked={photos} onChange={setPhotos} />
          <div className="flex gap-2.5 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Membuat kartu <b>mengganti PIN</b> setiap peserta yang dipilih dengan PIN baru yang dicetak di kartu. Gunakan ini sebelum kartu dibagikan; setelah dibagikan, jangan buat ulang kecuali ada peserta yang lupa PIN.</p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" disabled={!!busy || !rows.length} onClick={() => void sample()}>Unduh contoh (1 kartu, tanpa ganti PIN)</Button>
          <Button variant="accent" loading={!!busy} disabled={!rows.length} onClick={() => void generate()}><IdCard /> {busy ?? `Buat ${rows.length} kartu (PDF)`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
