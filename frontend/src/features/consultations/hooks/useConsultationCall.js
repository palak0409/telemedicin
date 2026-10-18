/**
 * One video consultation: signaling + RTCPeerConnection lifecycle.
 *
 *   join()  → POST /consultations/join     room id + ICE servers (STUN/TURN)
 *           → WebSocket /ws/consultations/{room}   authenticate, enter room
 *   joined (peer absent)  → wait
 *   peer-joined           → we were here first: create the SDP offer
 *   offer                 → set remote description, send SDP answer
 *   answer                → set remote description
 *   ice-candidate         → add (or queue until the remote description exists)
 *
 * Audio/video flows browser-to-browser over the RTCPeerConnection; the socket
 * only carries these small signaling messages. Everything is torn down on unmount.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { SOCKET_CLOSE, openSocket } from '../../../services/socket'
import { joinConsultation } from '../api'
import { getConnectionRoute } from '../connectionRoute'

const MAX_ICE_RESTARTS = 2
const MAX_SOCKET_RETRIES = 5
const DISCONNECT_GRACE_MS = 4000
const ANSWERER_FAIL_AFTER_MS = 15000

const CLOSE_MESSAGES = {
  [SOCKET_CLOSE.UNAUTHORIZED]: 'Your session has expired. Please sign in again.',
  [SOCKET_CLOSE.FORBIDDEN]: 'This consultation room is no longer available.',
  [SOCKET_CLOSE.REPLACED]: 'You joined this consultation from another tab or window.',
}

export function useConsultationCall({ appointmentId, localStream, audioEnabled, videoEnabled }) {
  const [session, setSession] = useState(0) // 0 = not joined; incremented to (re)join
  const [phase, setPhase] = useState('idle') // idle | joining | waiting | connecting | connected | reconnecting | failed | ended | error
  const [error, setError] = useState(null)
  const [room, setRoom] = useState(null)
  const [peer, setPeer] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [remoteMedia, setRemoteMedia] = useState({ audio: true, video: true })
  const [remoteRecording, setRemoteRecording] = useState(false)
  const [route, setRoute] = useState(null)
  const [connectedAt, setConnectedAt] = useState(null)
  const [endedBy, setEndedBy] = useState(null)

  const socketRef = useRef(null)
  const mediaStateRef = useRef({ audio: audioEnabled, video: videoEnabled })
  mediaStateRef.current = { audio: audioEnabled, video: videoEnabled }

  useEffect(() => {
    if (!session || !localStream) return undefined

    let disposed = false
    let ended = false
    let socket = null
    let rtcConfig = null
    let roomId = null
    let pc = null
    let isOfferer = false
    let pendingCandidates = []
    let fallbackRemoteStream = null
    let restartAttempts = 0
    let socketRetries = 0
    let queue = Promise.resolve()
    let disconnectTimer = null
    let failTimer = null
    let statsTimer = null
    let reconnectTimer = null

    const sendMediaState = () => socket?.send('media-state', mediaStateRef.current)
    const reportError = (err) => {
      console.error('Consultation signaling error', err)
      setError(err?.message ?? 'A connection error occurred.')
    }

    function closePeerConnection() {
      clearTimeout(disconnectTimer)
      clearTimeout(failTimer)
      clearInterval(statsTimer)
      if (pc) {
        pc.onicecandidate = null
        pc.ontrack = null
        pc.onconnectionstatechange = null
        pc.close()
        pc = null
      }
      pendingCandidates = []
      fallbackRemoteStream = null
      isOfferer = false
      setRemoteStream(null)
      setRoute(null)
    }

    function createPeerConnection({ asOfferer }) {
      closePeerConnection()
      const connection = new RTCPeerConnection(rtcConfig)
      pc = connection

      localStream.getTracks().forEach((track) => connection.addTrack(track, localStream))
      if (asOfferer) {
        // Still offer to *receive* audio/video we are not sending (e.g. no camera on this device).
        ;['audio', 'video'].forEach((kind) => {
          if (!localStream.getTracks().some((t) => t.kind === kind)) connection.addTransceiver(kind, { direction: 'recvonly' })
        })
      }

      connection.onicecandidate = ({ candidate }) => {
        if (candidate) socket?.send('ice-candidate', { candidate: candidate.toJSON() })
      }
      connection.ontrack = ({ track, streams }) => {
        let stream = streams[0]
        if (!stream) {
          fallbackRemoteStream = fallbackRemoteStream ?? new MediaStream()
          fallbackRemoteStream.addTrack(track)
          stream = fallbackRemoteStream
        }
        setRemoteStream(stream)
      }
      connection.onconnectionstatechange = () => {
        if (connection === pc) onConnectionState(connection.connectionState)
      }
      return connection
    }

    function onConnectionState(state) {
      clearTimeout(disconnectTimer)
      if (state === 'connected') {
        restartAttempts = 0
        clearTimeout(failTimer)
        setPhase('connected')
        setConnectedAt((at) => at ?? Date.now())
        updateRoute()
        clearInterval(statsTimer)
        statsTimer = setInterval(updateRoute, 5000)
      } else if (state === 'disconnected') {
        // Usually a short network blip that recovers on its own; restart ICE if it does not.
        setPhase('reconnecting')
        disconnectTimer = setTimeout(restartIce, DISCONNECT_GRACE_MS)
      } else if (state === 'failed') {
        restartIce()
      }
    }

    /**
     * ICE restart: gathers fresh candidates (possibly via TURN) without tearing
     * down the call. Only the offerer drives it, so both sides never restart at once.
     */
    function restartIce() {
      if (!pc || disposed) return
      if (isOfferer && restartAttempts < MAX_ICE_RESTARTS) {
        restartAttempts += 1
        setPhase('reconnecting')
        queue = queue.then(() => makeOffer({ iceRestart: true })).catch(reportError)
      } else if (isOfferer) {
        setPhase('failed')
      } else {
        setPhase('reconnecting')
        clearTimeout(failTimer)
        failTimer = setTimeout(() => {
          if (pc && pc.connectionState !== 'connected') setPhase('failed')
        }, ANSWERER_FAIL_AFTER_MS)
      }
    }

    async function updateRoute() {
      if (!pc) return
      try {
        setRoute(await getConnectionRoute(pc))
      } catch {
        // Stats are informational only.
      }
    }

    /** Creates an SDP offer and sends it to the remote peer through the signaling channel. */
    async function makeOffer({ iceRestart = false } = {}) {
      isOfferer = true
      const offer = await pc.createOffer({ iceRestart })
      await pc.setLocalDescription(offer)
      socket.send('offer', { sdp: pc.localDescription.toJSON() })
    }

    /** Applies the remote offer and replies with an SDP answer. Re-offers (ICE restarts) reuse the connection. */
    async function handleOffer(sdp) {
      if (!pc || isOfferer) createPeerConnection({ asOfferer: false })
      await pc.setRemoteDescription(sdp)
      await flushCandidates()
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.send('answer', { sdp: pc.localDescription.toJSON() })
    }

    async function handleAnswer(sdp) {
      if (!pc || pc.signalingState !== 'have-local-offer') return
      await pc.setRemoteDescription(sdp)
      await flushCandidates()
    }

    /** Candidates can arrive before the remote description is applied; those wait in a queue. */
    async function handleCandidate(candidate) {
      if (!pc || !candidate) return
      if (!pc.remoteDescription) {
        pendingCandidates.push(candidate)
        return
      }
      await pc.addIceCandidate(candidate).catch(() => {})
    }

    async function flushCandidates() {
      const queued = pendingCandidates
      pendingCandidates = []
      for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => {})
    }

    async function handleMessage({ type, data = {} }) {
      switch (type) {
        case 'joined':
          closePeerConnection()
          setPeer(data.peer)
          setPhase(data.peer ? 'connecting' : 'waiting')
          if (data.peer) sendMediaState()
          break
        case 'peer-joined':
          setPeer(data.peer)
          setPhase('connecting')
          createPeerConnection({ asOfferer: true })
          sendMediaState()
          await makeOffer()
          break
        case 'peer-left':
          closePeerConnection()
          setPeer(null)
          setRemoteMedia({ audio: true, video: true })
          setRemoteRecording(false)
          setPhase('waiting')
          break
        case 'offer':
          await handleOffer(data.sdp)
          break
        case 'answer':
          await handleAnswer(data.sdp)
          break
        case 'ice-candidate':
          await handleCandidate(data.candidate)
          break
        case 'media-state':
          setRemoteMedia({ audio: data.audio !== false, video: data.video !== false })
          break
        case 'recording-state':
          setRemoteRecording(Boolean(data.recording))
          break
        case 'consultation-ended':
          ended = true
          setEndedBy(data.ended_by ?? null)
          closePeerConnection()
          socket?.close()
          setPhase('ended')
          break
        case 'error':
          setError(data.message)
          break
        default:
          break
      }
    }

    function connect() {
      socket = openSocket(`/ws/consultations/${roomId}`, {
        onOpen: () => {
          socketRetries = 0
        },
        // Messages are processed strictly in order; SDP and ICE handling are async.
        onMessage: (message) => {
          queue = queue.then(() => handleMessage(message)).catch(reportError)
        },
        onClose: (event) => {
          if (disposed || ended) return
          closePeerConnection()
          if (CLOSE_MESSAGES[event.code]) {
            setError(CLOSE_MESSAGES[event.code])
            setPhase('error')
          } else if (socketRetries >= MAX_SOCKET_RETRIES) {
            setError('The connection to the consultation service was lost.')
            setPhase('error')
          } else {
            setPhase('reconnecting')
            reconnectTimer = setTimeout(connect, 1000 * 2 ** socketRetries)
            socketRetries += 1
          }
        },
      })
      socketRef.current = socket
    }

    async function start() {
      setPhase('joining')
      setError(null)
      try {
        const info = await joinConsultation(Number(appointmentId))
        if (disposed) return
        setRoom(info)
        rtcConfig = info.rtc_config
        roomId = info.room_id
        connect()
      } catch (err) {
        if (disposed) return
        setError(err.message)
        setPhase('idle')
        setSession(0)
      }
    }

    start()
    const pingTimer = setInterval(() => socket?.send('ping'), 25000)

    return () => {
      disposed = true
      clearInterval(pingTimer)
      clearTimeout(reconnectTimer)
      closePeerConnection()
      socket?.close()
      socketRef.current = null
    }
  }, [session, localStream, appointmentId])

  useEffect(() => {
    socketRef.current?.send('media-state', { audio: audioEnabled, video: videoEnabled })
  }, [audioEnabled, videoEnabled])

  const join = useCallback(() => setSession((s) => s + 1), [])

  const endCall = useCallback(() => {
    if (!socketRef.current?.send('end')) setError('Not connected to the consultation service. Please wait and try again.')
  }, [])

  const sendSignal = useCallback((type, data) => socketRef.current?.send(type, data) ?? false, [])

  return {
    phase,
    error,
    room,
    peer,
    remoteStream,
    remoteMedia,
    remoteRecording,
    route,
    connectedAt,
    endedBy,
    join,
    retry: join,
    endCall,
    sendSignal,
  }
}
