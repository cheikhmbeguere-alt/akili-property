import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
      toast.success('Connexion réussie !')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#f7f5f3' }}>
      {/* Panneau gauche - branding */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ backgroundColor: '#1a1a1a' }}
      >
        <div className="flex items-center gap-3">
          {/* Real AKILI logo — dark bg variant (K, L = white) */}
          <svg width="126" height="36" viewBox="25 258 305 57" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <clipPath id="login-logo-clip">
                <path d="M 28.773438 259.585938 L 88.773438 259.585938 L 88.773438 311.335938 L 28.773438 311.335938 Z" clipRule="nonzero"/>
              </clipPath>
            </defs>
            <g fill="#ffffff" fillOpacity="1" transform="translate(101.483377, 305.097021)">
              <path d="M 76.46875 0 L 52.703125 0 L 33.984375 -14.59375 L 23.15625 -7.203125 L 23.15625 0 L 4.859375 0 L 4.859375 -43.625 L 23.15625 -43.625 L 23.15625 -23.4375 L 52.53125 -43.625 L 76.46875 -43.625 L 45.234375 -22.28125 Z"/>
            </g>
            <g fill="#af9500" fillOpacity="1" transform="translate(191.354468, 305.097021)">
              <path d="M 23.15625 0 L 4.859375 0 L 4.859375 -43.625 L 23.15625 -43.625 Z"/>
            </g>
            <g fill="#ffffff" fillOpacity="1" transform="translate(232.323216, 305.097021)">
              <path d="M 55.78125 0 L 4.859375 0 L 4.859375 -43.625 L 23.15625 -43.625 L 23.15625 -10.796875 L 55.78125 -10.796875 Z"/>
            </g>
            <g fill="#af9500" fillOpacity="1" transform="translate(302.260711, 305.097021)">
              <path d="M 23.15625 0 L 4.859375 0 L 4.859375 -43.625 L 23.15625 -43.625 Z"/>
            </g>
            <g clipPath="url(#login-logo-clip)">
              <path fill="#af9500" fillOpacity="1" fillRule="evenodd"
                d="M 28.777344 311.414062 L 67.546875 275.042969 L 58.667969 259.640625 L 43.683594 285.597656 Z
                   M 35.535156 311.554688 L 33.480469 311.554688 L 58.699219 288.300781 L 66.992188 296.191406 Z
                   M 88.640625 311.554688 L 61.335938 285.8125 L 69.386719 278.207031 Z"/>
            </g>
          </svg>
          <span className="text-sm font-semibold uppercase" style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em' }}>PROPERTY</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Gérez votre<br />patrimoine<br />immobilier
          </h1>
          <p className="text-base" style={{ color: 'rgba(255,255,255,0.65)' }}>
            SCI · Immeubles · Lots · Baux · Quittances
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { emoji: '🏢', label: 'Immeubles' },
            { emoji: '📋', label: 'Baux' },
            { emoji: '💰', label: 'Loyers' },
            { emoji: '📊', label: 'Reporting' },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 p-4 rounded-xl"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
            >
              <span style={{ fontSize: '20px' }}>{item.emoji}</span>
              <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Panneau droit - formulaire */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <svg height="36" viewBox="25 258 305 57" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              <defs>
                <clipPath id="mobile-logo-clip">
                  <path d="M 28.773438 259.585938 L 88.773438 259.585938 L 88.773438 311.335938 L 28.773438 311.335938 Z" clipRule="nonzero"/>
                </clipPath>
              </defs>
              <g fill="#1a1a1a" fillOpacity="1" transform="translate(101.483377, 305.097021)">
                <path d="M 76.46875 0 L 52.703125 0 L 33.984375 -14.59375 L 23.15625 -7.203125 L 23.15625 0 L 4.859375 0 L 4.859375 -43.625 L 23.15625 -43.625 L 23.15625 -23.4375 L 52.53125 -43.625 L 76.46875 -43.625 L 45.234375 -22.28125 Z"/>
              </g>
              <g fill="#af9500" fillOpacity="1" transform="translate(191.354468, 305.097021)">
                <path d="M 23.15625 0 L 4.859375 0 L 4.859375 -43.625 L 23.15625 -43.625 Z"/>
              </g>
              <g fill="#1a1a1a" fillOpacity="1" transform="translate(232.323216, 305.097021)">
                <path d="M 55.78125 0 L 4.859375 0 L 4.859375 -43.625 L 23.15625 -43.625 L 23.15625 -10.796875 L 55.78125 -10.796875 Z"/>
              </g>
              <g fill="#af9500" fillOpacity="1" transform="translate(302.260711, 305.097021)">
                <path d="M 23.15625 0 L 4.859375 0 L 4.859375 -43.625 L 23.15625 -43.625 Z"/>
              </g>
              <g clipPath="url(#mobile-logo-clip)">
                <path fill="#af9500" fillOpacity="1" fillRule="evenodd"
                  d="M 28.777344 311.414062 L 67.546875 275.042969 L 58.667969 259.640625 L 43.683594 285.597656 Z
                     M 35.535156 311.554688 L 33.480469 311.554688 L 58.699219 288.300781 L 66.992188 296.191406 Z
                     M 88.640625 311.554688 L 61.335938 285.8125 L 69.386719 278.207031 Z"/>
              </g>
            </svg>
            <span className="text-base font-semibold uppercase" style={{ color: '#6b7280', letterSpacing: '0.12em' }}>PROPERTY</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>Connexion</h2>
            <p className="text-sm mt-1" style={{ color: '#6b7280' }}>Accédez à votre espace de gestion</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>
                Adresse email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@property.com"
                className="input-field"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="input-field"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 text-sm disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Connexion...
                </span>
              ) : 'Se connecter'}
            </button>
          </form>

          <div
            className="mt-6 p-4 rounded-xl text-xs"
            style={{ backgroundColor: '#F5F0DC', color: '#978A47', border: '1px solid #E8DFC0' }}
          >
            <p className="font-medium mb-1">Accès démo</p>
            <p>Email : admin@property.com</p>
            <p>Mot de passe : Admin123!</p>
          </div>
        </div>
      </div>
    </div>
  )
}
