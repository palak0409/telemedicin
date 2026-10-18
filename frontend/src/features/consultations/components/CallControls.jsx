import { Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react'

export function MediaToggles({ media }) {
  return (
    <>
      <button
        type="button"
        className={`call-button ${media.audioEnabled ? '' : 'off'}`}
        onClick={media.toggleAudio}
        disabled={!media.hasAudio}
        aria-pressed={!media.audioEnabled}
        title={media.hasAudio ? undefined : 'No microphone available'}
      >
        {media.audioEnabled ? <Mic /> : <MicOff />}
        <span>{media.audioEnabled ? 'Mute' : 'Unmute'}</span>
      </button>
      <button
        type="button"
        className={`call-button ${media.videoEnabled ? '' : 'off'}`}
        onClick={media.toggleVideo}
        disabled={!media.hasVideo}
        aria-pressed={!media.videoEnabled}
        title={media.hasVideo ? undefined : 'No camera available'}
      >
        {media.videoEnabled ? <Video /> : <VideoOff />}
        <span>{media.videoEnabled ? 'Stop video' : 'Start video'}</span>
      </button>
    </>
  )
}

export function EndCallButton({ onClick, disabled }) {
  return (
    <button type="button" className="call-button end" onClick={onClick} disabled={disabled}>
      <PhoneOff />
      <span>End</span>
    </button>
  )
}
