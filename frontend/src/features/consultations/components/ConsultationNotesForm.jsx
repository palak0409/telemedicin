import { useState } from 'react'
import { ErrorAlert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { Field } from '../../../components/ui/Field'
import { useToast } from '../../../context/ToastContext'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { updateConsultationNotes } from '../api'

/** Doctor's free-text clinical notes for a consultation; visible to the patient in their history. */
export function ConsultationNotesForm({ consultationId, initialNotes, onSaved }) {
  const { showToast } = useToast()
  const [notes, setNotes] = useState(initialNotes ?? '')
  const save = useAsyncAction(updateConsultationNotes)
  const dirty = notes !== (initialNotes ?? '')

  const submit = async (event) => {
    event.preventDefault()
    try {
      const saved = await save.run(consultationId, notes)
      onSaved?.(saved)
      showToast({ title: 'Notes saved', tone: 'success' })
    } catch {
      // Shown inline.
    }
  }

  return (
    <form className="stack-sm" onSubmit={submit}>
      <Field label="Consultation notes" hint="Assessment, advice and follow-up. The patient can read these notes.">
        <textarea className="textarea" rows={6} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorAlert error={save.error} />
      <div>
        <Button type="submit" variant="secondary" loading={save.pending} disabled={!dirty}>
          Save notes
        </Button>
      </div>
    </form>
  )
}
