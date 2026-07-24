// Chart primitives for the analytics page.
//
// Every chart here encodes magnitude with a single hue (the app accent) because
// identity is carried by the row label, not by colour. That keeps the set
// colour-blind safe by construction: no categorical palette, no legend needed,
// and each value is printed next to its mark so nothing depends on colour alone.

import type { ReactNode } from 'react'

export function StatTile({
  label,
  value,
  sub,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
}) {
  return (
    <div className="stat-tile">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  )
}

export function ChartCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card card-pad col" style={{ gap: 12 }}>
      <div>
        <h2>{title}</h2>
        {hint && <p className="muted tiny">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export interface BarDatum {
  label: string
  count: number
}

/**
 * Horizontal bars for "how many chose each option". Bars share a scale set by
 * the largest value, and every row shows its count and share as text.
 */
export function BarList({ data, total }: { data: BarDatum[]; total: number }) {
  const max = Math.max(1, ...data.map((item) => item.count))

  if (!data.length) return <p className="muted small">No answers yet.</p>

  return (
    <div className="bar-list">
      {data.map((item) => {
        const share = total ? item.count / total : 0
        return (
          <div key={item.label} className="bar-row" title={`${item.label}: ${item.count} of ${total}`}>
            <div className="bar-head">
              <span className="truncate">{item.label}</span>
              <b>
                {item.count}
                <span className="muted" style={{ fontWeight: 400 }}>
                  {' '}
                  · {(share * 100).toFixed(0)}%
                </span>
              </b>
            </div>
            <div
              className="bar-track"
              role="img"
              aria-label={`${item.label}: ${item.count} responses, ${(share * 100).toFixed(0)} percent`}
            >
              <div className="bar-fill" style={{ width: `${(item.count / max) * 100}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * A 30-day column chart. Rendered as a small multiple (one series per chart,
 * shared scale) rather than two overlaid series, so no colour key is needed.
 */
export function MiniBars({
  series,
  max,
  label,
}: {
  series: { day: string; value: number }[]
  max: number
  label: string
}) {
  const ceiling = Math.max(1, max)

  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="muted tiny" style={{ marginBottom: 6 }}>
        {label} · peak {max}
      </figcaption>
      <div
        style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 92 }}
        role="img"
        aria-label={`${label} over the last 30 days, peaking at ${max}`}
      >
        {series.map((point) => (
          <div
            key={point.day}
            title={`${point.day}: ${point.value}`}
            style={{
              flex: 1,
              minWidth: 3,
              height: `${Math.max(point.value ? 6 : 2, (point.value / ceiling) * 100)}%`,
              borderRadius: '4px 4px 0 0',
              background: point.value ? 'var(--accent)' : 'var(--surface-2)',
            }}
          />
        ))}
      </div>
      <div className="row-between muted tiny" style={{ marginTop: 4 }}>
        <span>{series[0]?.day.slice(5)}</span>
        <span>{series[series.length - 1]?.day.slice(5)}</span>
      </div>
    </figure>
  )
}

/**
 * Drop-off through the form. Each row shows how many people answered that
 * question and how many were lost since the previous one.
 */
export function Funnel({
  steps,
  starts,
}: {
  steps: { id: string; title: string; reached: number; dropOff: number }[]
  starts: number
}) {
  if (!steps.length) return <p className="muted small">Add some questions to see the funnel.</p>

  return (
    <div>
      {steps.map((step, index) => {
        const share = starts ? step.reached / starts : 0
        return (
          <div key={step.id} className="funnel-row">
            <span className="q-index">{index + 1}</span>
            <div className="bar-row">
              <div className="bar-head">
                <span className="truncate">{step.title}</span>
                <b>
                  {step.reached}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    {' '}
                    · {(share * 100).toFixed(0)}%
                  </span>
                </b>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${share * 100}%` }} />
              </div>
              {step.dropOff > 0 && (
                <span className="tiny" style={{ color: 'var(--warning)' }}>
                  −{step.dropOff} dropped off here
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
