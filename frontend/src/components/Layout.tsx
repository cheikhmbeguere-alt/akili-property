import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRole } from '../hooks/useRole'
import { authAPI } from '../services/api'
import { useSci } from '../context/SciContext'
import toast from 'react-hot-toast'

// ─── Logo ─────────────────────────────────────────────────────────────────────
function AkiliLogo({ height = 28 }: { height?: number }) {
  const viewBox = "25 258 305 57"
  const w = height * (305 / 57)
  return (
    <svg width={w} height={height} viewBox={viewBox} xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
      <defs>
        <clipPath id="akili-logo-clip">
          <path d="M 28.773438 259.585938 L 88.773438 259.585938 L 88.773438 311.335938 L 28.773438 311.335938 Z" clipRule="nonzero"/>
        </clipPath>
      </defs>
      <g fill="#000000" fillOpacity="1" transform="translate(101.483377, 305.097021)">
        <path d="M 76.46875 0 L 52.703125 0 L 33.984375 -14.59375 L 23.15625 -7.203125 L 23.15625 0 L 4.859375 0 L 4.859375 -43.625 L 23.15625 -43.625 L 23.15625 -23.4375 L 52.53125 -43.625 L 76.46875 -43.625 L 45.234375 -22.28125 Z"/>
      </g>
      <g fill="#af9500" fillOpacity="1" transform="translate(191.354468, 305.097021)">
        <path d="M 23.15625 0 L 4.859375 0 L 4.859375 -43.625 L 23.15625 -43.625 Z"/>
      </g>
      <g fill="#000000" fillOpacity="1" transform="translate(232.323216, 305.097021)">
        <path d="M 55.78125 0 L 4.859375 0 L 4.859375 -43.625 L 23.15625 -43.625 L 23.15625 -10.796875 L 55.78125 -10.796875 Z"/>
      </g>
      <g fill="#af9500" fillOpacity="1" transform="translate(302.260711, 305.097021)">
        <path d="M 23.15625 0 L 4.859375 0 L 4.859375 -43.625 L 23.15625 -43.625 Z"/>
      </g>
      <g clipPath="url(#akili-logo-clip)">
        <path fill="#af9500" fillOpacity="1" fillRule="evenodd"
          d="M 28.777344 311.414062 L 67.546875 275.042969 L 58.667969 259.640625 L 43.683594 285.597656 Z
             M 35.535156 311.554688 L 33.480469 311.554688 L 58.699219 288.300781 L 66.992188 296.191406 Z
             M 88.640625 311.554688 L 61.335938 285.8125 L 69.386719 278.207031 Z"/>
      </g>
    </svg>
  )
}

// ─── Modal changement de mot de passe ─────────────────────────────────────────
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext]       = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400 transition-colors'
  const labelCls = 'block text-xs font-semibold mb-1'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next !== confirm) { toast.error('Les mots de passe ne correspondent pas'); return }
    if (next.length < 8)  { toast.error('Minimum 8 caractères'); return }
    setLoading(true)
    try {
      await authAPI.changePassword(current, next)
      toast.success('Mot de passe modifié')
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold mb-5" style={{ color: '#1a1a1a' }}>Changer le mot de passe</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: 'Mot de passe actuel', val: current, set: setCurrent },
            { label: 'Nouveau mot de passe', val: next, set: setNext, hint: 'Min. 8 caractères' },
            { label: 'Confirmer le nouveau', val: confirm, set: setConfirm },
          ].map(({ label, val, set, hint }) => (
            <div key={label}>
              <label className={labelCls} style={{ color: '#374151' }}>{label} *</label>
              <input type="password" required value={val} onChange={e => set(e.target.value)}
                className={inputCls} style={{ borderColor: '#e2e8f0' }} placeholder={hint || '••••••••'} />
            </div>
          ))}
          {confirm && next !== confirm && (
            <p className="text-xs" style={{ color: '#ef4444' }}>Les mots de passe ne correspondent pas</p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border"
              style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>Annuler</button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: '#1a1a1a' }}>
              {loading ? '…' : 'Modifier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Structure navigation ──────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: 'Principal',
    items: [
      { path: '/',              label: 'Tableau de bord', emoji: '🏠' },
      { path: '/etat-locatif', label: 'État Locatif',    emoji: '🏢' },
    ],
  },
  {
    label: 'Finances',
    items: [
      { path: '/encaissements',     label: 'Encaissements',   emoji: '💳' },
      { path: '/depot-garantie',           label: 'Dépôts Garantie',    emoji: '🔒' },
      { path: '/regularisation-charges',   label: 'Régul. Charges',     emoji: '⚖️' },
      { path: '/impayes',           label: 'Impayés',         emoji: '⚠️' },
      { path: '/indexations',       label: 'Indexation',      emoji: '📈' },
      { path: '/alertes',           label: 'Alertes',         emoji: '🔔' },
    ],
  },
  {
    label: 'Rapports',
    items: [
      { path: '/quittances',            label: 'Documents',     emoji: '📄' },
      { path: '/compte-rendu-gestion',  label: 'Compte Rendu',  emoji: '🧾' },
    ],
  },
]

const ADMIN_ITEMS = [
  { path: '/import-global',      label: 'Import données', emoji: '📥' },
  { path: '/admin/utilisateurs', label: 'Utilisateurs',   emoji: '⚙️' },
  { path: '/admin/cabinets',     label: 'Clients',        emoji: '🏛️', superadminOnly: true },
]

// ─── Layout ────────────────────────────────────────────────────────────────────
export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const { isAdmin, isSuperAdmin, role } = useRole()

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [showPwModal, setShowPwModal]   = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const { sciList, selectedSciId, setSelectedSciId } = useSci()

  const isActive = (path: string) => location.pathname === path

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Fermer sidebar mobile sur navigation
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  const ROLE_LABEL: Record<string, string> = {
    viewer: 'Lecteur', editor: 'Éditeur', admin: 'Administrateur', superadmin: 'Super Admin',
  }

  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean).map(s => s!.charAt(0).toUpperCase()).join('') || 'U'

  // ── Contenu sidebar ──
  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex flex-col px-5 py-4 border-b" style={{ borderColor: '#e2e8f0' }}>
        <Link to="/" className="flex flex-col gap-1 no-underline" onClick={() => setSidebarOpen(false)}>
          <AkiliLogo height={22} />
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#9ca3af', letterSpacing: '0.18em', marginLeft: '2px' }}>
            PROPERTY
          </span>
        </Link>

        {/* Sélecteur SCI */}
        {sciList.length > 0 && (
          <div className="mt-3">
            {sciList.length === 1 ? (
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg"
                style={{ backgroundColor: '#F5F0DC' }}>
                <span style={{ fontSize: '12px' }}>🏢</span>
                <span className="text-xs font-semibold truncate" style={{ color: '#978A47' }}>
                  {sciList[0].name}
                </span>
              </div>
            ) : (
              <select
                value={selectedSciId ?? ''}
                onChange={e => setSelectedSciId(e.target.value ? Number(e.target.value) : null)}
                className="w-full text-xs font-medium border rounded-lg px-2 py-1.5 outline-none"
                style={{ borderColor: '#E8DFC0', backgroundColor: '#F5F0DC', color: '#978A47' }}>
                <option value="">🏢 Toutes les sociétés</option>
                {sciList.map(s => (
                  <option key={s.id} value={s.id}>🏢 {s.name}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_GROUPS.map(group => (
          <div key={group.label} className="mb-1">
            <p className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wider"
              style={{ color: '#c4c4c4', letterSpacing: '0.1em' }}>
              {group.label}
            </p>
            {group.items.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium no-underline transition-colors relative"
                style={{
                  color:           isActive(item.path) ? '#978A47' : '#6b7280',
                  backgroundColor: isActive(item.path) ? '#F5F0DC' : 'transparent',
                  fontWeight:      isActive(item.path) ? 600 : 500,
                }}>
                {isActive(item.path) && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r"
                    style={{ backgroundColor: '#978A47' }} />
                )}
                <span style={{ fontSize: '15px', width: '20px', textAlign: 'center' }}>{item.emoji}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}

        {/* Admin */}
        {isAdmin && (
          <div className="mb-1">
            <p className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wider"
              style={{ color: '#c4c4c4', letterSpacing: '0.1em' }}>Administration</p>
            {ADMIN_ITEMS.filter(item => !item.superadminOnly || isSuperAdmin).map(item => (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium no-underline transition-colors"
                style={{
                  color:           isActive(item.path) ? '#978A47' : '#6b7280',
                  backgroundColor: isActive(item.path) ? '#F5F0DC' : 'transparent',
                  fontWeight:      isActive(item.path) ? 600 : 500,
                }}>
                <span style={{ fontSize: '15px', width: '20px', textAlign: 'center' }}>{item.emoji}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* User section */}
      <div className="border-t" style={{ borderColor: '#e2e8f0' }} ref={userMenuRef}>
        <button
          onClick={() => setUserMenuOpen(o => !o)}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors"
          style={{ outline: 'none' }}>
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: '#978A47' }}>
              {initials}
            </div>
            {(role === 'admin' || role === 'superadmin') && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full text-white flex items-center justify-center"
                style={{ fontSize: '7px', fontWeight: 700, backgroundColor: role === 'superadmin' ? '#978A47' : '#1a1a1a' }}>
                {role === 'superadmin' ? 'S' : 'A'}
              </span>
            )}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: '#1a1a1a' }}>
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs truncate" style={{ color: '#9ca3af' }}>{ROLE_LABEL[role] ?? role}</p>
          </div>
          <span className="text-xs" style={{ color: '#9ca3af' }}>⋯</span>
        </button>

        {/* User dropdown */}
        {userMenuOpen && (
          <div className="mx-3 mb-3 rounded-xl border bg-white shadow-sm overflow-hidden"
            style={{ borderColor: '#e2e8f0' }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: '#f0f0f0' }}>
              <p className="text-xs font-semibold" style={{ color: '#1a1a1a' }}>{user?.email}</p>
              <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: role === 'superadmin' ? '#978A47' : role === 'admin' ? '#e2e8f0' : '#F5F0DC',
                  color: role === 'superadmin' ? '#fff' : role === 'admin' ? '#1a1a1a' : '#978A47',
                }}>
                {ROLE_LABEL[role] ?? role}
              </span>
            </div>
            <button onClick={() => { setUserMenuOpen(false); setShowPwModal(true) }}
              className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors"
              style={{ color: '#374151' }}>
              🔑 Changer le mot de passe
            </button>
            <div className="border-t" style={{ borderColor: '#f0f0f0' }} />
            <button onClick={() => { setUserMenuOpen(false); logout() }}
              className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors"
              style={{ color: '#ef4444' }}>
              🚪 Déconnexion
            </button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#f8fafc' }}>

      {/* ── Sidebar desktop ── */}
      <aside
        className="hidden sm:flex flex-col fixed left-0 top-0 h-full bg-white border-r z-40"
        style={{ width: '220px', borderColor: '#e2e8f0' }}>
        <SidebarContent />
      </aside>

      {/* ── Sidebar mobile (overlay) ── */}
      {sidebarOpen && (
        <>
          <div className="sm:hidden fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
            onClick={() => setSidebarOpen(false)} />
          <aside className="sm:hidden fixed left-0 top-0 h-full bg-white border-r z-50 flex flex-col"
            style={{ width: '220px', borderColor: '#e2e8f0' }}>
            <SidebarContent />
          </aside>
        </>
      )}

      {/* ── Contenu principal ── */}
      <div className="flex flex-col flex-1 min-h-screen" style={{ marginLeft: '0px' }}
        // marginLeft géré via className sur desktop
      >
        <div className="sm:ml-[220px] flex flex-col flex-1 min-h-screen">

          {/* Topbar mobile */}
          <header className="sm:hidden sticky top-0 z-30 bg-white border-b flex items-center justify-between px-4 h-12"
            style={{ borderColor: '#e2e8f0' }}>
            <button onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg" style={{ color: '#6b7280' }}>
              <div className="space-y-1">
                <div className="w-5 h-0.5 rounded" style={{ backgroundColor: '#6b7280' }} />
                <div className="w-5 h-0.5 rounded" style={{ backgroundColor: '#6b7280' }} />
                <div className="w-5 h-0.5 rounded" style={{ backgroundColor: '#6b7280' }} />
              </div>
            </button>
            <Link to="/" className="no-underline"><AkiliLogo height={20} /></Link>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: '#978A47' }}>
              {initials}
            </div>
          </header>

          {/* Contenu pages */}
          <main className="flex-1 px-5 py-5 sm:px-10 sm:py-8">
            {children}
          </main>

        </div>
      </div>

      {/* ── Modal mot de passe ── */}
      {showPwModal && <ChangePasswordModal onClose={() => setShowPwModal(false)} />}

    </div>
  )
}
