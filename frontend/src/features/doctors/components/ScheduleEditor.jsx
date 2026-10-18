import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ErrorAlert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { Card, CardFooter, CardHeader } from '../../../components/ui/Card'
import { useToast } from '../../../context/ToastContext'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { CONSULTATION_DURATIONS, DAY_NAMES } from '../../../utils/constants'
import { shortTime } from '../../../utils/format'
import { updateMyAvailability } from '../api'

const DEFAULT_WINDOW = { start: '09:00', end: '17:00' }

function toDays(rules) {
  return DAY_NAMES.map((_, day) =>
    rules.filter((r) => r.day_of_week === day).map((r) => ({ start: shortTime(r.start_time), end: shortTime(r.end_time) })),
  )
}

/** Weekly working hours editor. Saving replaces the whole schedule in one request. */
export function ScheduleEditor({ availability, onSaved }) {
  const { showToast } = useToast()
  const [duration, setDuration] = useState(availability.consultation_duration_minutes)
  const [days, setDays] = useState(() => toDays(availability.rules))
  const save = useAsyncAction(updateMyAvailability)

  const updateDay = (day, windows) => setDays((all) => all.map((w, i) => (i === day ? windows : w)))
  const updateWindow = (day, index, field, value) =>
    updateDay(day, days[day].map((w, i) => (i === index ? { ...w, [field]: value } : w)))

  const copyMondayToWeekdays = () => setDays((all) => all.map((w, i) => (i > 0 && i < 5 ? all[0].map((x) => ({ ...x })) : w)))

  const submit = async () => {
    const rules = days.flatMap((windows, day) =>
      windows.map((w) => ({ day_of_week: day, start_time: w.start, end_time: w.end })),
    )
    try {
      onSaved(await save.run({ consultation_duration_minutes: Number(duration), rules }))
      showToast({ title: 'Availability saved', tone: 'success' })
    } catch {
      // Shown inline.
    }
  }

  return (
    <Card>
      <CardHeader
        title="Weekly hours"
        description={`Times are in the clinic time zone (${availability.clinic_timezone}). Existing appointments are not affected by changes.`}
        actions={
          <Button variant="ghost" size="sm" onClick={copyMondayToWeekdays} disabled={!days[0].length}>
            Copy Monday to weekdays
          </Button>
        }
      />
      <div className="schedule-day" style={{ alignItems: 'center' }}>
        <label htmlFor="duration" className="strong">
          Consultation length
        </label>
        <select id="duration" className="select" style={{ maxWidth: 180 }} value={duration} onChange={(e) => setDuration(e.target.value)}>
          {CONSULTATION_DURATIONS.map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </div>
      {DAY_NAMES.map((name, day) => (
        <div className="schedule-day" key={name}>
          <label className="checkbox" style={{ alignSelf: 'start', marginTop: 8 }}>
            <input
              type="checkbox"
              checked={days[day].length > 0}
              onChange={(e) => updateDay(day, e.target.checked ? [{ ...DEFAULT_WINDOW }] : [])}
            />
            <span className="strong">{name}</span>
          </label>
          <div className="stack-sm">
            {days[day].length === 0 && <span className="muted" style={{ paddingTop: 8 }}>Unavailable</span>}
            {days[day].map((window, index) => (
              <div className="schedule-window" key={index}>
                <input
                  className="input"
                  type="time"
                  aria-label={`${name} start time`}
                  value={window.start}
                  onChange={(e) => updateWindow(day, index, 'start', e.target.value)}
                />
                <span className="subtle">to</span>
                <input
                  className="input"
                  type="time"
                  aria-label={`${name} end time`}
                  value={window.end}
                  onChange={(e) => updateWindow(day, index, 'end', e.target.value)}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${name} hours`}
                  onClick={() => updateDay(day, days[day].filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
            {days[day].length > 0 && (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Plus}
                  onClick={() => updateDay(day, [...days[day], { start: '14:00', end: '17:00' }])}
                >
                  Add hours
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}
      {save.error && (
        <div style={{ padding: '0 20px 16px' }}>
          <ErrorAlert error={save.error} />
        </div>
      )}
      <CardFooter>
        <Button onClick={submit} loading={save.pending}>
          Save weekly hours
        </Button>
      </CardFooter>
    </Card>
  )
}
