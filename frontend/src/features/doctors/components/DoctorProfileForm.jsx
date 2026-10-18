import { useState } from 'react'
import { Alert, ErrorAlert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { Card, CardBody, CardFooter, CardHeader } from '../../../components/ui/Card'
import { Field } from '../../../components/ui/Field'
import { TagInput } from '../../../components/ui/TagInput'
import { useApi } from '../../../hooks/useApi'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { listSpecializations, updateMyDoctorProfile } from '../api'

const fromProfile = (p) => ({
  specialization_id: String(p.specialization.id),
  sub_specialization: p.sub_specialization ?? '',
  license_number: p.license_number,
  qualifications: p.qualifications,
  medical_institution: p.medical_institution ?? '',
  clinic_affiliation: p.clinic_affiliation ?? '',
  years_of_practice: String(p.years_of_practice),
  languages: p.languages,
  consultation_fee: String(Number(p.consultation_fee) || ''),
  bio: p.bio ?? '',
})

export function DoctorProfileForm({ profile, onSaved }) {
  const [form, setForm] = useState(() => fromProfile(profile))
  const specializations = useApi(listSpecializations, [])
  const save = useAsyncAction(updateMyDoctorProfile)
  const errors = save.error?.fieldErrors ?? {}
  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    try {
      const saved = await save.run({
        ...form,
        specialization_id: Number(form.specialization_id),
        years_of_practice: Number(form.years_of_practice || 0),
        consultation_fee: Number(form.consultation_fee || 0),
      })
      onSaved(saved, profile)
    } catch {
      // Shown inline.
    }
  }

  const options = specializations.data ?? [profile.specialization]

  return (
    <Card>
      <CardHeader title="Professional profile" description="Shown to patients on your public profile." />
      <form onSubmit={submit} noValidate>
        <CardBody className="stack">
          {profile.verification_status === 'verified' && (
            <Alert tone="info">Changing your specialization or license number sends your profile back for verification.</Alert>
          )}
          {save.error && !Object.keys(errors).length && <ErrorAlert error={save.error} />}
          <div className="form-grid">
            <Field label="Specialization" error={errors.specialization_id}>
              <select className="select" value={form.specialization_id} onChange={set('specialization_id')}>
                {options.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sub-specialization" optional error={errors.sub_specialization}>
              <input className="input" value={form.sub_specialization} onChange={set('sub_specialization')} />
            </Field>
            <Field label="Medical license / registration ID" error={errors.license_number}>
              <input className="input" value={form.license_number} onChange={set('license_number')} />
            </Field>
            <Field label="Qualifications" error={errors.qualifications}>
              <input className="input" value={form.qualifications} onChange={set('qualifications')} />
            </Field>
            <Field label="Medical institution" hint="Where you obtained your degree" optional error={errors.medical_institution}>
              <input className="input" value={form.medical_institution} onChange={set('medical_institution')} />
            </Field>
            <Field label="Clinic / hospital affiliation" optional error={errors.clinic_affiliation}>
              <input className="input" value={form.clinic_affiliation} onChange={set('clinic_affiliation')} />
            </Field>
            <Field label="Years of practice" error={errors.years_of_practice}>
              <input className="input" type="number" min="0" max="70" value={form.years_of_practice} onChange={set('years_of_practice')} />
            </Field>
            <Field label="Consultation fee" error={errors.consultation_fee}>
              <input className="input" type="number" min="0" step="0.01" value={form.consultation_fee} onChange={set('consultation_fee')} />
            </Field>
            <Field label="Languages" hint="Press Enter after each language" error={errors.languages} className="span-2">
              <TagInput
                value={form.languages}
                onChange={(languages) => setForm((f) => ({ ...f, languages }))}
                placeholder="e.g. English"
              />
            </Field>
            <Field label="Professional biography" optional error={errors.bio} className="span-2">
              <textarea className="textarea" rows={5} maxLength={3000} value={form.bio} onChange={set('bio')} />
            </Field>
          </div>
        </CardBody>
        <CardFooter>
          <Button type="submit" loading={save.pending}>
            Save profile
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
