/** @type {import('tailwindcss').Config} */
// Ukuran "tv-*" dikalikan --fs (skala teks dari Pengaturan Display) agar terbaca dari jarak jauh.
const tv = (px) => `calc(${px}px * var(--fs, 1))`
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Poppins', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        arabic: ['Amiri', 'serif'],
      },
      colors: {
        gold: { 300: '#f0d98a', 400: '#e3c565', 500: '#d4af37', 600: '#b8932b' },
        tv: {
          bg: 'var(--tv-bg)', fg: 'var(--tv-fg)', muted: 'var(--tv-muted)', card: 'var(--tv-card)',
          line: 'var(--tv-line)', primary: 'var(--tv-primary)', accent: 'var(--tv-accent)', onaccent: 'var(--tv-on-accent)',
        },
      },
      fontSize: {
        'tv-xs': tv(18), 'tv-sm': tv(22), 'tv-base': tv(26), 'tv-lg': tv(30), 'tv-xl': tv(36),
        'tv-2xl': tv(44), 'tv-3xl': tv(56), 'tv-4xl': tv(72), 'tv-5xl': tv(96), 'tv-6xl': tv(140), 'tv-7xl': tv(200),
      },
      boxShadow: { soft: '0 10px 30px -12px rgba(2, 44, 34, 0.25)', card: '0 1px 2px rgba(16,24,40,.04), 0 8px 24px -12px rgba(16,24,40,.12)' },
      keyframes: {
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        pulseGold: { '0%,100%': { boxShadow: '0 0 0 0 var(--tv-accent-soft)' }, '50%': { boxShadow: '0 0 0 14px transparent' } },
      },
      animation: { 'pulse-gold': 'pulseGold 2s ease-in-out infinite' },
    },
  },
  plugins: [],
}
