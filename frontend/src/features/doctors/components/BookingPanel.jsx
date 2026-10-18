import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorAlert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../../components/ui/Card'
import { Field } from '../../../components/ui/Field'
import { useToast } from '../../../context/ToastContext'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { doctorName, formatCurrency, formatDayAndTime } from '../../../utils/format'
import { bookAppointment } from '../../appointments/api'
import { SlotPicker } from './SlotPicker'

export function BookingPanel({ doctor }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [slot, setSlot] = useState(null)
  const [reason, setReason] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const booking = useAsyncAction(bookAppointment)

  const reasonError = booking.error?.fieldErrors.reason
  const canSubmit = slot && reason.trim().length >= 5

  const submit = async (event) => {
    event.preventDefault()
    try {
      const appointment = await booking.run({ doctor_id: doctor.id, start_time: slot, reason: reason.trim() })
      showToast({
        title: 'Appointment requested',
        message: `${doctorName(doctor.full_name)} will confirm your request.`,
        tone: 'success',
      })
      navigate(`/patient/appointments/${appointment.id}`)
    } catch (error) {
      if (error.status === 409) {
        // Someone else took the slot: refresh availability so the list is accurate again.
        setSlot(null)
        setRefreshKey((key) => key + 1)
      }
    }
  }

  return (
    <Card>
      <CardHeader
        title="Book a consultation"
        description={`${formatCurrency(doctor.consultation_fee)} · ${doctor.consultation_duration_minutes} min video call`}
      />
      <CardBody>
        <form className="stack" onSubmit={submit}>
          <SlotPicker doctorId={doctor.id} selectedSlot={slot} onSelect={setSlot} refreshKey={refreshKey} />
          <Field
            label="Reason for visit"
            hint="Briefly describe your symptoms or what you would like to discuss."
            error={reasonError}
          >
            <textarea
              className="textarea"
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          {booking.error && !reasonError && <ErrorAlert error={booking.error} />}
          <Button type="submit" block loading={booking.pending} disabled={!canSubmit}>
            {slot ? `Request ${formatDayAndTime(slot)}` : 'Select a time'}
          </Button>
          <p className="text-xs subtle">
            The doctor reviews each request. You will be notified as soon as it is confirmed.
          </p>
        </form>
      </CardBody>
    </Card>
  )
}
