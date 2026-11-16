export type UserRole = 'super_admin' | 'admin_masjid' | 'operator'
export type PrayerKey = 'imsak' | 'subuh' | 'terbit' | 'duha' | 'zuhur' | 'asar' | 'magrib' | 'isya'
export type WajibKey = 'subuh' | 'zuhur' | 'asar' | 'magrib' | 'isya'
export type Timezone = 'WIB' | 'WITA' | 'WIT'
export type SpecialMode = 'normal' | 'ramadan' | 'idulfitri' | 'iduladha'

interface Stamped {
  id: string
  created_at: string
  updated_at: string
}

export interface Contact {
  name: string
  position: string
  phone: string
}

export interface MosqueProfile extends Stamped {
  name: string
  logo_url: string | null
  logo_path: string | null
  address: string
  city: string
  province: string
  history: string
  vision: string
  mission: string
  phone: string
  email: string
  website: string
  contacts: Contact[]
}

export interface AppUser extends Stamped {
  mosque_id: string | null
  full_name: string
  email: string
  role: UserRole
  is_active: boolean
}

export interface PrayerSchedule extends Stamped {
  mosque_id: string
  mode: 'auto' | 'manual'
  location_name: string
  latitude: number
  longitude: number
  timezone: Timezone
  calc_method: 'kemenag' | 'singapore' | 'mwl' | 'egyptian' | 'karachi' | 'umm_al_qura'
  madhab: 'syafii' | 'hanafi'
  ihtiyat_minutes: number
  imsak_offset: number
  duha_offset: number
  corrections: Partial<Record<PrayerKey, number>>
  manual_times: Partial<Record<PrayerKey, string>>
  iqamah_minutes: Partial<Record<WajibKey, number>>
  adzan_minutes: number
  salat_minutes: number
  jumat_minutes: number
  prayer_mode_enabled: boolean
  salat_screen_enabled: boolean
  countdown_enabled: boolean
  notify_sound: boolean
  hijri_offset: number
  imams: Partial<Record<WajibKey, string>>
  khatib_jumat: string
  imam_jumat: string
  muazin_jumat: string
}

export interface DisplaySettings extends Stamped {
  mosque_id: string
  layout: 'classic' | 'side'
  theme: 'dark' | 'light'
  primary_color: string
  accent_color: string
  font_scale: number
  running_text_enabled: boolean
  running_text_speed: number
  slideshow_enabled: boolean
  slideshow_duration: number
  show_info_panel: boolean
  info_panel_duration: number
  show_slide_announcements: boolean
  show_slide_events: boolean
  show_slide_finance: boolean
  show_slide_islamic: boolean
  show_slide_donation: boolean
  special_mode: 'auto' | SpecialMode
  friday_mode_enabled: boolean
  eid_greeting: string
  auto_fullscreen: boolean
  refresh_interval: number
  data_version: number
}

export interface DisplayDevice extends Stamped {
  mosque_id: string
  name: string
  code: string
  location: string
  layout: 'classic' | 'side' | null
  font_scale: number | null
  is_active: boolean
  last_seen_at: string | null
  screen_info: string
}

export type DeviceIdentity = Pick<DisplayDevice, 'id' | 'mosque_id' | 'name' | 'code' | 'layout' | 'font_scale' | 'is_active'>

export interface Announcement extends Stamped {
  mosque_id: string
  title: string
  content: string
  category: 'pengumuman' | 'kegiatan' | 'kebersihan' | 'infak' | 'pesan_islami'
  priority: number
  start_date: string | null
  end_date: string | null
  show_in_running_text: boolean
  show_on_slide: boolean
  is_active: boolean
}

export interface SlideContent extends Stamped {
  mosque_id: string
  title: string
  category: string
  media_type: 'image' | 'video'
  media_url: string
  storage_path: string | null
  caption: string
  duration_seconds: number | null
  sort_order: number
  start_date: string | null
  end_date: string | null
  is_active: boolean
}

export interface MosqueEvent extends Stamped {
  mosque_id: string
  name: string
  category: string
  is_routine: boolean
  weekday: number | null
  event_date: string | null
  start_time: string
  end_time: string | null
  location: string
  speaker: string
  description: string
  is_active: boolean
}

export interface FinancialTransaction extends Stamped {
  mosque_id: string
  type: 'income' | 'expense'
  category: string
  amount: number
  transaction_date: string
  description: string
}

export interface DonationAccount extends Stamped {
  mosque_id: string
  label: string
  bank_name: string
  account_number: string
  account_holder: string
  qr_content: string
  qris_image_url: string | null
  qris_image_path: string | null
  sort_order: number
  is_active: boolean
}

export interface IslamicContent extends Stamped {
  mosque_id: string
  type: 'ayat' | 'hadis' | 'doa' | 'kutipan'
  arabic_text: string
  translation: string
  source: string
  is_active: boolean
}

export interface FinanceSummary {
  income_total: number
  expense_total: number
  balance: number
  month_income: number
  month_expense: number
  week_infak: number
  last_date: string | null
  monthly: { month: string; income: number; expense: number }[]
}

/** Seluruh data yang dibutuhkan layar TV; disimpan utuh untuk mode offline. */
export interface DisplayBundle {
  mosque: MosqueProfile
  prayer: PrayerSchedule
  settings: DisplaySettings
  device: DeviceIdentity | null
  announcements: Announcement[]
  slides: SlideContent[]
  events: MosqueEvent[]
  accounts: DonationAccount[]
  islamic: IslamicContent[]
  finance: FinanceSummary | null
  fetchedAt: number
}
