import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getMe } from '../services/api'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

function formatEur(v: number) {
  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

export default function Dashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getMe()
      .then(setData)
      .catch((err: any) => {
        if (err.response?.status === 401) {
          localStorage.removeItem('portal_token')
          navigate('/')
        } else {
          setError(err.response?.data?.error || 'Erreur de chargement')
        }
      })
      .finally(() => setLoading(false))
  }, [navigate])

  const handleLogout = () => {
    localStorage.removeItem('portal_token')
    localStorage.removeItem('portal_locataire')
    navigate('/')
  }

  const freqLabel: Record<string, string> = {
    mensuel: 'mois',
    trimestriel: 'trimestre',
    annuel: 'an',
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm" style={{ color: '#9ca3af' }}>Chargement…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card text-center max-w-sm w-full">
          <p className="text-sm" style={{ color: '#be123c' }}>{error}</p>
          <button onClick={handleLogout} className="btn-primary mt-4">Se déconnecter</button>
        </div>
      </div>
    )
  }

  const { locataire, bail, logement, solde, prochaine_quittance } = data

  const loyerTtc = bail.tva_applicable
    ? bail.loyer_ht * (1 + (bail.tva_rate || 0) / 100) + bail.charges_ht * (1 + (bail.tva_rate || 0) / 100)
    : bail.loyer_ht + bail.charges_ht

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <header className="sticky top-0 z-10 px-4 py-4 border-b"
        style={{ backgroundColor: 'white', borderColor: '#e2e8f0' }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: '#0f172a' }}>
              <span className="text-base">🏠</span>
            </div>
            <div>
              <p className="text-xs" style={{ color: '#9ca3af' }}>Bonjour,</p>
              <p className="text-sm font-semibold leading-tight" style={{ color: '#0f172a' }}>
                {locataire.nom}
              </p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
            style={{ color: '#6b7280', borderColor: '#e2e8f0' }}>
            Déconnexion
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Solde banner */}
        {solde.impaye > 0 ? (
          <div className="rounded-xl px-5 py-4 border"
            style={{ backgroundColor: '#fff7ed', borderColor: '#fed7aa' }}>
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#9a3412' }}>
                  Solde à régulariser : {formatEur(solde.impaye)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#c2410c' }}>
                  {solde.nb_impayees} quittance{solde.nb_impayees > 1 ? 's' : ''} en attente de paiement
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl px-5 py-4 border"
            style={{ backgroundColor: '#f0fdf4', borderColor: '#86efac' }}>
            <div className="flex items-center gap-3">
              <span className="text-xl">✅</span>
              <p className="text-sm font-semibold" style={{ color: '#166534' }}>
                Votre compte est à jour — Aucun impayé
              </p>
            </div>
          </div>
        )}

        {/* Logement */}
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#9ca3af' }}>
            Mon logement
          </p>
          <p className="text-base font-semibold" style={{ color: '#0f172a' }}>
            {logement.immeuble_name}
            {logement.lot_name ? ` — ${logement.lot_name}` : ''}
          </p>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>{logement.adresse}</p>
          {logement.lot_floor != null && (
            <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
              Étage {logement.lot_floor === 0 ? 'RDC' : logement.lot_floor}
            </p>
          )}
          <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4" style={{ borderColor: '#f1f5f9' }}>
            <div>
              <p className="text-xs" style={{ color: '#9ca3af' }}>Loyer charges comprises</p>
              <p className="text-lg font-bold mt-0.5" style={{ color: '#0f172a' }}>
                {formatEur(loyerTtc)}
                <span className="text-xs font-normal ml-1" style={{ color: '#9ca3af' }}>
                  / {freqLabel[bail.quittancement_frequency] || bail.quittancement_frequency}
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color: '#9ca3af' }}>Bail</p>
              <p className="text-sm font-medium mt-0.5" style={{ color: '#1a1a1a' }}>
                {format(new Date(bail.start_date), 'd MMM yyyy', { locale: fr })}
                {bail.end_date && (
                  <> → {format(new Date(bail.end_date), 'd MMM yyyy', { locale: fr })}</>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Prochaine quittance */}
        {prochaine_quittance && (
          <div className="card">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#9ca3af' }}>
              Prochaine échéance
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>
                  {format(new Date(prochaine_quittance.period_start), 'MMMM yyyy', { locale: fr })}
                </p>
                {prochaine_quittance.due_date && (
                  <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                    Échéance : {format(new Date(prochaine_quittance.due_date), 'd MMMM yyyy', { locale: fr })}
                  </p>
                )}
              </div>
              <p className="text-base font-bold" style={{ color: '#0f172a' }}>
                {formatEur(parseFloat(prochaine_quittance.total_ttc))}
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <Link to="/quittances"
          className="flex items-center justify-between card group transition-colors hover:border-slate-300">
          <div className="flex items-center gap-3">
            <span className="text-xl">📄</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#0f172a' }}>Mes quittances</p>
              <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                Télécharger vos quittances et appels de loyer
              </p>
            </div>
          </div>
          <span className="text-lg" style={{ color: '#9ca3af' }}>→</span>
        </Link>

        {/* Contact */}
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#9ca3af' }}>
            Contact
          </p>
          <p className="text-sm" style={{ color: '#6b7280' }}>
            Pour toute question, contactez votre gestionnaire par e-mail ou téléphone.
          </p>
        </div>

      </main>
    </div>
  )
}
