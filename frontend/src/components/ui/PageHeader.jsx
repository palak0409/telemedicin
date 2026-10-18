import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export function PageHeader({ title, description, actions, back }) {
  return (
    <>
      {back && (
        <Link to={back.to} className="back-link">
          <ChevronLeft aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </header>
    </>
  )
}
