import { FileClock } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Pagination } from '../../../components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { Tabs } from '../../../components/ui/Tabs'
import { useApi } from '../../../hooks/useApi'
import { listConsultations } from '../../consultations/api'
import { ConsultationHistoryTable } from '../../consultations/components/ConsultationHistoryTable'
import { getMedicalProfile } from '../api'
import { MedicalProfileForm } from '../components/MedicalProfileForm'

const PAGE_SIZE = 20

function ConsultationHistory() {
  const [offset, setOffset] = useState(0)
  const history = useApi(() => listConsultations({ limit: PAGE_SIZE, offset }), [offset])

  return (
    <Card>
      {history.loading && !history.data ? (
        <LoadingState />
      ) : history.error ? (
        <ErrorState error={history.error} onRetry={history.reload} />
      ) : history.data.items.length === 0 ? (
        <EmptyState icon={FileClock} title="No consultations yet" description="Your past video consultations and doctors' notes will appear here." />
      ) : (
        <>
          <ConsultationHistoryTable consultations={history.data.items} role="patient" />
          <Pagination total={history.data.total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
        </>
      )}
    </Card>
  )
}

export function MedicalHistoryPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'consultations' ? 'consultations' : 'medical'
  const profile = useApi(getMedicalProfile, [])

  return (
    <>
      <PageHeader title="Medical history" description="Your health information and past consultations." />
      <div className="stack-lg">
        <Tabs
          label="Medical history sections"
          value={tab}
          onChange={(value) => setParams(value === 'consultations' ? { tab: value } : {})}
          items={[
            { value: 'medical', label: 'Medical information' },
            { value: 'consultations', label: 'Consultation history' },
          ]}
        />
        {tab === 'consultations' ? (
          <ConsultationHistory />
        ) : profile.loading && !profile.data ? (
          <LoadingState />
        ) : profile.error ? (
          <Card>
            <ErrorState error={profile.error} onRetry={profile.reload} />
          </Card>
        ) : (
          <MedicalProfileForm profile={profile.data} onSaved={profile.setData} />
        )}
      </div>
    </>
  )
}
