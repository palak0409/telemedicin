/** Sections of the structured consultation summary (same keys as the backend). */
export const SUMMARY_FIELDS = [
  ['chief_complaint', 'Chief complaint'],
  ['symptoms', 'Symptoms'],
  ['medical_history', 'Relevant medical history'],
  ['current_medications', 'Current medications'],
  ['allergies', 'Allergies'],
  ['observations', 'Important observations'],
  ['assessment', 'Assessment / diagnosis discussed'],
  ['plan', 'Treatment / medication plan'],
  ['follow_up', 'Follow-up instructions'],
]

export const emptySummary = () => Object.fromEntries(SUMMARY_FIELDS.map(([key]) => [key, '']))

export const PROCESSING = ['transcribing', 'summarizing']
