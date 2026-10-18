import { AlertTriangle, Circle, PanelRightClose, PanelRightOpen, RefreshCw, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Spinner } from '../../../components/ui/States'
import { useAuth } from '../../../context/AuthContext'
import { useApi } from '../../../hooks/useApi'
import { doctorName, formatClock, formatDate, formatTimeRange } from '../../../utils/format'
import { getAppointment } from '../../appointments/api'
import { uploadRecordings } from '../../documentation/api'
import { DocumentationPanel } from '../../documentation/components/DocumentationPanel'
import { useConsultationRecorder } from '../../documentation/hooks/useConsultationRecorder'
import { useDocumentationConfig } from '../../documentation/hooks/useDocumentationConfig'
import { MedicalSummary } from '../../patients/components/MedicalSummary'
import { CallEnded } from '../components/CallEnded'
import { EndCallButton, MediaToggles } from '../components/CallControls'
import { CallStatus } from '../components/CallStatus'
import { Lobby } from '../components/Lobby'
import { VideoTile } from '../components/VideoTile'
import { useConsultationCall } from '../hooks/useConsultationCall'
import { useLocalMedia } from '../hooks/useLocalMedia'
import '../consultation.css'

function useElapsed(since) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!since) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [since])
  return since ? (now - since) / 1000 : null
}

function SidePanel({ appointment, isDoctor }) {
  return (
    <aside className="room-panel" aria-label="Consultation details">
      <section>
        <h2>Appointment</h2>
        <p className="text-sm muted">
          {formatDate(appointment.start_time)} · {formatTimeRange(appointment.start_time, appointment.end_time)}
        </p>
        <h3 className="section-title" style={{ marginTop: 14 }}>
          Reason for visit
        </h3>
        <p className="pre-line">{appointment.reason}</p>
      </section>
      {isDoctor ? (
        <section>
          <h2>Patient</h2>
          <p className="strong" style={{ marginBottom: 10 }}>
            {appointment.patient.full_name}
          </p>
          <MedicalSummary
            compact
            medical={appointment.patient_info?.medical}
            age={appointment.patient_info?.age}
            gender={appointment.patient_info?.gender}
          />
        </section>
      ) : (
        <section>
          <h2>Doctor</h2>
          <p className="strong">{doctorName(appointment.doctor.full_name)}</p>
          <p className="text-sm muted">{appointment.doctor.specialization}</p>
        </section>
      )}
    </aside>
  )
}

function StageOverlay({ call, peerName }) {
  if (call.phase === 'failed') {
    return (
      <div className="stage-overlay">
        <AlertTriangle />
        <h2>Unable to connect</h2>
        <p>
          A direct connection could not be established, and no relay succeeded. This usually means a firewall or strict
          network is blocking the call; a TURN relay server is needed for these networks.
        </p>
        <Button variant="secondary" icon={RefreshCw} onClick={call.retry}>
          Try again
        </Button>
      </div>
    )
  }
  if (call.phase === 'waiting') {
    return (
      <div className="stage-overlay">
        <h2>Waiting for {peerName} to join</h2>
        <p>They have been notified that the consultation room is open.</p>
      </div>
    )
  }
  if (['joining', 'connecting'].includes(call.phase) || (call.phase === 'reconnecting' && !call.remoteStream)) {
    return (
      <div className="stage-overlay">
        <Spinner large />
        <p>{call.phase === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</p>
      </div>
    )
  }
  return null
}

export function ConsultationRoomPage() {
  const { appointmentId } = useParams()
  const { user } = useAuth()
  const isDoctor = user.role === 'doctor'
  const appointment = useApi(() => getAppointment(appointmentId), [appointmentId])
  const media = useLocalMedia()
  const call = useConsultationCall({
    appointmentId,
    localStream: media.stream,
    audioEnabled: media.audioEnabled,
    videoEnabled: media.videoEnabled,
  })
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 1100)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [endedAt, setEndedAt] = useState(null)
  const aiConfig = useDocumentationConfig(isDoctor)
  const recorder = useConsultationRecorder({ localStream: media.stream, remoteStream: call.remoteStream })
  const canRecord = isDoctor && aiConfig.transcription_enabled && recorder.supported
  const [upload, setUpload] = useState(null)
  const recordingsRef = useRef([])

  const startedAt = call.room?.consultation.started_at ? new Date(call.room.consultation.started_at).getTime() : call.connectedAt
  const elapsed = useElapsed(call.phase === 'ended' ? null : startedAt)
  const inCall = !['idle', 'joining', 'ended', 'error'].includes(call.phase)

  // The patient always sees when the doctor is recording; re-sent whenever the peer (re)joins.
  useEffect(() => {
    if (isDoctor && call.peer) call.sendSignal('recording-state', { recording: recorder.recording })
  }, [isDoctor, recorder.recording, call.peer, call.sendSignal])

  const uploadRecorded = async (consultationId) => {
    setUpload({ status: 'uploading' })
    try {
      await uploadRecordings(consultationId, recordingsRef.current)
      setUpload({ status: 'done' })
    } catch (error) {
      setUpload({ status: 'error', error, retry: () => uploadRecorded(consultationId) })
    }
  }

  // On end: finalize recordings (before releasing the microphone), then hand them to the server.
  useEffect(() => {
    if (call.phase !== 'ended') return
    ;(async () => {
      recordingsRef.current = isDoctor ? await recorder.finish() : []
      media.stop()
      setEndedAt(Date.now())
      if (recordingsRef.current.length && call.room) uploadRecorded(call.room.consultation.id)
    })()
  }, [call.phase])

  useEffect(() => {
    if (!inCall) return undefined
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [inCall])

  const backTo = `/${user.role}/appointments/${appointmentId}`
  const a = appointment.data
  const peerName = a ? (isDoctor ? a.patient.full_name : doctorName(a.doctor.full_name)) : 'the other participant'
  const peerPhoto = a ? (isDoctor ? a.patient.photo_url : a.doctor.photo_url) : null

  if (call.phase === 'ended') {
    return (
      <CallEnded
        endedBy={call.endedBy}
        durationSeconds={startedAt ? (endedAt - startedAt) / 1000 : null}
        appointmentUrl={backTo}
      >
        {isDoctor && call.room && endedAt && (
          <DocumentationPanel consultationId={call.room.consultation.id} notes={call.room.consultation.notes} upload={upload} />
        )}
      </CallEnded>
    )
  }

  if (call.phase === 'error') {
    return (
      <div className="room room-lobby">
        <div className="stage-overlay" style={{ position: 'static', margin: 'auto' }}>
          <AlertTriangle />
          <h2>You have left the consultation</h2>
          <p>{call.error}</p>
          <div className="row-sm">
            <Button variant="secondary" to={backTo}>
              Back to appointment
            </Button>
            <Button onClick={call.retry}>Rejoin</Button>
          </div>
        </div>
      </div>
    )
  }

  if (call.phase === 'idle' || call.phase === 'joining') {
    return <Lobby appointment={a} user={user} media={media} call={call} backTo={backTo} />
  }

  const remoteHasVideo = Boolean(call.remoteStream?.getVideoTracks().length) && call.remoteMedia.video

  return (
    <div className="room">
      <header className="room-topbar">
        <div className="room-title">
          <strong>{peerName}</strong>
          <CallStatus phase={call.phase} route={call.route} />
          {(recorder.recording || call.remoteRecording) && (
            <span className="recording-indicator">{isDoctor ? 'Recording' : 'Recorded for clinical notes'}</span>
          )}
        </div>
        <div className="row-sm">
          {elapsed != null && <span className="room-timer tabular">{formatClock(elapsed)}</span>}
          {a && (
            <button
              type="button"
              className="room-icon-button"
              aria-label={panelOpen ? 'Hide details' : 'Show details'}
              aria-pressed={panelOpen}
              onClick={() => setPanelOpen((v) => !v)}
            >
              {panelOpen ? <PanelRightClose /> : <PanelRightOpen />}
            </button>
          )}
        </div>
      </header>

      <div className="room-body">
        <div className="stage">
          <VideoTile
            className="remote"
            stream={call.remoteStream}
            name={peerName}
            photo={peerPhoto}
            showVideo={remoteHasVideo && call.phase !== 'waiting'}
            label={call.peer ? peerName : null}
            audioOff={!call.remoteMedia.audio}
          >
            {call.phase === 'connected' && !call.remoteMedia.video && <span>Camera is off</span>}
          </VideoTile>
          <StageOverlay call={call} peerName={peerName} />
          <VideoTile
            className="local"
            stream={media.stream}
            name={user.full_name}
            photo={user.photo_url}
            muted
            mirrored
            showVideo={media.hasVideo && media.videoEnabled}
            label="You"
            audioOff={!media.audioEnabled}
          />
        </div>
        {panelOpen && a && <SidePanel appointment={a} isDoctor={isDoctor} />}
      </div>

      <footer className="call-controls room-controls">
        <MediaToggles media={media} />
        {canRecord && (
          <button
            type="button"
            className={`call-button ${recorder.recording ? 'off' : ''}`}
            aria-pressed={recorder.recording}
            onClick={recorder.recording ? recorder.stop : recorder.start}
            title="Record audio to generate an AI-assisted draft of your notes. The patient is shown that the call is being recorded."
          >
            {recorder.recording ? <Square /> : <Circle />}
            <span>{recorder.recording ? 'Stop recording' : 'Record'}</span>
          </button>
        )}
        <EndCallButton onClick={() => setConfirmEnd(true)} />
      </footer>

      {confirmEnd && (
        <Modal
          title="End consultation?"
          onClose={() => setConfirmEnd(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
                Stay in call
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmEnd(false)
                  call.endCall()
                }}
              >
                End for everyone
              </Button>
            </>
          }
        >
          <p className="muted">
            The consultation will end for both participants and the appointment will be marked as completed.
          </p>
        </Modal>
      )}
    </div>
  )
}
