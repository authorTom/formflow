import { useState } from 'react'
import { Check, Copy, ExternalLink, Globe, Lock } from 'lucide-react'
import type { FormDoc } from '../../lib/types'
import { useToast } from '../Toast'

export function ShareTab({ doc, onPublishChange }: { doc: FormDoc; onPublishChange: (published: boolean) => void }) {
  const { toast, error } = useToast()
  const [copied, setCopied] = useState('')
  const url = `${location.origin}/f/${doc.slug}`
  const embed = `<iframe src="${url}" width="100%" height="640" frameborder="0" title="${doc.title.replace(
    /"/g,
    '&quot;',
  )}" allow="clipboard-write"></iframe>`

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied(''), 1600)
      toast('Copied to clipboard')
    } catch {
      error('Could not copy — select the text and copy manually.')
    }
  }

  return (
    <div className="page share-page">
      <section className="card card-pad col" style={{ gap: 12 }}>
        <div className="row-between">
          <div className="row">
            {doc.published ? <Globe size={18} /> : <Lock size={18} />}
            <div>
              <h2>{doc.published ? 'This form is live' : 'This form is a draft'}</h2>
              <p className="muted small">
                {doc.published
                  ? 'Anyone with the link can respond.'
                  : 'Publish it to start collecting responses.'}
              </p>
            </div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={doc.published}
              onChange={(event) => onPublishChange(event.target.checked)}
            />
            <span className="switch-track" />
            {doc.published ? 'Live' : 'Draft'}
          </label>
        </div>
      </section>

      <section className="card card-pad col" style={{ gap: 10 }}>
        <h2>Share a link</h2>
        <div className="link-box">
          <span>{url}</span>
          <button className="btn btn-sm" onClick={() => copy(url, 'url')}>
            {copied === 'url' ? <Check size={14} /> : <Copy size={14} />}
            Copy
          </button>
          <a className="btn btn-sm" href={url} target="_blank" rel="noreferrer">
            <ExternalLink size={14} />
            Open
          </a>
        </div>
        {!doc.published && (
          <p className="field-hint">
            The link returns “not available” until you publish. Use <b>Preview</b> in the builder to try it
            yourself in the meantime.
          </p>
        )}
      </section>

      <section className="card card-pad col" style={{ gap: 10 }}>
        <h2>Embed on your site</h2>
        <p className="muted small">Paste this where you want the form to appear.</p>
        <pre className="code-block">{embed}</pre>
        <div>
          <button className="btn" onClick={() => copy(embed, 'embed')}>
            {copied === 'embed' ? <Check size={15} /> : <Copy size={15} />}
            Copy embed code
          </button>
        </div>
      </section>
    </div>
  )
}
