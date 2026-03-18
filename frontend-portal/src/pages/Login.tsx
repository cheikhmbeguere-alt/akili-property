import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginPortail } from '../services/api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError(null)
    try {
      const data = await loginPortail(email.trim())
      localStorage.setItem('portal_token', data.token)
      localStorage.setItem('portal_locataire', JSON.stringify(data.locataire))
      navigate('/dashboard')
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Une erreur est survenue'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>

      {/* Logo / Brand */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
          style={{ backgroundColor: '#0f172a' }}>
          <span className="text-2xl">🏠</span>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: '#0f172a' }}>Mon Espace Locataire</h1>
        <p className="text-sm mt-1" style={{ color: '#64748b' }}>
          Accédez à vos documents et informations de bail
        </p>
      </div>

      {/* Card */}
      <div className="card w-full max-w-sm">
        <h2 className="text-base font-semibold mb-5" style={{ color: '#1a1a1a' }}>
          Connexion à votre espace
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>
              Adresse e-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm border outline-none transition-colors"
              style={{ borderColor: '#e2e8f0', color: '#1a1a1a' }}
              onFocus={(e) => (e.target.style.borderColor = '#978A47')}
              onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
              autoComplete="email"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg px-4 py-3 text-xs font-medium"
              style={{ backgroundColor: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3' }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Connexion…' : 'Accéder à mon espace →'}
          </button>
        </form>

        <p className="text-xs text-center mt-5" style={{ color: '#9ca3af' }}>
          Utilisez l'adresse e-mail enregistrée dans votre bail.
        </p>
      </div>
    </div>
  )
}
