import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Download, ExternalLink, FileJson, Inbox, Paperclip, Trash2 } from 'lucide-react'
import { AppHeader } from '../components/AppHeader'
import { Modal, ConfirmDialog } from '../components/Modal'
import { useToast } from '../components/Toast'
import { WorkspaceNav } from '../components/builder/WorkspaceNav'
import { api, ApiError } from '../lib/api'
import type { AnswerValue, Field, ResponseRecord, UploadRecord } from '../lib/types'
import { NON_INPUT_TYPES } from '../lib/fieldTypes'
import { answerText, describeRecall } from '../lib/recall'
import { classes, formatBytes, formatDate, formatDuration } from '../lib/util'

type Filter = 'all' | 'completed' | 'partial'

export function ResultsPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { toast, error } = useToast()

  const [data, setData] = useState<{ responses: ResponseRecord[]; uploads: UploadRecord[]; fields: Field[] } | null>(
    null,
  )
  const [formTitle, setFormTitle] = useState('')
  const [open, setOpen] = useState<ResponseRecord | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ResponseRecord | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(() => {
    Promise.all([api.listResponses(id), api.getForm(id)])
      .then(([responses, form]) => {
        setData(responses)
        setFormTitle(form.form.title)
      })
      .catch((err) => {
        error(err instanceof ApiError ? err.message : 'Could not load responses.')
        navigate('/', { replace: true })
      })
  }, [id, error, navigate])

  useEffect(load, [load])

  const inputFields = useMemo(
    () => (data?.fields || []).filter((field) => !NON_INPUT_TYPES.includes(field.type)),
    [data],
  )

  const visible = useMemo(() => {
    const rows = data?.responses || []
    if (filter === 'completed') return rows.filter((row) => row.completed)
    if (filter === 'partial') return rows.filter((row) => !row.completed)
    return rows
  }, [data, filter])

  const uploadsFor = useCallback(
    (responseId: string, fieldId: string) =>
      (data?.uploads || []).find((upload) => upload.response_id === responseId && upload.field_id === fieldId),
    [data],
  )

  const remove = async (response: ResponseRecord) => {
    try {
      await api.deleteResponse(id, response.id)
      setData((current) =>
        current ? { ...current, responses: current.responses.filter((item) => item.id !== response.id) } : current,
      )
      setOpen(null)
      toast('Response deleted')
    } catch {
      error('Could not delete that response.')
    }
  }

  const total = data?.responses.length ?? 0
  const completed = data?.responses.filter((row) => row.completed).length ?? 0

  return (
    <div className="app-shell">
      <AppHeader
        center={
          <>
            <span className="header-title truncate">{formTitle || 'Form'}</span>
            <span className="header-sep hidden-sm">/</span>
            <WorkspaceNav formId={id} active="results" />
          </>
        }
        right={
          <>
            <a className="btn" href={api.exportUrl(id, 'csv')} download>
              <Download size={15} />
              <span className="hidden-sm">CSV</span>
            </a>
            <a className="btn" href={api.exportUrl(id, 'json')} download>
              <FileJson size={15} />
              <span className="hidden-sm">JSON</span>
            </a>
          </>
        }
      />

      <main className="page page-wide">
        <div className="page-head">
          <div>
            <h1>Responses</h1>
            <p className="muted small">
              {total} total · {completed} completed · {total - completed} partial
            </p>
          </div>

          <div className="segmented" style={{ width: 'auto' }}>
            {(
              [
                ['all', 'All'],
                ['completed', 'Completed'],
                ['partial', 'Partial'],
              ] as const
            ).map(([value, label]) => (
              <button key={value} className={classes(filter === value && 'active')} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {!data ? (
          <div className="skeleton" style={{ height: 260, borderRadius: 14 }} />
        ) : visible.length === 0 ? (
          <div className="empty">
            <span className="empty-mark">
              <Inbox size={22} />
            </span>
            <div>
              <h2 style={{ marginBottom: 4 }}>{total === 0 ? 'No responses yet' : 'Nothing matches this filter'}</h2>
              <p className="muted small">
                {total === 0
                  ? 'Publish the form and share its link — responses will appear here as they arrive.'
                  : 'Try a different filter.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Respondent</th>
                  <th>Status</th>
                  <th>Time</th>
                  {inputFields.map((field, index) => (
                    <th key={field.id}>
                      {describeRecall(field.title, data.fields) || `Question ${index + 1}`}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((response) => (
                  <tr key={response.id} onClick={() => setOpen(response)} style={{ cursor: 'pointer' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(response.submittedAt || response.startedAt)}</td>
                    <td className="cell-clip">
                      {response.respondent ? (
                        <span title={response.respondent.email}>
                          {response.respondent.name || response.respondent.email}
                        </span>
                      ) : (
                        <span className="muted">Anonymous</span>
                      )}
                    </td>
                    <td>
                      <span className={response.completed ? 'badge badge-live' : 'badge badge-draft'}>
                        {response.completed ? 'Complete' : 'Partial'}
                      </span>
                    </td>
                    <td className="mono">{formatDuration(response.durationMs)}</td>
                    {inputFields.map((field) => (
                      <td key={field.id} className="cell-clip" title={answerText(response.answers[field.id])}>
                        <CellValue
                          value={response.answers[field.id]}
                          upload={uploadsFor(response.id, field.id)}
                          formId={id}
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        className="btn btn-ghost btn-icon"
                        title="Delete response"
                        onClick={(event) => {
                          event.stopPropagation()
                          setPendingDelete(response)
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {open && (
        <Modal title="Response" onClose={() => setOpen(null)} wide>
          <div className="row wrap small muted" style={{ marginBottom: 10 }}>
            <span className={open.completed ? 'badge badge-live' : 'badge badge-draft'}>
              {open.completed ? 'Complete' : 'Partial'}
            </span>
            <span>{open.respondent ? open.respondent.email : 'Anonymous'}</span>
            <span>· Started {formatDate(open.startedAt)}</span>
            {open.submittedAt && <span>· Submitted {formatDate(open.submittedAt)}</span>}
            <span>· Took {formatDuration(open.durationMs)}</span>
          </div>

          <div className="response-detail">
            {inputFields.map((field, index) => {
              const value = open.answers[field.id]
              const upload = uploadsFor(open.id, field.id)
              const blank = value == null || value === '' || (Array.isArray(value) && value.length === 0)
              return (
                <div key={field.id} className="answer-block">
                  <span className="answer-q">
                    {index + 1}. {describeRecall(field.title, data?.fields ?? []) || 'Untitled question'}
                  </span>
                  <span className={classes('answer-a', blank && 'blank')}>
                    {blank ? 'No answer' : <CellValue value={value} upload={upload} formId={id} />}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="row" style={{ justifyContent: 'space-between', marginTop: 18 }}>
            <span className="mono tiny faint">{open.id}</span>
            <button className="btn btn-danger" onClick={() => setPendingDelete(open)}>
              <Trash2 size={15} />
              Delete
            </button>
          </div>
        </Modal>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this response?"
          message="The answers and any uploaded files will be permanently removed."
          confirmLabel="Delete"
          danger
          onConfirm={() => remove(pendingDelete)}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}

function CellValue({
  value,
  upload,
  formId,
}: {
  value: AnswerValue
  upload?: UploadRecord
  formId: string
}) {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'uploadId' in value) {
    if (!upload) return <span className="faint">{value.name}</span>
    return (
      <a
        className="row"
        style={{ gap: 5, display: 'inline-flex' }}
        href={api.fileUrl(formId, upload.id)}
        onClick={(event) => event.stopPropagation()}
      >
        <Paperclip size={13} />
        {upload.original_name}
        <span className="faint tiny">({formatBytes(upload.size)})</span>
        <ExternalLink size={11} />
      </a>
    )
  }

  const text = answerText(value)
  return text ? <>{text}</> : <span className="faint">—</span>
}
