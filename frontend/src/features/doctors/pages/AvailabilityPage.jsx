import { Card } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { useAuth } from '../../../context/AuthContext'
import { useApi } from '../../../hooks/useApi'
import { getMyAvailability } from '../api'
import { ScheduleEditor } from '../components/ScheduleEditor'
import { TimeOffCard } from '../components/TimeOffCard'
import { VerificationBanner } from '../components/VerificationBanner'

export function AvailabilityPage() {
  const { user } = useAuth()
  const availability = useApi(getMyAvailability, [])

  return (
    <>
      <PageHeader
        title="Availability"
        description="Patients can book any open slot generated from your weekly hours, except on days off."
      />
      <div className="stack-lg">
        <VerificationBanner status={user.verification_status} />
        {availability.loading && !availability.data ? (
          <LoadingState />
        ) : availability.error ? (
          <Card>
            <ErrorState error={availability.error} onRetry={availability.reload} />
          </Card>
        ) : (
          <div className="layout-2col">
            <ScheduleEditor availability={availability.data} onSaved={availability.setData} />
            <TimeOffCard entries={availability.data.time_off} onChange={availability.reload} />
          </div>
        )}
      </div>
    </>
  )
}
