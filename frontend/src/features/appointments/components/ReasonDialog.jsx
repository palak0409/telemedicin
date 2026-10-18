import { useState } from 'react'
import { ErrorAlert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { Field } from '../../../components/ui/Field'
import { Modal } from '../../../components/ui/Modal'
import { useAsyncAction } from '../../../hooks/useAsyncAction'

/** Confirmation dialog for declining or cancelling, with an optional reason shared with the other person. */
export function ReasonDialog({ title, description, confirmLabel, onConfirm, onClose }) {
  const [reason, setReason] = useState('')
  const action = useAsyncAction(onConfirm)

  const confirm = async () => {
    try {
      await action.run(reason.trim() || null)
      onClose()
    } catch {
      // Shown inline.
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep appointment
          </Button>
          <Button variant="danger" loading={action.pending} onClick={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <p className="muted">{description}</p>}
      <Field label="Reason" optional hint="Shared with the other participant.">
        <textarea className="textarea" rows={3} maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <ErrorAlert error={action.error} />
    </Modal>
  )
}
