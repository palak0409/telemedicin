import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { Spinner } from '../../../components/ui/States'
import { doctorName, formatDate, formatTimeRange } from '../../../utils/format'
import { MediaToggles } from './CallControls'
import { VideoTile } from './VideoTile'

/** Pre-join screen: camera/microphone check and appointment summary. */
export function Lobby({ appointment, user, media, call, backTo, extra }) {
  const isDoctor = user.role === 'doctor'
  const counterpart = appointment && (isDoctor ? appointment.patient.full_name : doctorName(appointment.doctor.full_name))
  const joining = call.phase === 'joining'

  return (
    <div className="room room-lobby">
      <Link to={backTo} className="room-back">
        <ChevronLeft /> Back to appointment
      </Link>
      <div className="lobby">
        <div className="lobby-preview">
          <VideoTile
            stream={media.stream}
            name={user.full_name}
            photo={user.photo_url}
            muted
            mirrored
            showVideo={media.hasVideo && media.videoEnabled}
            label="You"
            audioOff={!media.audioEnabled}
          >
            {media.status === 'requesting' && <span className="row-sm"><Spinner /> Starting camera…</span>}
            {media.status === 'ready' && !media.hasVideo && <span>Camera unavailable</span>}
            {media.status === 'ready' && media.hasVideo && !media.videoEnabled && <span>Camera is off</span>}
          </VideoTile>
          <div className="call-controls">
            <MediaToggles media={media} />
          </div>
        </div>

        <div className="lobby-panel">
          <h1>Ready to join?</h1>
          {appointment ? (
            <p className="muted">
              Consultation with <strong>{counterpart}</strong>
              <br />
              {formatDate(appointment.start_time)} · {formatTimeRange(appointment.start_time, appointment.end_time)}
            </p>
          ) : (
            <p className="muted">Loading appointment…</p>
          )}

          {media.status === 'error' && (
            <Alert
              tone="warning"
              title="Camera and microphone unavailable"
              action={null}
            >
              <p>{media.error}</p>
              <div className="row-sm wrap" style={{ marginTop: 8 }}>
                <Button size="sm" variant="secondary" onClick={media.retry}>
                  Try again
                </Button>
                <Button size="sm" variant="ghost" onClick={media.continueWithoutDevices}>
                  Join without camera and microphone
                </Button>
              </div>
            </Alert>
          )}
          {call.error && <Alert tone="danger">{call.error}</Alert>}
          {extra}

          <Button block loading={joining} disabled={media.status !== 'ready' || !appointment} onClick={call.join}>
            Join consultation
          </Button>
          <p className="text-xs subtle">
            Audio and video travel directly between you and the other participant over an encrypted connection.
          </p>
        </div>
      </div>
    </div>
  )
}
