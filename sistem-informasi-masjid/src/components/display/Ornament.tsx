/** Siluet masjid sederhana — dipakai bila logo belum diunggah. */
export function MosqueMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="currentColor" aria-hidden>
      <path d="M32 6c-1.4 4.6-10.5 8.4-10.5 17.2 0 1.9.5 3.6 1.4 5h18.2c.9-1.4 1.4-3.1 1.4-5C42.5 14.400 33.400 10.600 32 6z" />
      <rect x="18" y="31" width="28" height="19" rx="1.5" />
      <rect x="9" y="22" width="5" height="28" rx="1" />
      <path d="M11.5 15l3 6h-6z" />
      <rect x="50" y="22" width="5" height="28" rx="1" />
      <path d="M52.5 15l3 6h-6z" />
      <rect x="6" y="52" width="52" height="4" rx="1.5" />
    </svg>
  )
}

/** Bintang delapan (rub el hizb) kecil sebagai pemisah. */
export function Star8({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 1l3.2 4.300 5.300-.800-.800 5.300L24 12l-4.300 3.200.800 5.300-5.300-.800L12 24l-3.200-4.300-5.300.800.800-5.300L0 12l4.300-3.200-.800-5.300 5.300.800z" transform="scale(.92) translate(1 1)" />
    </svg>
  )
}

/** Garis ornamen dengan bintang di tengah. */
export function Divider({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-4 text-tv-accent ${className}`}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-current opacity-60" />
      <Star8 className="h-5 w-5" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-current opacity-60" />
    </div>
  )
}
