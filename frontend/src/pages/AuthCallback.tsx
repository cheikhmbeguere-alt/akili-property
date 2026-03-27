import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

/**
 * Page intermédiaire après le login Microsoft.
 * Microsoft redirige vers /auth-callback?token=xxx ou /auth-callback?error=xxx
 */
export default function AuthCallback() {
  const navigate = useNavigate()
  const { loginWithToken } = useAuth()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const error = params.get('error')

    if (token) {
      loginWithToken(token)
      toast.success('Connexion Microsoft réussie !')
      navigate('/', { replace: true })
    } else {
      const messages: Record<string, string> = {
        microsoft_auth_failed: "Échec de l'authentification Microsoft",
        token_exchange_failed: "Erreur lors de l'échange du token",
        no_email:              "Impossible de récupérer votre email Microsoft",
        unauthorized:          "Votre compte n'est pas autorisé à accéder à cette application",
        server_error:          "Erreur serveur lors de la connexion",
      }
      toast.error(messages[error || ''] || 'Erreur de connexion Microsoft')
      navigate('/login', { replace: true })
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f7f5f3' }}>
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-t-transparent mx-auto mb-4"
          style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: '#6b7280' }}>Connexion en cours…</p>
      </div>
    </div>
  )
}
