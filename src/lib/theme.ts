// Per-form theming. A form's theme becomes CSS custom properties on the filler's
// root element, so every control inherits it without prop drilling.

import type { CSSProperties } from 'react'
import type { Theme } from './types'
import { DEFAULT_THEME } from './types'

export const FONT_STACKS: Record<Theme['font'], string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
}

export const THEME_PRESETS: { name: string; theme: Theme }[] = [
  { name: 'Ink', theme: { accent: '#4f46e5', background: '#ffffff', text: '#14161c', font: 'sans', backgroundStyle: 'solid' } },
  { name: 'Midnight', theme: { accent: '#818cf8', background: '#0d1017', text: '#eef1f7', font: 'sans', backgroundStyle: 'gradient' } },
  { name: 'Sage', theme: { accent: '#0f766e', background: '#f4f7f4', text: '#12211d', font: 'serif', backgroundStyle: 'solid' } },
  { name: 'Clay', theme: { accent: '#b4451f', background: '#fdf6f0', text: '#2b1a12', font: 'serif', backgroundStyle: 'dots' } },
  { name: 'Sky', theme: { accent: '#0369a1', background: '#f0f7ff', text: '#0b2033', font: 'sans', backgroundStyle: 'gradient' } },
  { name: 'Terminal', theme: { accent: '#22c55e', background: '#0b0f0c', text: '#e6f5ea', font: 'mono', backgroundStyle: 'solid' } },
]

export function mergeTheme(theme: Partial<Theme> | undefined): Theme {
  return { ...DEFAULT_THEME, ...(theme || {}) }
}

/** Relative luminance per WCAG, used to pick readable text on the accent colour. */
function luminance(hex: string) {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  const channels = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function readableOn(hex: string) {
  try {
    return luminance(hex) > 0.45 ? '#101318' : '#ffffff'
  } catch {
    return '#ffffff'
  }
}

/** rgba() string from a hex colour, for tints and borders derived from the theme. */
export function alpha(hex: string, amount: number) {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${amount})`
}

export function themeStyle(theme: Theme): CSSProperties {
  const merged = mergeTheme(theme)
  const backgrounds: Record<Theme['backgroundStyle'], string> = {
    solid: merged.background,
    gradient: `radial-gradient(120% 120% at 15% 0%, ${alpha(merged.accent, 0.16)} 0%, ${merged.background} 55%)`,
    dots: `radial-gradient(${alpha(merged.text, 0.13)} 1px, transparent 1px) 0 0 / 22px 22px, ${merged.background}`,
  }

  return {
    '--fill-accent': merged.accent,
    '--fill-accent-text': readableOn(merged.accent),
    '--fill-accent-soft': alpha(merged.accent, 0.12),
    '--fill-accent-line': alpha(merged.accent, 0.4),
    '--fill-bg': merged.background,
    '--fill-text': merged.text,
    '--fill-muted': alpha(merged.text, 0.62),
    '--fill-line': alpha(merged.text, 0.16),
    '--fill-surface': alpha(merged.text, 0.04),
    '--fill-font': FONT_STACKS[merged.font],
    background: backgrounds[merged.backgroundStyle],
    color: merged.text,
    fontFamily: FONT_STACKS[merged.font],
  } as CSSProperties
}
