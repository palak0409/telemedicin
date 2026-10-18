import { Alert } from '../../../components/ui/Alert'
import { formatShortDate } from '../../../utils/format'
import { genderLabel } from '../../../utils/constants'

const FIELDS = [
  ['existing_conditions', 'Existing conditions'],
  ['chronic_conditions', 'Chronic conditions'],
  ['current_medications', 'Current medications'],
  ['previous_surgeries', 'Previous surgeries'],
  ['family_history', 'Family medical history'],
]

/** Read-only clinical summary shown to the treating doctor. Allergies are surfaced first. */
export function MedicalSummary({ medical, age, gender, compact = false }) {
  if (!medical) return <p className="muted">The patient has not added medical information yet.</p>
  const hasAllergies = medical.allergies && !/^(none|no|nil|none known)\.?$/i.test(medical.allergies.trim())

  return (
    <div className="stack">
      {hasAllergies ? (
        <Alert tone="warning" title="Allergies">
          {medical.allergies}
        </Alert>
      ) : (
        <p className="text-sm muted">Allergies: {medical.allergies || 'Not recorded'}</p>
      )}
      <dl className={compact ? 'dl-stacked dl-single' : 'dl-stacked'}>
        <div>
          <dt>Age / gender</dt>
          <dd>
            {age != null ? `${age} years` : 'Age not recorded'}
            {(gender || medical.gender) && ` · ${genderLabel(gender || medical.gender)}`}
          </dd>
        </div>
        <div>
          <dt>Blood group</dt>
          <dd>{medical.blood_group || '—'}</dd>
        </div>
        {FIELDS.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{medical[key] || '—'}</dd>
          </div>
        ))}
        {!compact && medical.emergency_contact_name && (
          <div>
            <dt>Emergency contact</dt>
            <dd>
              {medical.emergency_contact_name}
              {medical.emergency_contact_phone && ` · ${medical.emergency_contact_phone}`}
            </dd>
          </div>
        )}
      </dl>
      {medical.updated_at && <p className="text-xs subtle">Last updated by the patient on {formatShortDate(medical.updated_at)}</p>}
    </div>
  )
}
