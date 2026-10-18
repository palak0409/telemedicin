import { Check, Circle, X } from 'lucide-react'
import { Spinner } from '../../../components/ui/States'

const STEPS = [
  ['upload', 'Upload recording'],
  ['transcription', 'Transcribe audio'],
  ['summary', 'Draft summary'],
  ['review', 'Your review'],
]

/** Which step is current, derived from upload state and documentation status. */
function currentStep(uploading, documentation) {
  if (uploading) return { index: 0 }
  switch (documentation?.status) {
    case 'transcribing':
      return { index: 1 }
    case 'summarizing':
      return { index: 2 }
    case 'failed':
      return { index: documentation.failed_stage === 'summary' ? 2 : 1, failed: true }
    default:
      return { index: 3 }
  }
}

export function ProcessingSteps({ uploading, documentation }) {
  const { index, failed } = currentStep(uploading, documentation)
  return (
    <ol className="steps" aria-label="Documentation progress">
      {STEPS.map(([key, label], i) => {
        const state = i < index ? 'done' : i === index ? (failed ? 'failed' : 'current') : 'todo'
        return (
          <li key={key} className={`step step-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="step-icon" aria-hidden="true">
              {state === 'done' && <Check />}
              {state === 'failed' && <X />}
              {state === 'current' && (i === 3 ? <Circle /> : <Spinner />)}
              {state === 'todo' && <Circle />}
            </span>
            {label}
          </li>
        )
      })}
    </ol>
  )
}
