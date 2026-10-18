import { Plus, Tags } from 'lucide-react'
import { useState } from 'react'
import { ErrorAlert } from '../../../components/ui/Alert'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Field } from '../../../components/ui/Field'
import { Modal } from '../../../components/ui/Modal'
import { PageHeader } from '../../../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { useToast } from '../../../context/ToastContext'
import { useApi } from '../../../hooks/useApi'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { createSpecialization, deleteSpecialization, listSpecializations, updateSpecialization } from '../api'

function SpecializationDialog({ specialization, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: specialization?.name ?? '',
    description: specialization?.description ?? '',
    is_active: specialization?.is_active ?? true,
  })
  const save = useAsyncAction((data) => (specialization ? updateSpecialization(specialization.id, data) : createSpecialization(data)))

  const submit = async () => {
    try {
      await save.run(form)
      onSaved()
      onClose()
    } catch {
      // Shown inline.
    }
  }

  return (
    <Modal
      title={specialization ? 'Edit specialization' : 'Add specialization'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.pending} onClick={submit} disabled={form.name.trim().length < 2}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Name" error={save.error?.fieldErrors.name}>
        <input className="input" maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Description" optional error={save.error?.fieldErrors.description}>
        <textarea className="textarea" rows={3} maxLength={255} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>
      <label className="checkbox">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
        Available for doctors and patients
      </label>
      {save.error && !Object.keys(save.error.fieldErrors).length && <ErrorAlert error={save.error} />}
    </Modal>
  )
}

export function AdminSpecializationsPage() {
  const { showToast } = useToast()
  const list = useApi(listSpecializations, [])
  const [editing, setEditing] = useState(null) // null | 'new' | specialization

  const remove = async (s) => {
    try {
      await deleteSpecialization(s.id)
      showToast({ title: `${s.name} deleted` })
      list.reload()
    } catch (error) {
      showToast({ title: 'Could not delete', message: error.message, tone: 'danger' })
    }
  }

  return (
    <>
      <PageHeader
        title="Specializations"
        description="Specializations doctors can register under and patients can filter by."
        actions={
          <Button icon={Plus} onClick={() => setEditing('new')}>
            Add specialization
          </Button>
        }
      />
      <Card>
        {list.loading && !list.data ? (
          <LoadingState />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : list.data.length === 0 ? (
          <EmptyState icon={Tags} title="No specializations yet" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Doctors</th>
                  <th>Status</th>
                  <th className="cell-actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((s) => (
                  <tr key={s.id}>
                    <td className="strong nowrap">{s.name}</td>
                    <td className="muted">{s.description || '—'}</td>
                    <td className="tabular">{s.doctor_count}</td>
                    <td>{s.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
                    <td className="cell-actions">
                      <div className="row-sm">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                          Edit
                        </Button>
                        {s.doctor_count === 0 && (
                          <Button size="sm" variant="ghost" onClick={() => remove(s)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && (
        <SpecializationDialog
          specialization={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            showToast({ title: 'Specialization saved', tone: 'success' })
            list.reload()
          }}
        />
      )}
    </>
  )
}
