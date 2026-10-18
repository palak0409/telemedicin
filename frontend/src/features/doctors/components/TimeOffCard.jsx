import { CalendarOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ErrorAlert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../../components/ui/Card'
import { Field } from '../../../components/ui/Field'
import { EmptyState } from '../../../components/ui/States'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { parseLocalDate } from '../../../utils/format'
import { addTimeOff, deleteTimeOff } from '../api'

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

export function TimeOffCard({ entries, onChange }) {
  const [form, setForm] = useState({ date: '', reason: '' })
  const add = useAsyncAction(addTimeOff)
  const remove = useAsyncAction(deleteTimeOff)

  const submit = async (event) => {
    event.preventDefault()
    try {
      await add.run(form)
      setForm({ date: '', reason: '' })
      onChange()
    } catch {
      // Shown inline.
    }
  }

  return (
    <Card>
      <CardHeader title="Time off" description="Full days when you are unavailable." />
      <CardBody className="stack">
        <form className="stack-sm" onSubmit={submit}>
          <Field label="Date">
            <input className="input" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Note" optional>
            <input className="input" maxLength={160} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
          <ErrorAlert error={add.error} />
          <Button type="submit" variant="secondary" loading={add.pending} disabled={!form.date}>
            Add day off
          </Button>
        </form>
        <ErrorAlert error={remove.error} />
        {entries.length === 0 ? (
          <EmptyState compact icon={CalendarOff} title="No upcoming time off" />
        ) : (
          <ul className="list" style={{ margin: '0 -20px -20px' }}>
            {entries.map((entry) => (
              <li key={entry.id} className="list-item">
                <div className="grow">
                  <div className="strong">{dayFormat.format(parseLocalDate(entry.date))}</div>
                  {entry.reason && <div className="text-sm muted">{entry.reason}</div>}
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Remove day off"
                  onClick={async () => {
                    await remove.run(entry.id).catch(() => {})
                    onChange()
                  }}
                >
                  <Trash2 />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
