/**
 * Doctor-facing documentation workflow for one consultation:
 * processing status → transcript + AI draft → edit → approve.
 *
 * Falls back to plain manual notes whenever there is no recording or the AI
 * pipeline fails, so documentation is never blocked by an external service.
 */
import { useEffect, useState } from 'react'
import { Alert, ErrorAlert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../../components/ui/Card'
import { Field } from '../../../components/ui/Field'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { Tabs } from '../../../components/ui/Tabs'
import { useToast } from '../../../context/ToastContext'
import { useApi } from '../../../hooks/useApi'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { formatDateTime } from '../../../utils/format'
import { ConsultationNotesForm } from '../../consultations/components/ConsultationNotesForm'
import { useNotificationEvents } from '../../notifications/NotificationsContext'
import { approveDocumentation, getDocumentation, retryDocumentation, saveDocumentationDraft } from '../api'
import { PROCESSING, SUMMARY_FIELDS, emptySummary } from '../fields'
import { ProcessingSteps } from './ProcessingSteps'
import { TranscriptView } from './TranscriptView'
import '../documentation.css'

const POLL_MS = 3000

function ReviewForm({ consultationId, documentation, onSaved }) {
  const { showToast } = useToast()
  const [summary, setSummary] = useState(() => ({
    ...emptySummary(),
    ...(documentation.draft_summary ?? documentation.approved_summary ?? {}),
  }))
  const [notes, setNotes] = useState(documentation.notes ?? '')
  const draft = useAsyncAction(saveDocumentationDraft)
  const approve = useAsyncAction(approveDocumentation)
  const isApproved = documentation.status === 'approved'

  const payload = () => ({ summary, notes })
  const saveDraft = async () => {
    try {
      onSaved(await draft.run(consultationId, payload()))
      showToast({ title: 'Draft saved', tone: 'success' })
    } catch {
      // Shown inline.
    }
  }
  const finalize = async () => {
    try {
      onSaved(await approve.run(consultationId, payload()))
      showToast({
        title: isApproved ? 'Record updated' : 'Documentation approved',
        message: 'The patient can now see this summary.',
        tone: 'success',
      })
    } catch {
      // Shown inline.
    }
  }

  return (
    <div className="stack">
      {isApproved ? (
        <Alert tone="success" title="Approved">
          Finalized on {formatDateTime(documentation.approved_at)} and added to the patient's record. You can still
          correct it; approving again updates the record.
        </Alert>
      ) : documentation.ai_summary ? (
        <Alert tone="info" title="AI-generated draft">
          Generated from the transcript by {documentation.summary_model}. Check every section against the conversation
          and correct anything inaccurate. Only the version you approve is added to the patient's record.
        </Alert>
      ) : null}

      <div className="form-grid">
        {SUMMARY_FIELDS.map(([key, label]) => (
          <Field key={key} label={label} className="span-2">
            <textarea
              className="textarea"
              rows={key === 'plan' || key === 'symptoms' ? 3 : 2}
              maxLength={4000}
              value={summary[key]}
              placeholder="Not discussed"
              onChange={(e) => setSummary((s) => ({ ...s, [key]: e.target.value }))}
            />
          </Field>
        ))}
        <Field label="Additional notes" optional hint="Your own notes, added to the record as written." className="span-2">
          <textarea className="textarea" rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <ErrorAlert error={draft.error || approve.error} />
      <div className="form-actions">
        {!isApproved && (
          <Button variant="secondary" loading={draft.pending} onClick={saveDraft}>
            Save draft
          </Button>
        )}
        <Button loading={approve.pending} onClick={finalize}>
          {isApproved ? 'Update approved record' : 'Approve and finalize'}
        </Button>
      </div>
    </div>
  )
}

export function DocumentationPanel({ consultationId, notes, upload }) {
  const [tab, setTab] = useState('summary')
  const retry = useAsyncAction(retryDocumentation)
  const query = useApi(
    () => getDocumentation(consultationId).catch((error) => (error.status === 404 ? null : Promise.reject(error))),
    [consultationId, upload?.status],
  )
  const documentation = query.data
  const processing = upload?.status === 'uploading' || PROCESSING.includes(documentation?.status)

  useEffect(() => {
    if (!PROCESSING.includes(documentation?.status)) return undefined
    const timer = setInterval(query.reload, POLL_MS)
    return () => clearInterval(timer)
  }, [documentation?.status, query.reload])

  useNotificationEvents((n) => n.type.startsWith('documentation_') && query.reload())

  const header = <CardHeader title="Consultation documentation" description="Transcript, AI-assisted summary and your approval." />

  if (query.loading && !documentation && upload?.status !== 'uploading') {
    return (
      <Card>
        {header}
        <LoadingState compact />
      </Card>
    )
  }
  if (query.error) {
    return (
      <Card>
        {header}
        <ErrorState compact error={query.error} onRetry={query.reload} />
      </Card>
    )
  }

  // No recording (or upload failed): manual notes only.
  if (!documentation && upload?.status !== 'uploading') {
    return (
      <Card>
        {header}
        <CardBody className="stack">
          {upload?.status === 'error' ? (
            <Alert
              tone="danger"
              title="The recording could not be uploaded"
              action={
                <Button size="sm" variant="secondary" onClick={upload.retry}>
                  Retry upload
                </Button>
              }
            >
              {upload.error?.message} You can write your notes manually below.
            </Alert>
          ) : (
            <p className="muted text-sm">This consultation was not recorded, so there is no AI draft. Write your notes below.</p>
          )}
          <ConsultationNotesForm consultationId={consultationId} initialNotes={notes} />
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      {header}
      <CardBody className="stack">
        {documentation?.status !== 'approved' && <ProcessingSteps uploading={upload?.status === 'uploading'} documentation={documentation} />}

        {processing && (
          <p className="muted text-sm">
            This usually takes under a minute. You can leave this page; you will be notified when the draft is ready.
          </p>
        )}

        {documentation?.status === 'failed' && (
          <Alert
            tone="danger"
            title={documentation.failed_stage === 'summary' ? 'The summary could not be generated' : 'The audio could not be transcribed'}
            action={
              documentation.can_retry && (
                <Button size="sm" variant="secondary" loading={retry.pending} onClick={() => retry.run(consultationId).then(query.reload, () => {})}>
                  Retry
                </Button>
              )
            }
          >
            {documentation.error_message} You can still write and approve the documentation yourself.
          </Alert>
        )}
        <ErrorAlert error={retry.error} />

        {documentation && !processing && (
          <>
            <Tabs
              label="Documentation"
              value={tab}
              onChange={setTab}
              items={[
                { value: 'summary', label: 'Summary' },
                { value: 'transcript', label: 'Transcript', count: documentation.transcript?.length ?? 0 },
              ]}
            />
            {tab === 'transcript' ? (
              <TranscriptView documentation={documentation} />
            ) : (
              <ReviewForm
                key={`${documentation.status}-${documentation.approved_at}`}
                consultationId={consultationId}
                documentation={documentation}
                onSaved={query.setData}
              />
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}
