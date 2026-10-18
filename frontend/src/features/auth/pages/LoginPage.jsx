import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../../../components/layout/AuthLayout'
import { ErrorAlert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { Field } from '../../../components/ui/Field'
import { useAuth } from '../../../context/AuthContext'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { ROLE_HOME } from '../../../utils/constants'

const DEMO_ACCOUNTS = [
  { label: 'Patient', email: 'patient@example.com' },
  { label: 'Doctor', email: 'sarah.mitchell@example.com' },
  { label: 'Admin', email: 'admin@example.com' },
]

/** Returns to the page the user originally requested, if it belongs to their role. */
function destinationFor(user, from) {
  const path = from?.pathname
  if (path && (path.startsWith(`/${user.role}/`) || (user.role !== 'admin' && path.startsWith('/consultation/')))) {
    return path
  }
  return ROLE_HOME[user.role]
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const { run, pending, error } = useAsyncAction(login)

  const update = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    try {
      const user = await run(form.email, form.password)
      navigate(destinationFor(user, location.state?.from), { replace: true })
    } catch {
      // The error is shown by <ErrorAlert>.
    }
  }

  return (
    <AuthLayout>
      <h1 className="auth-title">Sign in</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Manage your appointments and join video consultations.
      </p>
      <form className="stack" onSubmit={submit}>
        <ErrorAlert error={error} />
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" required value={form.email} onChange={update('email')} />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={update('password')}
          />
        </Field>
        <Button type="submit" block loading={pending}>
          Sign in
        </Button>
      </form>

      <div className="auth-footer">
        New patient? <Link to="/register">Create an account</Link>
        <br />
        Are you a doctor? <Link to="/register?role=doctor">Apply to join</Link>
      </div>

      {import.meta.env.DEV && (
        <details className="text-sm" style={{ marginTop: 20 }}>
          <summary className="subtle" style={{ cursor: 'pointer' }}>
            Development accounts
          </summary>
          <div className="stack-sm" style={{ marginTop: 10 }}>
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ justifyContent: 'space-between' }}
                onClick={() => setForm((f) => ({ ...f, email: account.email }))}
              >
                <span>{account.label}</span>
                <span className="subtle">{account.email}</span>
              </button>
            ))}
            <p className="subtle text-xs">
              Passwords are DEMO_PASSWORD and ADMIN_PASSWORD from backend/.env.
            </p>
          </div>
        </details>
      )}
    </AuthLayout>
  )
}
