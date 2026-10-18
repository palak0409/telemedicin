import { useState } from 'react'
import { useToast } from '../../../context/ToastContext'
import { acceptAppointment, cancelAppointment, rejectAppointment } from '../api'
import { ReasonDialog } from './ReasonDialog'

/**
 * Accept / decline / cancel actions with their confirmation dialogs.
 * Returns the action callbacks and the dialog element to render.
 */
export function useAppointmentActions(onChanged) {
  const { showToast } = useToast()
  const [dialog, setDialog] = useState(null)
  const [accepting, setAccepting] = useState(null)

  const accept = async (appointment) => {
    setAccepting(appointment.id)
    try {
      const updated = await acceptAppointment(appointment.id)
      showToast({ title: 'Appointment confirmed', message: 'The patient has been notified.', tone: 'success' })
      onChanged?.(updated)
    } catch (error) {
      showToast({ title: 'Could not confirm', message: error.message, tone: 'danger' })
    } finally {
      setAccepting(null)
    }
  }

  const element = dialog && (
    <ReasonDialog
      title={dialog.kind === 'reject' ? 'Decline appointment request' : 'Cancel appointment'}
      description={
        dialog.kind === 'reject'
          ? 'The patient will be notified and the time slot becomes available again.'
          : 'The other participant will be notified and the time slot becomes available again.'
      }
      confirmLabel={dialog.kind === 'reject' ? 'Decline request' : 'Cancel appointment'}
      onClose={() => setDialog(null)}
      onConfirm={async (reason) => {
        const call = dialog.kind === 'reject' ? rejectAppointment : cancelAppointment
        const updated = await call(dialog.appointment.id, reason)
        showToast({ title: dialog.kind === 'reject' ? 'Request declined' : 'Appointment cancelled' })
        onChanged?.(updated)
      }}
    />
  )

  return {
    accept,
    accepting,
    reject: (appointment) => setDialog({ kind: 'reject', appointment }),
    cancel: (appointment) => setDialog({ kind: 'cancel', appointment }),
    dialog: element,
  }
}
