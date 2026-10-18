import { useRef, useState } from 'react'
import { ErrorAlert } from '../../../components/ui/Alert'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { Card, CardBody, CardFooter, CardHeader } from '../../../components/ui/Card'
import { Field } from '../../../components/ui/Field'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { changePassword, removePhoto, updateAccount, uploadPhoto } from '../api'

function PersonalDetails() {
  const { user, setUser } = useAuth()
  const { showToast } = useToast()
  const [form, setForm] = useState({ full_name: user.full_name, phone: user.phone ?? '' })
  const fileRef = useRef(null)
  const save = useAsyncAction(updateAccount)
  const photo = useAsyncAction(async (file) => (file ? uploadPhoto(file) : removePhoto()))

  const submit = async (event) => {
    event.preventDefault()
    try {
      setUser(await save.run(form))
      showToast({ title: 'Details saved', tone: 'success' })
    } catch {
      // Shown inline.
    }
  }

  const changePhoto = async (file) => {
    try {
      setUser(await photo.run(file))
    } catch {
      // Shown inline.
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Card>
      <CardHeader title="Personal details" />
      <form onSubmit={submit}>
        <CardBody className="stack">
          <div className="row">
            <Avatar name={user.full_name} src={user.photo_url} size="lg" />
            <div className="stack-sm">
              <div className="row-sm">
                <Button variant="secondary" size="sm" loading={photo.pending} onClick={() => fileRef.current?.click()}>
                  {user.photo_url ? 'Change photo' : 'Upload photo'}
                </Button>
                {user.photo_url && (
                  <Button variant="ghost" size="sm" onClick={() => changePhoto(null)} disabled={photo.pending}>
                    Remove
                  </Button>
                )}
              </div>
              <span className="field-hint">JPEG, PNG or WebP, up to 2 MB.</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(event) => event.target.files?.[0] && changePhoto(event.target.files[0])}
              />
            </div>
          </div>
          <ErrorAlert error={photo.error} />
          <ErrorAlert error={save.error && !Object.keys(save.error.fieldErrors).length ? save.error : null} />
          <div className="form-grid">
            <Field label="Full name" error={save.error?.fieldErrors.full_name}>
              <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label="Phone" optional error={save.error?.fieldErrors.phone}>
              <input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Email" hint="Contact the clinic to change your sign-in email.">
              <input className="input" value={user.email} disabled />
            </Field>
          </div>
        </CardBody>
        <CardFooter>
          <Button type="submit" loading={save.pending}>
            Save details
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function PasswordForm() {
  const { showToast } = useToast()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [mismatch, setMismatch] = useState(false)
  const save = useAsyncAction(changePassword)

  const submit = async (event) => {
    event.preventDefault()
    if (form.new_password !== form.confirm) {
      setMismatch(true)
      return
    }
    setMismatch(false)
    try {
      await save.run({ current_password: form.current_password, new_password: form.new_password })
      setForm({ current_password: '', new_password: '', confirm: '' })
      showToast({ title: 'Password updated', tone: 'success' })
    } catch {
      // Shown inline.
    }
  }

  return (
    <Card>
      <CardHeader title="Password" />
      <form onSubmit={submit}>
        <CardBody className="stack">
          <ErrorAlert error={save.error && !Object.keys(save.error.fieldErrors).length ? save.error : null} />
          <div className="form-grid">
            <Field label="Current password" className="span-2">
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={form.current_password}
                onChange={(e) => setForm({ ...form, current_password: e.target.value })}
              />
            </Field>
            <Field label="New password" hint="At least 8 characters" error={save.error?.fieldErrors.new_password}>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={form.new_password}
                onChange={(e) => setForm({ ...form, new_password: e.target.value })}
              />
            </Field>
            <Field label="Confirm new password" error={mismatch ? 'Passwords do not match' : null}>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              />
            </Field>
          </div>
        </CardBody>
        <CardFooter>
          <Button type="submit" variant="secondary" loading={save.pending} disabled={!form.current_password || !form.new_password}>
            Update password
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

export function AccountSettings() {
  return (
    <div className="stack-lg">
      <PersonalDetails />
      <PasswordForm />
    </div>
  )
}
