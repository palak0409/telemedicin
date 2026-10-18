import { BadgeCheck } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { Tabs } from '../../../components/ui/Tabs'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import { useApi } from '../../../hooks/useApi'
import { formatShortDate } from '../../../utils/format'
import { AccountSettings } from '../../auth/components/AccountSettings'
import { useNotificationEvents } from '../../notifications/NotificationsContext'
import { getMyDoctorProfile } from '../api'
import { DoctorProfileForm } from '../components/DoctorProfileForm'
import { VerificationBanner } from '../components/VerificationBanner'

export function DoctorSettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'account' ? 'account' : 'professional'
  const { refreshUser } = useAuth()
  const { showToast } = useToast()
  const profile = useApi(getMyDoctorProfile, [])

  useNotificationEvents((n) => n.type === 'verification_updated' && profile.reload())

  const onSaved = (saved, previous) => {
    profile.setData(saved)
    if (saved.verification_status !== previous.verification_status) {
      refreshUser()
      showToast({ title: 'Profile submitted for review', message: 'An administrator will verify your changes.' })
    } else {
      showToast({ title: 'Profile saved', tone: 'success' })
    }
  }

  return (
    <>
      <PageHeader title="Profile" description="Your professional profile and account settings." />
      <div className="stack-lg">
        <Tabs
          label="Profile sections"
          value={tab}
          onChange={(value) => setParams(value === 'account' ? { tab: 'account' } : {})}
          items={[
            { value: 'professional', label: 'Professional profile' },
            { value: 'account', label: 'Account' },
          ]}
        />
        {tab === 'account' ? (
          <AccountSettings />
        ) : profile.loading && !profile.data ? (
          <LoadingState />
        ) : profile.error ? (
          <Card>
            <ErrorState error={profile.error} onRetry={profile.reload} />
          </Card>
        ) : (
          <>
            <VerificationBanner status={profile.data.verification_status} note={profile.data.verification_note} showProfileLink={false} />
            {profile.data.verification_status === 'verified' && (
              <p className="verified-mark">
                <BadgeCheck aria-hidden="true" /> Verified {profile.data.verified_at && `on ${formatShortDate(profile.data.verified_at)}`}
              </p>
            )}
            <DoctorProfileForm key={profile.data.verification_status} profile={profile.data} onSaved={onSaved} />
          </>
        )}
      </div>
    </>
  )
}
