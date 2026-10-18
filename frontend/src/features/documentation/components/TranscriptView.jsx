import { formatClock } from '../../../utils/format'

export function TranscriptView({ documentation }) {
  const { transcript, detected_languages: languages, transcription_model: model } = documentation
  if (!transcript?.length) return <p className="muted">No transcript is available.</p>

  return (
    <div className="stack">
      <p className="text-xs subtle">
        Transcribed with {model}
        {languages?.length ? ` · detected language: ${languages.join(', ')}` : ''}. Shown exactly as spoken.
      </p>
      <ol className="transcript">
        {transcript.map((turn, index) => (
          <li key={index} className={`transcript-turn ${turn.speaker}`}>
            <div className="transcript-meta">
              <span className="transcript-speaker">{turn.speaker === 'doctor' ? 'Doctor' : 'Patient'}</span>
              <span className="tabular">{formatClock(turn.start)}</span>
            </div>
            <p>{turn.text}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
