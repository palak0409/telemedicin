import { useState } from 'react'
import { ErrorAlert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { Card, CardBody, CardFooter, CardHeader } from '../../../components/ui/Card'
import { Field } from '../../../components/ui/Field'
import { useToast } from '../../../context/ToastContext'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { BLOOD_GROUPS, GENDER_OPTIONS } from '../../../utils/constants'
import { formatShortDate } from '../../../utils/format'
import { updateMedicalProfile } from '../api'

const TEXT_FIELDS = [
  ['allergies', 'Allergies', 'Medicines, foods or other substances, and the reaction.'],
  ['existing_conditions', 'Existing conditions', 'Current health problems you are being treated for.'],
  ['chronic_conditions', 'Chronic conditions', 'Long-term conditions such as diabetes, asthma or hypertension.'],
  ['current_medications', 'Current medications', 'Name, dose and how often you take it.'],
  ['previous_surgeries', 'Previous surgeries', 'Procedure and approximate year.'],
  ['family_history', 'Family medical history', 'Relevant conditions in parents or siblings.'],
]

const toForm = (m) =>
  Object.fromEntries(
    [
      'date_of_birth',
      'gender',
      'blood_group',
      'emergency_contact_name',
      'emergency_contact_phone',
      ...TEXT_FIELDS.map(([k]) => k),
    ].map((key) => [key, m?.[key] ?? '']),
  )

export function MedicalProfileForm({ profile, onSaved }) {
  const { showToast } = useToast()
  const [form, setForm] = useState(() => toForm(profile))
  const save = useAsyncAction(updateMedicalProfile)
  const errors = save.error?.fieldErrors ?? {}
  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    try {
      const saved = await save.run({ ...form, date_of_birth: form.date_of_birth || null })
      onSaved?.(saved)
      showToast({ title: 'Medical information saved', tone: 'success' })
    } catch {
      // Shown inline.
    }
  }

  return (
    <Card>
      <CardHeader
        title="Medical information"
        description="Shared only with doctors you have an appointment with."
      />
      <form onSubmit={submit} noValidate>
        <CardBody className="stack">
          {save.error && !Object.keys(errors).length && <ErrorAlert error={save.error} />}
          <div className="form-grid">
            <Field label="Date of birth" error={errors.date_of_birth}>
              <input className="input" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
            </Field>
            <Field label="Gender" error={errors.gender}>
              <select className="select" value={form.gender} onChange={set('gender')}>
                <option value="">Select…</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Blood group" error={errors.blood_group}>
              <select className="select" value={form.blood_group} onChange={set('blood_group')}>
                <option value="">Unknown</option>
                {BLOOD_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
            <div />
            {TEXT_FIELDS.map(([key, label, hint]) => (
              <Field key={key} label={label} hint={hint} error={errors[key]} className="span-2">
                <textarea className="textarea" rows={2} maxLength={2000} value={form[key]} onChange={set(key)} />
              </Field>
            ))}
            <Field label="Emergency contact name" optional error={errors.emergency_contact_name}>
              <input className="input" value={form.emergency_contact_name} onChange={set('emergency_contact_name')} />
            </Field>
            <Field label="Emergency contact phone" optional error={errors.emergency_contact_phone}>
              <input className="input" type="tel" value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} />
            </Field>
          </div>
        </CardBody>
        <CardFooter>
          {profile?.updated_at && <span className="text-sm subtle grow">Last updated {formatShortDate(profile.updated_at)}</span>}
          <Button type="submit" loading={save.pending}>
            Save medical information
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
