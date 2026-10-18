import { PageHeader } from '../../../components/ui/PageHeader'
import { AccountSettings } from '../../auth/components/AccountSettings'

export function PatientProfilePage() {
  return (
    <div className="page-narrow" style={{ margin: 0 }}>
      <PageHeader title="Profile" description="Your account details and password." />
      <AccountSettings />
    </div>
  )
}
