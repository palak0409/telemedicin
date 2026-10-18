/**
 * Reports how media is actually flowing by inspecting the selected ICE
 * candidate pair: "direct" (host or STUN server-reflexive candidates, i.e.
 * peer-to-peer) or "relay" (through a TURN server).
 */
export async function getConnectionRoute(pc) {
  const stats = await pc.getStats()
  let pair = null

  stats.forEach((report) => {
    if (report.type === 'transport' && report.selectedCandidatePairId) {
      pair = stats.get(report.selectedCandidatePairId)
    }
  })
  if (!pair) {
    // Firefox marks the active pair directly instead of via the transport report.
    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded' && (report.selected || report.nominated)) {
        pair = pair ?? report
      }
    })
  }
  if (!pair) return null

  const local = stats.get(pair.localCandidateId)
  const remote = stats.get(pair.remoteCandidateId)
  const relayed = local?.candidateType === 'relay' || remote?.candidateType === 'relay'
  return {
    type: relayed ? 'relay' : 'direct',
    localCandidate: local?.candidateType,
    protocol: local?.protocol,
    roundTripMs: pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null,
  }
}
