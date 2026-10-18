import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const ToastContext = createContext(null)
const DISMISS_AFTER_MS = 6000

/** Short-lived messages for action feedback and incoming real-time notifications. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(1)
  const navigate = useNavigate()

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const showToast = useCallback(
    ({ title, message, tone = 'info', link }) => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-3), { id, title, message, tone, link }])
      setTimeout(() => dismiss(id), DISMISS_AFTER_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.tone} ${toast.link ? 'toast-clickable' : ''}`}
            onClick={() => {
              if (!toast.link) return
              navigate(toast.link)
              dismiss(toast.id)
            }}
          >
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              {toast.message && <div className="toast-message">{toast.message}</div>}
            </div>
            <button
              type="button"
              className="icon-button btn-sm"
              style={{ width: 24, height: 24 }}
              aria-label="Dismiss"
              onClick={(event) => {
                event.stopPropagation()
                dismiss(toast.id)
              }}
            >
              <X />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
