import { DAY_NAMES } from '../../../utils/constants'
import { shortTime } from '../../../utils/format'

/** Read-only weekly hours, one row per day. */
export function WeeklySchedule({ rules }) {
  const byDay = DAY_NAMES.map((_, day) => rules.filter((rule) => rule.day_of_week === day))
  return (
    <dl className="dl">
      {DAY_NAMES.map((name, day) => (
        <div key={name} style={{ display: 'contents' }}>
          <dt>{name}</dt>
          <dd className="tabular">
            {byDay[day].length ? (
              byDay[day].map((rule) => `${shortTime(rule.start_time)} – ${shortTime(rule.end_time)}`).join(', ')
            ) : (
              <span className="subtle">Not available</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
