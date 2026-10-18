import { BrandMark, PRODUCT_NAME } from './BrandMark'

export function AuthLayout({ wide = false, children }) {
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <BrandMark />
        {PRODUCT_NAME}
      </div>
      <div className={`card auth-card ${wide ? 'auth-card-wide' : ''}`}>
        <div className="card-body">{children}</div>
      </div>
      <p className="auth-disclaimer">
        Online consultations are not suitable for emergencies. If you have a medical emergency, call your local
        emergency number or go to the nearest emergency department.
      </p>
    </div>
  )
}
