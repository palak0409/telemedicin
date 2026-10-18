import { useCallback, useEffect, useRef, useState } from 'react'
import { describeMediaError, getLocalMedia, stopStream } from '../media'

/**
 * Owns the local camera/microphone stream for the consultation page:
 * acquisition, retry, mute / camera toggles, and release on unmount.
 */
export function useLocalMedia() {
  const [stream, setStream] = useState(null)
  const [status, setStatus] = useState('requesting') // requesting | ready | error
  const [error, setError] = useState(null)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [attempt, setAttempt] = useState({ audio: true, video: true, n: 0 })
  const streamRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setStatus('requesting')
    setError(null)
    getLocalMedia(attempt).then(
      (media) => {
        if (cancelled) return stopStream(media)
        streamRef.current = media
        setStream(media)
        setAudioEnabled(media.getAudioTracks().length > 0)
        setVideoEnabled(media.getVideoTracks().length > 0)
        setStatus('ready')
      },
      (err) => {
        if (cancelled) return
        setError(describeMediaError(err))
        setStatus('error')
      },
    )
    return () => {
      cancelled = true
      stopStream(streamRef.current)
      streamRef.current = null
    }
  }, [attempt])

  const toggleAudio = useCallback(() => {
    const tracks = streamRef.current?.getAudioTracks() ?? []
    if (!tracks.length) return
    const next = !tracks[0].enabled
    tracks.forEach((t) => (t.enabled = next))
    setAudioEnabled(next)
  }, [])

  // Disabling (rather than stopping) the track keeps the sender in place, so
  // turning the camera back on needs no renegotiation; the peer receives black frames meanwhile.
  const toggleVideo = useCallback(() => {
    const tracks = streamRef.current?.getVideoTracks() ?? []
    if (!tracks.length) return
    const next = !tracks[0].enabled
    tracks.forEach((t) => (t.enabled = next))
    setVideoEnabled(next)
  }, [])

  const stop = useCallback(() => {
    stopStream(streamRef.current)
    streamRef.current = null
    setStream(null)
  }, [])

  return {
    stream,
    status,
    error,
    audioEnabled,
    videoEnabled,
    hasAudio: Boolean(stream?.getAudioTracks().length),
    hasVideo: Boolean(stream?.getVideoTracks().length),
    toggleAudio,
    toggleVideo,
    stop,
    retry: () => setAttempt((a) => ({ audio: true, video: true, n: a.n + 1 })),
    continueWithoutDevices: () => setAttempt((a) => ({ audio: false, video: false, n: a.n + 1 })),
  }
}
