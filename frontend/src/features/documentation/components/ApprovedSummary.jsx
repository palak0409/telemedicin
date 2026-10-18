import { SUMMARY_FIELDS } from '../fields'

/** Read-only, doctor-approved consultation record (used in patient views). */
export function ApprovedSummary({ summary, notes }) {
  const sections = SUMMARY_FIELDS.filter(([key]) => summary?.[key])
  if (!sections.length && !notes) return <p className="subtle">No summary has been added.</p>
  return (
    <dl className="dl-stacked dl-single">
      {sections.map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{summary[key]}</dd>
        </div>
      ))}
      {notes && (
        <div>
          <dt>Doctor's notes</dt>
          <dd>{notes}</dd>
        </div>
      )}
    </dl>
  )
}
