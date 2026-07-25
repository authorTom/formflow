import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Globe, Lock, Share2, Trash2, Users } from 'lucide-react'
import type { FormAccess, FormDoc, FormShare } from '../../lib/types'
import { api, ApiError } from '../../lib/api'
import { useToast } from '../Toast'

interface ShareTabProps {
  doc: FormDoc
  onPublishChange: (published: boolean) => void
  onAccessChange: (access: FormAccess) => void
}

export function ShareTab({ doc, onPublishChange, onAccessChange }: ShareTabProps) {
  const { toast, error } = useToast()
  const [copied, setCopied] = useState('')
  const [shares, setShares] = useState<FormShare[]>(doc.shares ?? [])
  const [candidates, setCandidates] = useState<{ id: string; name: string }[]>([])
  const [addingGroup, setAddingGroup] = useState('')
  const [addingAccess, setAddingAccess] = useState<'edit' | 'view'>('view')

  const canManage = doc.permission === 'manage'
  const url = `${location.origin}/f/${doc.slug}`
  const embed = `<iframe src="${url}" width="100%" height="640" frameborder="0" title="${doc.title.replace(
    /"/g,
    '&quot;',
  )}" allow="clipboard-write"></iframe>`

  const loadShares = useCallback(() => {
    api
      .listShares(doc.id)
      .then((data) => {
        setShares(data.shares)
        setCandidates(data.candidates)
        setAddingGroup((current) => current || data.candidates[0]?.id || '')
      })
      .catch(() => undefined)
  }, [doc.id])
  useEffect(loadShares, [loadShares])

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

  const addShare = async () => {
    if (!addingGroup) return
    try {
      const { shares: next } = await api.setShare(doc.id, addingGroup, addingAccess)
      setShares(next)
      loadShares()
      toast('Group added')
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not share with that group.')
    }
  }

  const changeShare = async (share: FormShare, access: 'edit' | 'view') => {
    try {
      const { shares: next } = await api.setShare(doc.id, share.groupId, access)
      setShares(next)
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not change that.')
    }
  }

  const removeShare = async (share: FormShare) => {
    try {
      const { shares: next } = await api.removeShare(doc.id, share.groupId)
      setShares(next)
      loadShares()
      toast(`${share.groupName} no longer has access`)
    } catch (err) {
      error(err instanceof ApiError ? err.message : 'Could not remove that group.')
    }
  }

  const unshared = candidates.filter((group) => !shares.some((share) => share.groupId === group.id))

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
                  ? doc.access === 'link'
                    ? 'Anyone with the link can respond, without signing in.'
                    : 'Anyone signed in to this instance can respond.'
                  : 'Publish it to start collecting responses.'}
              </p>
            </div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={doc.published}
              disabled={doc.permission === 'view'}
              onChange={(event) => onPublishChange(event.target.checked)}
            />
            <span className="switch-track" />
            {doc.published ? 'Live' : 'Draft'}
          </label>
        </div>
      </section>

      <section className="card card-pad col" style={{ gap: 12 }}>
        <div>
          <h2>Who can fill this in</h2>
          <p className="muted small">
            This instance is internal, so forms need a sign-in unless you say otherwise.
          </p>
        </div>

        <div className="access-list">
          <label className={`access-option ${doc.access === 'internal' ? 'access-option-active' : ''}`}>
            <input
              type="radio"
              name="form-access"
              checked={doc.access === 'internal'}
              disabled={!canManage}
              onChange={() => onAccessChange('internal')}
            />
            <span>
              <b>
                <Lock size={13} style={{ verticalAlign: -1, marginRight: 6 }} />
                Signed-in people only
              </b>
              <em className="muted small">
                Anyone with an account on this instance can respond, and each response records who sent it.
              </em>
            </span>
          </label>

          <label className={`access-option ${doc.access === 'link' ? 'access-option-active' : ''}`}>
            <input
              type="radio"
              name="form-access"
              checked={doc.access === 'link'}
              disabled={!canManage}
              onChange={() => onAccessChange('link')}
            />
            <span>
              <b>
                <Globe size={13} style={{ verticalAlign: -1, marginRight: 6 }} />
                Anyone with the link
              </b>
              <em className="muted small">
                No sign-in needed, and responses are <b>anonymous</b> — no identity is recorded even for
                people who happen to be signed in. Use this for external respondents or genuinely anonymous
                feedback.
              </em>
            </span>
          </label>
        </div>

        {!canManage && (
          <p className="field-hint">Only a manager of {doc.groupName || 'this group'} can change this.</p>
        )}
      </section>

      <section className="card card-pad col" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 8 }}>
          <Share2 size={17} />
          <div>
            <h2>Share results with other groups</h2>
            <p className="muted small">
              Owned by <b>{doc.groupName || 'no group'}</b>. Add another group so they can see this form and
              its responses.
            </p>
          </div>
        </div>

        {shares.length > 0 && (
          <div className="col" style={{ gap: 8 }}>
            {shares.map((share) => (
              <div key={share.groupId} className="share-row">
                <span className="row" style={{ gap: 8, minWidth: 0 }}>
                  <Users size={15} />
                  <b>{share.groupName}</b>
                </span>
                <div className="row" style={{ gap: 6 }}>
                  <select
                    className="input input-sm"
                    value={share.access}
                    disabled={!canManage}
                    onChange={(event) => changeShare(share, event.target.value as 'edit' | 'view')}
                  >
                    <option value="view">Can view results</option>
                    <option value="edit">Can edit the form</option>
                  </select>
                  {canManage && (
                    <button
                      className="btn btn-ghost btn-sm menu-item-danger"
                      title={`Remove ${share.groupName}`}
                      onClick={() => removeShare(share)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {canManage &&
          (unshared.length > 0 ? (
            <div className="row" style={{ gap: 8 }}>
              <select
                className="input grow"
                value={addingGroup}
                onChange={(event) => setAddingGroup(event.target.value)}
              >
                {unshared.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={addingAccess}
                onChange={(event) => setAddingAccess(event.target.value as 'edit' | 'view')}
              >
                <option value="view">Can view results</option>
                <option value="edit">Can edit the form</option>
              </select>
              <button className="btn btn-primary" onClick={addShare}>
                Add
              </button>
            </div>
          ) : (
            <p className="field-hint">
              {shares.length > 0
                ? 'Every group you belong to already has access.'
                : 'There is no other group to share with yet.'}
            </p>
          ))}

        <p className="field-hint">
          A shared group never gains more than its members' own roles allow — someone who is a viewer in
          their group still only views, even where the share says “can edit”.
        </p>
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
        {doc.published && doc.access === 'internal' && (
          <p className="field-hint">
            Anyone opening this link is asked to sign in first, then sent straight back to the form.
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
        {doc.access === 'internal' && (
          <p className="field-hint">
            An embedded form still requires a sign-in, which browsers make awkward inside a frame on another
            site. Switch to “anyone with the link” if you intend to embed this.
          </p>
        )}
      </section>
    </div>
  )
}
