import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useClickOutside } from '../../hooks/useClickOutside'
import { Avatar } from '../ui/Avatar'
import { ROLE_LABEL } from './navigation'

export function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  useClickOutside(ref, () => setOpen(false), open)

  const displayName = user.role === 'doctor' ? `Dr. ${user.full_name}` : user.full_name

  return (
    <div className="dropdown" ref={ref}>
      <button type="button" className="user-button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Avatar name={user.full_name} src={user.photo_url} size="sm" />
        <span className="user-button-name">{displayName}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="dropdown-panel">
          <div className="dropdown-header">
            <div className="strong truncate">{displayName}</div>
            <div className="text-sm subtle truncate">
              {ROLE_LABEL[user.role]} · {user.email}
            </div>
          </div>
          {user.role !== 'admin' && (
            <Link to={`/${user.role}/profile`} className="dropdown-item" onClick={() => setOpen(false)}>
              <UserRound /> Profile
            </Link>
          )}
          <button
            type="button"
            className="dropdown-item"
            onClick={() => {
              logout()
              navigate('/login', { replace: true })
            }}
          >
            <LogOut /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
