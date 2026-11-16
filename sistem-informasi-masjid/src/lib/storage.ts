import { MEDIA_BUCKET, supabase } from './supabase'

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
export const VIDEO_TYPES = ['video/mp4', 'video/webm']
export const MAX_IMAGE_MB = 5
export const MAX_VIDEO_MB = 50

export interface Uploaded { url: string; path: string; mediaType: 'image' | 'video' }

export function checkFile(file: File, accept: 'image' | 'media'): string | null {
  const isImage = IMAGE_TYPES.includes(file.type)
  const isVideo = VIDEO_TYPES.includes(file.type)
  if (!isImage && !(accept === 'media' && isVideo)) {
    return accept === 'media' ? 'Format tidak didukung. Gunakan PNG, JPG, WEBP, GIF, MP4, atau WEBM.' : 'Format tidak didukung. Gunakan PNG, JPG, WEBP, GIF, atau SVG.'
  }
  const max = (isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB) * 1024 * 1024
  if (file.size > max) return `Ukuran berkas maksimal ${isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB} MB.`
  return null
}

/** Unggah ke Supabase Storage: <mosque_id>/<folder>/<acak>.<ext> */
export async function uploadMedia(file: File, mosqueId: string, folder: string): Promise<Uploaded> {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
  const path = `${mosqueId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { cacheControl: '31536000', contentType: file.type, upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, path, mediaType: file.type.startsWith('video/') ? 'video' : 'image' }
}

export async function removeMedia(path: string | null | undefined): Promise<void> {
  if (!path) return
  await supabase.storage.from(MEDIA_BUCKET).remove([path]).catch(() => {})
}
