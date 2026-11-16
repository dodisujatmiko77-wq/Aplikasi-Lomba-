import { supabase } from './supabase'
import type { DeviceIdentity, DisplayBundle, FinanceSummary } from './types'

/** Kode layar tidak dikenal / belum ada profil masjid — bukan gangguan jaringan, jadi tidak ditutupi cache. */
export class DisplayConfigError extends Error {}

const cacheKey = (code: string | null) => `sim:bundle:${code ?? 'default'}`
export const DEVICE_CODE_KEY = 'sim:device-code'

export function readCachedBundle(code: string | null): DisplayBundle | null {
  try {
    const raw = localStorage.getItem(cacheKey(code))
    const b = raw ? (JSON.parse(raw) as DisplayBundle) : null
    return b?.mosque && b.prayer && b.settings ? b : null
  } catch {
    return null
  }
}

function writeCachedBundle(code: string | null, b: DisplayBundle) {
  try {
    localStorage.setItem(cacheKey(code), JSON.stringify(b))
  } catch {
    /* penyimpanan penuh/diblokir: layar tetap berjalan tanpa cache */
  }
}

const screenInfo = () => `${window.screen.width}x${window.screen.height} · ${navigator.userAgent.slice(0, 120)}`

export async function sendHeartbeat(code: string): Promise<DeviceIdentity | null> {
  const { data, error } = await supabase.rpc('display_heartbeat', { p_code: code, p_info: screenInfo() })
  if (error) throw error
  return (data as DeviceIdentity | null) ?? null
}

export async function fetchDataVersion(mosqueId: string): Promise<number> {
  const { data, error } = await supabase.from('display_settings').select('data_version').eq('mosque_id', mosqueId).limit(1)
  if (error) throw error
  return Number(data?.[0]?.data_version ?? 0)
}

function unwrap<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error
  return r.data as T
}

/** Memuat seluruh data layar dari Supabase dan menyimpannya untuk mode offline. */
export async function fetchBundle(code: string | null): Promise<DisplayBundle> {
  let device: DeviceIdentity | null = null
  let mosqueId: string
  if (code) {
    device = await sendHeartbeat(code)
    if (!device) throw new DisplayConfigError(`Kode layar "${code}" tidak terdaftar. Periksa menu Admin › Pengaturan Display › Perangkat.`)
    mosqueId = device.mosque_id
  } else {
    const first = unwrap(await supabase.from('mosque_profiles').select('id').order('created_at').limit(1))
    if (!first?.[0]) throw new DisplayConfigError('Profil masjid belum tersedia. Jalankan migrasi database terlebih dahulu.')
    mosqueId = first[0].id
  }

  const active = (table: string) => supabase.from(table).select('*').eq('mosque_id', mosqueId).eq('is_active', true)
  const [mosque, prayer, settings, announcements, slides, events, accounts, islamic, finance] = await Promise.all([
    supabase.from('mosque_profiles').select('*').eq('id', mosqueId).limit(1),
    supabase.from('prayer_schedules').select('*').eq('mosque_id', mosqueId).limit(1),
    supabase.from('display_settings').select('*').eq('mosque_id', mosqueId).limit(1),
    active('announcements').order('priority').order('created_at', { ascending: false }),
    active('slideshow_contents').order('sort_order').order('created_at'),
    active('mosque_events').order('event_date').order('start_time'),
    active('donation_accounts').order('sort_order').order('created_at'),
    active('islamic_contents').order('created_at'),
    supabase.rpc('get_finance_summary', { p_mosque_id: mosqueId }),
  ])
  const m = unwrap(mosque)?.[0], p = unwrap(prayer)?.[0], s = unwrap(settings)?.[0]
  if (!m || !p || !s) throw new DisplayConfigError('Data pengaturan masjid tidak lengkap. Jalankan ulang migrasi database.')

  const f = finance.error ? null : (finance.data as FinanceSummary | null)
  const bundle: DisplayBundle = {
    mosque: m,
    prayer: { ...p, latitude: Number(p.latitude), longitude: Number(p.longitude) },
    settings: { ...s, font_scale: Number(s.font_scale), data_version: Number(s.data_version) },
    device,
    announcements: unwrap(announcements) ?? [],
    slides: unwrap(slides) ?? [],
    events: unwrap(events) ?? [],
    accounts: unwrap(accounts) ?? [],
    islamic: unwrap(islamic) ?? [],
    finance: f
      ? { ...f, income_total: Number(f.income_total), expense_total: Number(f.expense_total), balance: Number(f.balance),
          month_income: Number(f.month_income), month_expense: Number(f.month_expense), week_infak: Number(f.week_infak),
          monthly: (f.monthly ?? []).map((x) => ({ month: x.month, income: Number(x.income), expense: Number(x.expense) })) }
      : null,
    fetchedAt: Date.now(),
  }
  writeCachedBundle(code, bundle)
  return bundle
}
