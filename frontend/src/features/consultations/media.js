/**
 * Local camera/microphone acquisition with sensible fallbacks.
 */
const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
const VIDEO = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' }

export async function getLocalMedia({ audio = true, video = true } = {}) {
  if (!audio && !video) return new MediaStream()
  if (!navigator.mediaDevices?.getUserMedia) {
    const error = new Error('Media devices are unavailable')
    error.name = 'InsecureContextError'
    throw error
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: audio && AUDIO, video: video && VIDEO })
  } catch (error) {
    // No camera, or the camera is busy: continue with audio so the consultation can still happen.
    if (video && audio && ['NotFoundError', 'NotReadableError', 'OverconstrainedError'].includes(error.name)) {
      return navigator.mediaDevices.getUserMedia({ audio: AUDIO })
    }
    throw error
  }
}

export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}

export function describeMediaError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera and microphone access was blocked. Allow access using the icon in your browser’s address bar, then try again.'
    case 'NotFoundError':
      return 'No microphone or camera was found. Connect a device and try again.'
    case 'NotReadableError':
      return 'Your camera or microphone is being used by another application. Close it and try again.'
    case 'InsecureContextError':
      return 'Video calls need a secure connection. Open the app over HTTPS or on localhost.'
    default:
      return 'Your camera and microphone could not be started.'
  }
}
