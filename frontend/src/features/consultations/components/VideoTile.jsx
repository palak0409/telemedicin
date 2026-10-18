import { MicOff, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../../../components/ui/Avatar'

/**
 * Renders a MediaStream. The <video> element stays mounted even when the camera
 * is off so the remote participant's audio keeps playing.
 */
export function VideoTile({ stream, name, photo, label, muted = false, mirrored = false, showVideo, audioOff = false, className = '', children }) {
  const videoRef = useRef(null)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (video.srcObject !== stream) video.srcObject = stream ?? null
    if (stream) {
      video.play().catch((error) => {
        // Autoplay with sound can be blocked until the user interacts with the page.
        if (error.name === 'NotAllowedError') setBlocked(true)
      })
    }
  }, [stream])

  return (
    <div className={`video-tile ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={mirrored ? 'mirrored' : ''}
        style={{ visibility: showVideo ? 'visible' : 'hidden' }}
      />
      {!showVideo && (
        <div className="video-placeholder">
          <Avatar name={name} src={photo} size="xl" />
          {children}
        </div>
      )}
      {label && (
        <div className="video-label">
          {audioOff && <MicOff aria-label="Microphone off" />}
          {label}
        </div>
      )}
      {blocked && (
        <button
          type="button"
          className="btn btn-secondary btn-sm video-unblock"
          onClick={() => videoRef.current?.play().then(() => setBlocked(false))}
        >
          <Volume2 /> Enable audio
        </button>
      )}
    </div>
  )
}
