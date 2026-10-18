export function Card({ className = '', children, ...props }) {
  return (
    <section className={`card ${className}`} {...props}>
      {children}
    </section>
  )
}

export function CardHeader({ title, description, actions, as: Heading = 'h2' }) {
  return (
    <div className="card-header">
      <div style={{ minWidth: 0 }}>
        <Heading>{title}</Heading>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="row-sm">{actions}</div>}
    </div>
  )
}

export function CardBody({ flush = false, className = '', children }) {
  return <div className={`${flush ? 'card-body-flush' : 'card-body'} ${className}`}>{children}</div>
}

export function CardFooter({ children }) {
  return <div className="card-footer">{children}</div>
}
