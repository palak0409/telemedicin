import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { useApi } from '../../../hooks/useApi'
import { addDays, formatTime, parseLocalDate } from '../../../utils/format'
import { getDoctorSlots } from '../api'

const DAYS_PER_PAGE = 7
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const monthYear = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

/**
 * Week-at-a-time date strip plus the free time slots for the chosen date.
 * Slots come from the server, which derives them from the doctor's schedule
 * minus booked appointments, so whatever is shown here is actually bookable.
 */
export function SlotPicker({ doctorId, selectedSlot, onSelect, refreshKey }) {
  const [startDate, setStartDate] = useState(null)
  const [firstDate, setFirstDate] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const calendar = useApi(() => getDoctorSlots(doctorId, startDate, DAYS_PER_PAGE), [doctorId, startDate, refreshKey])

  const days = calendar.data?.days ?? []
  const now = Date.now()
  const openSlots = (day) => day.slots.filter((slot) => slot.available)

  useEffect(() => {
    if (!days.length) return
    if (!firstDate) setFirstDate(days[0].date)
    if (!days.some((day) => day.date === selectedDate)) {
      const firstOpen = days.find((day) => openSlots(day).length) ?? days[0]
      setSelectedDate(firstOpen.date)
    }
  }, [calendar.data])

  const selectedDay = days.find((day) => day.date === selectedDate)
  const visibleSlots = selectedDay?.slots.filter((slot) => new Date(slot.start).getTime() > now) ?? []

  const goToWeek = (direction) => {
    const base = days[0]?.date ?? firstDate
    onSelect(null)
    setStartDate(addDays(base, direction * DAYS_PER_PAGE))
  }

  if (calendar.error && !calendar.data) return <ErrorState compact error={calendar.error} onRetry={calendar.reload} />
  if (!calendar.data) return <LoadingState compact label="Loading availability…" />

  return (
    <div className="stack">
      <div className="row-between">
        <span className="strong">{days[0] && monthYear.format(parseLocalDate(days[0].date))}</span>
        <span className="text-xs subtle">Times in your time zone</span>
      </div>
      <div className="date-strip" style={{ opacity: calendar.loading ? 0.6 : 1 }}>
        <button
          type="button"
          className="btn btn-ghost date-nav"
          aria-label="Previous week"
          disabled={!firstDate || days[0]?.date <= firstDate}
          onClick={() => goToWeek(-1)}
        >
          <ChevronLeft />
        </button>
        {days.map((day) => {
          const open = openSlots(day).length
          const date = parseLocalDate(day.date)
          return (
            <button
              key={day.date}
              type="button"
              className="date-option"
              aria-pressed={day.date === selectedDate}
              aria-label={`${date.toDateString()}, ${open ? `${open} slots available` : 'no availability'}`}
              disabled={!open}
              onClick={() => {
                setSelectedDate(day.date)
                onSelect(null)
              }}
            >
              <span>{weekday.format(date)}</span>
              <strong>{date.getDate()}</strong>
              <span className="slot-count">{day.is_time_off ? 'Off' : open ? `${open} open` : '—'}</span>
            </button>
          )
        })}
        <button
          type="button"
          className="btn btn-ghost date-nav"
          aria-label="Next week"
          disabled={days.length < DAYS_PER_PAGE}
          onClick={() => goToWeek(1)}
        >
          <ChevronRight />
        </button>
      </div>

      {visibleSlots.length ? (
        <div className="slot-grid" role="group" aria-label="Available times">
          {visibleSlots.map((slot) => (
            <button
              key={slot.start}
              type="button"
              className="slot"
              disabled={!slot.available}
              aria-pressed={slot.start === selectedSlot}
              title={slot.available ? undefined : 'Already booked'}
              onClick={() => onSelect(slot.start)}
            >
              {formatTime(slot.start)}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted text-sm">
          {selectedDay?.is_time_off ? 'The doctor is not available on this day.' : 'No open times on this day.'}
        </p>
      )}
    </div>
  )
}
