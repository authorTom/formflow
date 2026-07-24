import { Check } from 'lucide-react'
import { THEME_PRESETS, mergeTheme } from '../../lib/theme'
import type { FormDoc, FormSettings, Theme } from '../../lib/types'
import { classes } from '../../lib/util'
import { FormRunner } from '../FormRunner'

interface DesignTabProps {
  doc: FormDoc
  onThemeChange: (theme: Theme) => void
  onSettingsChange: (settings: FormSettings) => void
}

export function DesignTab({ doc, onThemeChange, onSettingsChange }: DesignTabProps) {
  const theme = mergeTheme(doc.theme)
  const settings = doc.settings

  const set = <K extends keyof Theme>(key: K, value: Theme[K]) => onThemeChange({ ...theme, [key]: value })

  return (
    <div className="page page-wide design-page">
      <div className="col" style={{ gap: 18 }}>
        <section className="card card-pad col" style={{ gap: 12 }}>
          <h2>Presets</h2>
          <div className="preset-grid">
            {THEME_PRESETS.map((preset) => {
              const isActive =
                preset.theme.accent === theme.accent &&
                preset.theme.background === theme.background &&
                preset.theme.font === theme.font
              return (
                <button
                  key={preset.name}
                  className={classes('preset', isActive && 'active')}
                  onClick={() => onThemeChange(preset.theme)}
                >
                  <span className="preset-swatches">
                    <span style={{ background: preset.theme.background, flex: 2 }} />
                    <span style={{ background: preset.theme.accent, flex: 1 }} />
                    <span style={{ background: preset.theme.text, flex: 1 }} />
                  </span>
                  <span className="tiny row" style={{ gap: 4 }}>
                    {isActive && <Check size={11} />}
                    {preset.name}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="card card-pad col" style={{ gap: 14 }}>
          <h2>Colours</h2>
          {(
            [
              ['accent', 'Accent', 'Buttons, highlights and the progress bar.'],
              ['background', 'Background', 'The page behind your questions.'],
              ['text', 'Text', 'Question and answer text.'],
            ] as const
          ).map(([key, label, hint]) => (
            <div key={key}>
              <label className="field-label">{label}</label>
              <div className="color-input">
                <input type="color" value={theme[key]} onChange={(event) => set(key, event.target.value)} />
                <input
                  className="input mono"
                  value={theme[key]}
                  onChange={(event) => set(key, event.target.value)}
                  spellCheck={false}
                />
              </div>
              <p className="field-hint">{hint}</p>
            </div>
          ))}
        </section>

        <section className="card card-pad col" style={{ gap: 14 }}>
          <h2>Typography &amp; background</h2>
          <div>
            <label className="field-label">Font</label>
            <div className="segmented">
              {(['sans', 'serif', 'mono'] as const).map((font) => (
                <button
                  key={font}
                  className={classes(theme.font === font && 'active')}
                  onClick={() => set('font', font)}
                >
                  {font === 'sans' ? 'Sans' : font === 'serif' ? 'Serif' : 'Mono'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="field-label">Background style</label>
            <div className="segmented">
              {(['solid', 'gradient', 'dots'] as const).map((style) => (
                <button
                  key={style}
                  className={classes(theme.backgroundStyle === style && 'active')}
                  onClick={() => set('backgroundStyle', style)}
                >
                  {style[0].toUpperCase() + style.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card card-pad col" style={{ gap: 12 }}>
          <h2>Behaviour</h2>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.showProgressBar}
              onChange={(event) => onSettingsChange({ ...settings, showProgressBar: event.target.checked })}
            />
            <span className="switch-track" />
            Show a progress bar
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.showQuestionNumbers}
              onChange={(event) => onSettingsChange({ ...settings, showQuestionNumbers: event.target.checked })}
            />
            <span className="switch-track" />
            Number the questions
          </label>
        </section>
      </div>

      <div className="canvas-frame" style={{ minHeight: 560, position: 'sticky', top: 84 }}>
        <FormRunner key={JSON.stringify(theme)} form={{ ...doc }} preview embedded />
      </div>
    </div>
  )
}
