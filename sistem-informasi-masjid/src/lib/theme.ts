import type { CSSProperties } from 'react'
import { luminance, mix, rgba } from './format'
import type { DisplaySettings } from './types'

/** Variabel CSS layar TV dari pengaturan warna admin. */
export function buildTheme(s: Pick<DisplaySettings, 'theme' | 'primary_color' | 'accent_color'>, fontScale: number): CSSProperties {
  const p = s.primary_color, a = s.accent_color
  const onAccent = luminance(a) > 0.35 ? '#1a1608' : '#ffffff'
  const dark = s.theme === 'dark'
  const deep = mix(p, '#000000', 0.82)
  const vars: Record<string, string> = dark
    ? {
        '--tv-bg': `radial-gradient(1200px 700px at 85% -10%, ${rgba(mix(p, '#ffffff', 0.15), 0.35)}, transparent 60%), linear-gradient(140deg, ${deep} 0%, ${mix(p, '#000000', 0.58)} 55%, ${deep} 100%)`,
        '--tv-fg': '#f8fafc',
        '--tv-muted': 'rgba(236, 253, 245, 0.72)',
        '--tv-card': 'rgba(255, 255, 255, 0.07)',
        '--tv-card-strong': 'rgba(255, 255, 255, 0.11)',
        '--tv-line': 'rgba(255, 255, 255, 0.13)',
        '--tv-primary': mix(p, '#ffffff', 0.45),
        '--tv-accent': a,
        '--tv-accent-text': mix(a, '#ffffff', 0.15),
        '--tv-accent-soft': rgba(a, 0.45),
        '--tv-on-accent': onAccent,
        '--tv-hl-bg': `linear-gradient(160deg, ${mix(a, '#ffffff', 0.3)} 0%, ${a} 55%, ${mix(a, '#000000', 0.18)} 100%)`,
        '--tv-hl-fg': onAccent,
        '--tv-ticker': 'rgba(0, 0, 0, 0.35)',
        '--tv-pattern-opacity': '0.05',
      }
    : {
        '--tv-bg': `linear-gradient(140deg, #ffffff 0%, ${mix(p, '#ffffff', 0.9)} 60%, ${mix(p, '#ffffff', 0.82)} 100%)`,
        '--tv-fg': mix(p, '#000000', 0.72),
        '--tv-muted': rgba(mix(p, '#000000', 0.6), 0.78),
        '--tv-card': 'rgba(255, 255, 255, 0.92)',
        '--tv-card-strong': '#ffffff',
        '--tv-line': rgba(p, 0.18),
        '--tv-primary': p,
        '--tv-accent': a,
        '--tv-accent-text': mix(a, '#000000', 0.42),
        '--tv-accent-soft': rgba(p, 0.35),
        '--tv-on-accent': onAccent,
        '--tv-hl-bg': `linear-gradient(160deg, ${mix(p, '#ffffff', 0.12)} 0%, ${mix(p, '#000000', 0.3)} 100%)`,
        '--tv-hl-fg': '#ffffff',
        '--tv-ticker': mix(p, '#000000', 0.55),
        '--tv-pattern-opacity': '0.06',
      }
  vars['--fs'] = String(fontScale)
  return vars as CSSProperties
}
