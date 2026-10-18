import { FileClock } from 'lucide-react'
import { useState } from 'react'
import { Card } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Pagination } from '../../../components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { useApi } from '../../../hooks/useApi'
import { listConsultations } from '../api'
import { ConsultationHistoryTable } from '../components/ConsultationHistoryTable'

const PAGE_SIZE = 20

export function ConsultationHistoryPage() {
  const [offset, setOffset] = useState(0)
  const history = useApi(() => listConsultations({ limit: PAGE_SIZE, offset }), [offset])

  return (
    <>
      <PageHeader title="Consultation history" description="Video consultations you have held, with your clinical notes." />
      <Card>
        {history.loading && !history.data ? (
          <LoadingState />
        ) : history.error ? (
          <ErrorState error={history.error} onRetry={history.reload} />
        ) : history.data.items.length === 0 ? (
          <EmptyState icon={FileClock} title="No consultations yet" description="Consultations appear here once a call has started." />
        ) : (
          <>
            <ConsultationHistoryTable consultations={history.data.items} role="doctor" />
            <Pagination total={history.data.total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
    </>
  )
}
