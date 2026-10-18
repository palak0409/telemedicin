import { CheckCircle2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Card, CardBody } from '../../../components/ui/Card'
import { formatDuration } from '../../../utils/format'

/** Shown after the consultation ends. Doctors continue straight to documentation. */
export function CallEnded({ endedBy, durationSeconds, appointmentUrl, children }) {
  return (
    <div className="room-ended">
      <div className="room-ended-inner stack-lg">
        <Card>
          <CardBody className="stack">
            <div className="row">
              <CheckCircle2 aria-hidden="true" style={{ color: 'var(--success)', width: 28, height: 28 }} />
              <div>
                <h1>Consultation ended</h1>
                <p className="muted">
                  {endedBy ? `Ended by ${endedBy.full_name}` : 'The consultation has ended'}
                  {durationSeconds ? ` · ${formatDuration(durationSeconds)}` : ''}
                </p>
              </div>
            </div>
            <div className="row-sm">
              <Button variant="secondary" to={appointmentUrl}>
                Back to appointment
              </Button>
            </div>
          </CardBody>
        </Card>
        {children}
      </div>
    </div>
  )
}
