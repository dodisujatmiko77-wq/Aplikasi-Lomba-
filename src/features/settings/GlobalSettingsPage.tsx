import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { list, upsert } from '@/services/db'
import { useAction } from '@/hooks/useAction'
import { ScoringForm, type ScoringValues } from './ScoringForm'
import { ImageUpload, Loading, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import type { Branding } from '@/types'

interface Setting { key: string; value: unknown; is_public: boolean }
export const DEFAULT_BRANDING: Branding = {
  app_name: 'Lomba Rangking 1', tagline: 'Siapa Cepat, Siapa Tepat, Dialah Juara!', organizer: 'PGRI Kabupaten Way Kanan', product_owner: 'UPT SMPN 1 Baradatu', developer: 'Dodi Sujatmiko', logo_url: null,
  description: 'Platform kompetisi Rangking 1 yang menentukan juara dari kombinasi kecepatan dan ketepatan menjawab.',
}
const DEFAULT_SCORING: ScoringValues = { base_points: 100, speed_bonus: 50, wrong_penalty: 0, duration_seconds: 20, lead_seconds: 3, rounding_mode: 'round', rounding_decimals: 2 }

export default function GlobalSettingsPage() {
  const qc = useQueryClient()
  const { busyKey, run } = useAction()
  const { data, isLoading } = useQuery({ queryKey: ['app_settings'], queryFn: () => list<Setting>('app_settings') })
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING)
  const [scoring, setScoring] = useState<ScoringValues>(DEFAULT_SCORING)
  useEffect(() => {
    if (!data) return
    const get = (k: string) => data.find((s) => s.key === k)?.value as Record<string, unknown> | undefined
    setBranding({ ...DEFAULT_BRANDING, ...(get('branding') as Partial<Branding>) })
    setScoring({ ...DEFAULT_SCORING, ...(get('default_scoring') as Partial<ScoringValues>) })
  }, [data])

  const save = (key: string, value: unknown, is_public: boolean) =>
    run(async () => { await upsert('app_settings', { key, value, is_public }, 'key'); await qc.invalidateQueries({ queryKey: ['app_settings'] }) }, 'Pengaturan global tersimpan', key)

  if (isLoading) return <Loading />
  return (
    <div>
      <PageHeader title="Pengaturan Global" description="Identitas aplikasi dan nilai default untuk event baru. Hanya Superadmin." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Identitas aplikasi</CardTitle><CardDescription>Tampil di landing page, monitor, dan halaman peserta.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nama aplikasi"><Input value={branding.app_name} onChange={(e) => setBranding({ ...branding, app_name: e.target.value })} /></Field>
              <Field label="Penyelenggara lomba" hint="Pihak yang melaksanakan lomba."><Input value={branding.organizer} onChange={(e) => setBranding({ ...branding, organizer: e.target.value })} /></Field>
            </div>
            <Field label="Tagline"><Input value={branding.tagline} onChange={(e) => setBranding({ ...branding, tagline: e.target.value })} /></Field>
            <Field label="Deskripsi"><Textarea rows={3} value={branding.description} onChange={(e) => setBranding({ ...branding, description: e.target.value })} /></Field>
            <Field label="Pemilik produk (aplikasi)" hint="Instansi pemilik aplikasi, terpisah dari penyelenggara lomba."><Input value={branding.product_owner} onChange={(e) => setBranding({ ...branding, product_owner: e.target.value })} /></Field>
            <Field label="Pengembang"><Input value={branding.developer} onChange={(e) => setBranding({ ...branding, developer: e.target.value })} /></Field>
            <Field label="Logo"><ImageUpload bucket="branding" value={branding.logo_url} onChange={(url) => setBranding({ ...branding, logo_url: url })} label="Unggah logo" /></Field>
            <Button loading={busyKey === 'branding'} onClick={() => void save('branding', branding, true)}>Simpan identitas</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Penilaian default event baru</CardTitle><CardDescription>Disalin ke pengaturan setiap event yang dibuat setelah ini. Event yang sudah ada tidak berubah.</CardDescription></CardHeader>
          <CardContent>
            <ScoringForm value={scoring} onChange={setScoring} />
            <Button className="mt-5" loading={busyKey === 'default_scoring'} onClick={() => void save('default_scoring', scoring, false)}>Simpan default penilaian</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
