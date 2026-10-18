import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../../../components/layout/AuthLayout'
import { Alert, ErrorAlert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { Field } from '../../../components/ui/Field'
import { useAuth } from '../../../context/AuthContext'
import { useApi } from '../../../hooks/useApi'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { ROLE_HOME } from '../../../utils/constants'
import { listSpecializations } from '../../doctors/api'

const EMPTY = {
  full_name: '',
  email: '',
  phone: '',
  password: '',
  confirm_password: '',
  specialization_id: '',
  license_number: '',
  qualifications: '',
  years_of_practice: '',
}

function validate(form, isDoctor) {
  const errors = {}
  if (form.full_name.trim().length < 2) errors.full_name = 'Enter your full name'
  if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = 'Enter a valid email address'
  if (form.password.length < 8) errors.password = 'Use at least 8 characters'
  if (form.confirm_password !== form.password) errors.confirm_password = 'Passwords do not match'
  if (isDoctor) {
    if (!form.specialization_id) errors.specialization_id = 'Choose your specialization'
    if (form.license_number.trim().length < 3) errors.license_number = 'Enter your registration number'
    if (form.qualifications.trim().length < 2) errors.qualifications = 'Enter your qualifications'
    if (form.years_of_practice === '' || Number(form.years_of_practice) < 0) errors.years_of_practice = 'Enter years of practice'
  }
  return errors
}

export function RegisterPage() {
  const [params, setParams] = useSearchParams()
  const isDoctor = params.get('role') === 'doctor'
  const { registerPatient, registerDoctor } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [clientErrors, setClientErrors] = useState({})
  const specializations = useApi(listSpecializations, [])
  const { run, pending, error } = useAsyncAction(isDoctor ? registerDoctor : registerPatient)

  const errors = { ...(error?.fieldErrors ?? {}), ...clientErrors }
  const update = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    const found = validate(form, isDoctor)
    setClientErrors(found)
    if (Object.keys(found).length) return

    const payload = { full_name: form.full_name, email: form.email, phone: form.phone, password: form.password }
    if (isDoctor) {
      Object.assign(payload, {
        specialization_id: Number(form.specialization_id),
        license_number: form.license_number,
        qualifications: form.qualifications,
        years_of_practice: Number(form.years_of_practice),
      })
    }
    try {
      const user = await run(payload)
      navigate(user.role === 'doctor' ? '/doctor/profile' : ROLE_HOME[user.role], { replace: true })
    } catch {
      // Shown below.
    }
  }

  return (
    <AuthLayout wide={isDoctor}>
      <div className="row-between wrap" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="auth-title">{isDoctor ? 'Join as a doctor' : 'Create your account'}</h1>
          <p className="muted">{isDoctor ? 'Offer video consultations to patients.' : 'Book consultations with verified doctors.'}</p>
        </div>
        <div className="segmented" role="group" aria-label="Account type">
          <button type="button" aria-pressed={!isDoctor} onClick={() => setParams({})}>
            Patient
          </button>
          <button type="button" aria-pressed={isDoctor} onClick={() => setParams({ role: 'doctor' })}>
            Doctor
          </button>
        </div>
      </div>

      <form className="stack" onSubmit={submit} noValidate>
        {error && !Object.keys(error.fieldErrors).length && <ErrorAlert error={error} />}
        <div className="form-grid">
          <Field label="Full name" error={errors.full_name} className="span-2">
            <input className="input" autoComplete="name" value={form.full_name} onChange={update('full_name')} />
          </Field>
          <Field label="Email" error={errors.email}>
            <input className="input" type="email" autoComplete="email" value={form.email} onChange={update('email')} />
          </Field>
          <Field label="Phone" optional error={errors.phone}>
            <input className="input" type="tel" autoComplete="tel" value={form.phone} onChange={update('phone')} />
          </Field>
          <Field label="Password" hint="At least 8 characters" error={errors.password}>
            <input className="input" type="password" autoComplete="new-password" value={form.password} onChange={update('password')} />
          </Field>
          <Field label="Confirm password" error={errors.confirm_password}>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={form.confirm_password}
              onChange={update('confirm_password')}
            />
          </Field>
        </div>

        {isDoctor && (
          <>
            <h2 className="section-title" style={{ marginTop: 8, marginBottom: 0 }}>
              Professional details
            </h2>
            <div className="form-grid">
              <Field label="Specialization" error={errors.specialization_id}>
                <select className="select" value={form.specialization_id} onChange={update('specialization_id')}>
                  <option value="">Select…</option>
                  {specializations.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Medical license / registration ID" error={errors.license_number}>
                <input className="input" value={form.license_number} onChange={update('license_number')} />
              </Field>
              <Field label="Qualifications" hint="e.g. MBBS, MD (Internal Medicine)" error={errors.qualifications}>
                <input className="input" value={form.qualifications} onChange={update('qualifications')} />
              </Field>
              <Field label="Years of practice" error={errors.years_of_practice}>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="70"
                  value={form.years_of_practice}
                  onChange={update('years_of_practice')}
                />
              </Field>
            </div>
            <Alert tone="info">
              Our team verifies every doctor's registration before their profile is shown to patients. You can complete
              your profile and set your availability while the review is in progress.
            </Alert>
          </>
        )}

        <Button type="submit" block loading={pending}>
          {isDoctor ? 'Submit application' : 'Create account'}
        </Button>
      </form>

      <div className="auth-footer">
        Already have an account? <Link to="/login">Sign in</Link>
      </div>
    </AuthLayout>
  )
}
