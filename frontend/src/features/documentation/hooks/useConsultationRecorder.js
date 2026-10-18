/**
 * Records consultation audio in the doctor's browser for AI documentation.
 *
 * The doctor's own microphone and the patient's incoming WebRTC audio track are
 * recorded as separate files. Because each file contains one speaker, the server
 * can label transcript lines "Doctor" / "Patient" without a diarization model.
 * Every file stores its start offset (seconds since recording began) so both
 * sides can be interleaved on one timeline. If the patient reconnects, their new
 * audio track is recorded as an additional segment.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
const BITRATE = 32000 // ≈ 7 MB for 30 minutes, well under the 25 MB transcription limit

const pickMimeType = () => MIME_TYPES.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) ?? ''

export function useConsultationRecorder({ localStream, remoteStream }) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState(null)
  const active = useRef({}) // speaker → { recorder, track, chunks, offset, done }
  const finished = useRef([]) // [{ speaker, offset, blob }]
  const startedAt = useRef(null)
  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window

  const startTrack = useCallback((speaker, track) => {
    const mimeType = pickMimeType()
    const recorder = new MediaRecorder(new MediaStream([track]), { mimeType, audioBitsPerSecond: BITRATE })
    const entry = { recorder, track, chunks: [], offset: (Date.now() - startedAt.current) / 1000 }
    entry.done = new Promise((resolve) => {
      recorder.ondataavailable = (event) => event.data.size && entry.chunks.push(event.data)
      // Fires on stop() and also when the track ends (e.g. the peer connection closes).
      recorder.onstop = () => {
        if (entry.chunks.length) {
          finished.current.push({
            speaker,
            offset: Math.round(entry.offset * 100) / 100,
            blob: new Blob(entry.chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }),
          })
        }
        resolve()
      }
    })
    recorder.start(1000)
    active.current[speaker] = entry
  }, [])

  const stopTrack = useCallback((speaker) => {
    const entry = active.current[speaker]
    if (!entry) return Promise.resolve()
    delete active.current[speaker]
    if (entry.recorder.state !== 'inactive') entry.recorder.stop()
    return entry.done
  }, [])

  // Keep recording the patient's current audio track; it changes if they reconnect.
  useEffect(() => {
    if (!recording || !remoteStream) return undefined
    const sync = () => {
      const track = remoteStream.getAudioTracks().find((t) => t.readyState === 'live')
      const current = active.current.patient
      if (current?.track === track) return
      if (current) stopTrack('patient')
      if (track) startTrack('patient', track)
    }
    sync()
    remoteStream.addEventListener('addtrack', sync)
    return () => remoteStream.removeEventListener('addtrack', sync)
  }, [recording, remoteStream, startTrack, stopTrack])

  const start = useCallback(() => {
    setError(null)
    try {
      startedAt.current = startedAt.current ?? Date.now()
      const mic = localStream?.getAudioTracks()[0]
      if (mic) startTrack('doctor', mic)
      setRecording(true)
    } catch (err) {
      setError('Recording is not supported in this browser.')
      console.error(err)
    }
  }, [localStream, startTrack])

  const stop = useCallback(async () => {
    setRecording(false)
    await Promise.all(Object.keys(active.current).map(stopTrack))
  }, [stopTrack])

  /** Stops everything and returns all recorded segments. */
  const finish = useCallback(async () => {
    await stop()
    return finished.current
  }, [stop])

  useEffect(
    () => () => {
      Object.values(active.current).forEach((entry) => entry.recorder.state !== 'inactive' && entry.recorder.stop())
    },
    [],
  )

  return { supported, recording, error, start, stop, finish }
}
