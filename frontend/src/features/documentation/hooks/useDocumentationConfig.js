import { useApi } from '../../../hooks/useApi'
import { getDocumentationConfig } from '../api'

/** Whether the server can transcribe/summarize. Failures simply disable the AI features. */
export function useDocumentationConfig(enabled = true) {
  const config = useApi(
    () => (enabled ? getDocumentationConfig().catch(() => null) : Promise.resolve(null)),
    [enabled],
  )
  return config.data ?? { transcription_enabled: false, summarization_enabled: false }
}
