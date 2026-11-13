import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, ExternalLink, MonitorPlay } from 'lucide-react'
import { toast } from 'sonner'
import { list } from '@/services/db'
import { useLevels } from '@/contexts/EventContext'
import { NeedEvent } from '@/features/auth/guards'
import { EmptyState, Loading, PageHeader, SessionStatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { CompetitionSession } from '@/types'

function Inner({ eventId }: { eventId: string }) {
  const { levelMap } = useLevels()
  const { data = [], isLoading } = useQuery({
    queryKey: ['sessions', eventId], refetchInterval: 10_000,
    queryFn: () => list<CompetitionSession>('competition_sessions', { filters: { event_id: eventId }, order: [{ column: 'created_at', ascending: false }] }),
  })
  const origin = location.origin
  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success('Tautan disalin') }
  return (
    <div>
      <PageHeader title="Live Scoreboard" description="Buka monitor di layar utama (TV/proyektor) dan bagikan QR halaman peserta. Tekan F pada monitor untuk layar penuh." />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          {isLoading ? <Loading /> : !data.length ? <Card><EmptyState title="Belum ada sesi" description="Buat sesi di menu Sesi Kompetisi." /></Card> : data.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1"><p className="font-heading font-semibold text-navy-900">{s.name}</p><p className="text-xs text-muted-foreground">{levelMap.get(s.education_level_id)?.name} · Kode <b className="font-mono tracking-wider">{s.code}</b> · <span className="break-all">{origin}/live/{s.code}</span></p></div>
                <SessionStatusBadge status={s.status} />
                <Button size="icon" variant="outline" onClick={() => copy(`${origin}/live/${s.code}`)} aria-label="Salin tautan"><Copy /></Button>
                <Button variant="accent" asChild><a href={`/live/${s.code}`} target="_blank" rel="noreferrer"><MonitorPlay /> Buka monitor <ExternalLink className="!h-3.5 !w-3.5" /></a></Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="h-fit text-center">
          <CardContent className="p-5">
            <p className="font-heading font-semibold text-navy-900">Masuk peserta</p>
            <div className="mx-auto my-4 w-fit rounded-xl border bg-white p-3"><QRCodeSVG value={`${origin}/peserta`} size={190} level="M" /></div>
            <p className="break-all text-xs text-muted-foreground">{origin}/peserta</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => copy(`${origin}/peserta`)}><Copy /> Salin</Button>
            <p className="mt-3 text-xs text-muted-foreground">Tayangkan QR ini di monitor atau cetak di pintu masuk.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
export default function ScoreboardAdminPage() { return <NeedEvent>{(id) => <Inner key={id} eventId={id} />}</NeedEvent> }
