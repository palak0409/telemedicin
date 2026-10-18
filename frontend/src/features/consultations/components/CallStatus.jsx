const STATUS = {
  joining: { text: 'Joining…', tone: 'pending' },
  waiting: { text: 'Waiting for the other participant', tone: 'pending' },
  connecting: { text: 'Connecting…', tone: 'pending' },
  connected: { text: 'Connected', tone: 'ok' },
  reconnecting: { text: 'Reconnecting…', tone: 'warn' },
  failed: { text: 'Connection failed', tone: 'bad' },
}

/** Connection state plus how media is routed (direct peer-to-peer or through a TURN relay). */
export function CallStatus({ phase, route }) {
  const status = STATUS[phase] ?? STATUS.connecting
  const routeText = phase === 'connected' && route ? (route.type === 'relay' ? 'Relayed via TURN' : 'Direct connection') : null
  return (
    <span className={`call-status ${status.tone}`} role="status" aria-live="polite">
      <span className="call-status-dot" aria-hidden="true" />
      {status.text}
      {routeText && <span className="call-status-route">· {routeText}</span>}
      {phase === 'connected' && route?.roundTripMs != null && <span className="call-status-route">· {route.roundTripMs} ms</span>}
    </span>
  )
}
