import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import { AppHeader } from '../components/AppHeader'
import { useToast } from '../components/Toast'
import { WorkspaceNav } from '../components/builder/WorkspaceNav'
import { BarList, ChartCard, Funnel, MiniBars, StatTile } from '../components/Charts'
import { api, ApiError } from '../lib/api'
import type { Analytics, Field } from '../lib/types'
import { describeRecall } from '../lib/recall'
import { formatDuration, percent } from '../lib/util'

/** Fills gaps so a quiet week still renders 30 columns rather than 3. */
function zeroFill(daily: Analytics['daily'], days = 30) {
  const byDay = new Map(daily.map((row) => [row.day, row]))
  const out: { day: string; starts: number; completions: number }[] = []
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = new Date(Date.now() - offset * 86400_000).toISOString().slice(0, 10)
    const row = byDay.get(day)
    out.push({ day, starts: row?.starts ?? 0, completions: row?.completions ?? 0 })
  }
  return out
}

export function AnalyticsPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { error } = useToast()
  const [data, setData] = useState<Analytics | null>(null)
  const [formTitle, setFormTitle] = useState('')
  // Needed to render recall tokens in question titles as something readable.
  const [fields, setFields] = useState<Field[]>([])

  const load = useCallback(() => {
    Promise.all([api.analytics(id), api.getForm(id)])
      .then(([analytics, form]) => {
        setData(analytics)
        setFormTitle(form.form.title)
        setFields(form.form.fields)
      })
      .catch((err) => {
        error(err instanceof ApiError ? err.message : 'Could not load analytics.')
        navigate('/', { replace: true })
      })
  }, [id, error, navigate])

  useEffect(load, [load])

  const daily = useMemo(() => (data ? zeroFill(data.daily) : []), [data])
  // Small multiples share one scale, so the two charts stay comparable.
  const dailyMax = Math.max(1, ...daily.map((row) => Math.max(row.starts, row.completions)))

  return (
    <div className="app-shell">
      <AppHeader
        center={
          <>
            <span className="header-title truncate">{formTitle || 'Form'}</span>
            <span className="header-sep hidden-sm">/</span>
            <WorkspaceNav formId={id} active="analytics" />
          </>
        }
      />

      <main className="page page-wide col" style={{ gap: 18 }}>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1>Analytics</h1>
            <p className="muted small">How people move through this form.</p>
          </div>
        </div>

        {!data ? (
          <div className="skeleton" style={{ height: 320, borderRadius: 14 }} />
        ) : data.summary.views === 0 && data.summary.starts === 0 ? (
          <div className="empty">
            <span className="empty-mark">
              <BarChart3 size={22} />
            </span>
            <div>
              <h2 style={{ marginBottom: 4 }}>Nothing to measure yet</h2>
              <p className="muted small">
                Once people open and answer your form, views, completion rate and drop-off will show up here.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="stat-grid">
              <StatTile label="Views" value={data.summary.views} sub="Times the form was opened" />
              <StatTile
                label="Started"
                value={data.summary.starts}
                sub={`${percent(data.summary.viewToStartRate)} of views`}
              />
              <StatTile
                label="Completed"
                value={data.summary.completions}
                sub={`${data.summary.starts - data.summary.completions} left partway`}
              />
              <StatTile label="Completion rate" value={percent(data.summary.completionRate)} sub="Of those who started" />
              <StatTile
                label="Average time"
                value={formatDuration(data.summary.averageDurationMs)}
                sub="Completed responses only"
              />
            </div>

            <ChartCard title="Last 30 days" hint="Two views of the same period, on a shared scale.">
              <div className="chart-grid">
                <MiniBars
                  label="Started"
                  max={dailyMax}
                  series={daily.map((row) => ({ day: row.day, value: row.starts }))}
                />
                <MiniBars
                  label="Completed"
                  max={dailyMax}
                  series={daily.map((row) => ({ day: row.day, value: row.completions }))}
                />
              </div>
            </ChartCard>

            <ChartCard
              title="Drop-off by question"
              hint="How many of the people who started reached each question. Logic jumps mean some questions are skipped by design."
            >
              <Funnel
                steps={data.funnel.map((step) => ({ ...step, title: describeRecall(step.title, fields) }))}
                starts={data.summary.starts}
              />
            </ChartCard>

            <div className="chart-grid">
              {data.questions.map((question, index) => (
                <ChartCard
                  key={question.id}
                  title={`${index + 1}. ${describeRecall(question.title, fields) || 'Untitled question'}`}
                  hint={`${question.answered} answer${question.answered === 1 ? '' : 's'}`}
                >
                  {question.kind === 'choice' && <BarList data={question.options} total={question.answered} />}

                  {question.kind === 'numeric' && (
                    <>
                      <div className="row wrap" style={{ gap: 18, marginBottom: 4 }}>
                        <span className="stat-inline">
                          <b>{question.average == null ? '—' : question.average.toFixed(2)}</b>
                          <span>Average</span>
                        </span>
                        <span className="stat-inline">
                          <b>{question.min ?? '—'}</b>
                          <span>Lowest</span>
                        </span>
                        <span className="stat-inline">
                          <b>{question.max ?? '—'}</b>
                          <span>Highest</span>
                        </span>
                      </div>
                      <BarList
                        data={question.distribution.map((point) => ({
                          label: String(point.value),
                          count: point.count,
                        }))}
                        total={question.answered}
                      />
                    </>
                  )}

                  {question.kind === 'text' &&
                    (question.samples.length ? (
                      <div className="samples">
                        {question.samples.map((sample, sampleIndex) => (
                          <p key={sampleIndex} className="sample">
                            {sample}
                          </p>
                        ))}
                        <p className="muted tiny">Most recent answers. Export the CSV for all of them.</p>
                      </div>
                    ) : (
                      <p className="muted small">No answers yet.</p>
                    ))}
                </ChartCard>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
