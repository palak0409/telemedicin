import { Compass } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/States'

export function NotFoundPage() {
  return (
    <div className="full-page-state">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you are looking for does not exist or has moved."
        action={<Button to="/">Go to dashboard</Button>}
      />
    </div>
  )
}
