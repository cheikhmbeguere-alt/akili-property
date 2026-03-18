import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api, { notificationsAPI } from '../services/api'

const alertesAPI = {
  getAll: () => api.get('/alertes'),
}

function fmt(n: any) {
  return parseFloat(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'
}

function fmtDate(d: string) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('fr-FR')
}

function UrgenceBadge({ jours }: { jours: number }) {
  const cfg = jours <= 30
    ? { label: `${jours}j`, bg: '#fee2e2', color: '#dc2626' }
    : jours <= 60
    ? { label: `${jours}j`, bg: '#fef3c7', color: '#d97706' }
    : { label: `${jours}j`, bg: '#F5F0DC', color: '#978A47' }
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

function RetardBadge({ jours }: { jours: number }) {
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>
      +{jours}j
    </span>
  )
}

function SectionHeader({ emoji, title, count, color }: { emoji: string; title: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
        style={{ backgroundColor: `${color}20` }}>
        {emoji}
      </div>
      <div className="flex-1">
        <h2 className="text-sm font-bold" style={{ color: '#1a1a1a' }}>{title}</h2>
      </div>
      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
        style={{ backgroundColor: count > 0 ? '#fee2e2' : '#dcfce7', color: count > 0 ? '#dc2626' : '#16a34a' }}>
        {count}
      </span>
    </div>
  )
}

export default function Alertes() {
  const [sendingAlertes, setSendingAlertes] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['alertes'],
    queryFn: () => alertesAPI.getAll().then((r: any) => r.data),
    staleTime: 5 * 60_000,
  })

  const handleEnvoyerAlertes = async () => {
    setSendingAlertes(true)
    try {
      const res = await notificationsAPI.envoyerAlertesEcheance(90)
      const { nb_envoyes, nb_erreurs } = res.data
      if (nb_envoyes === 0) toast('Aucun bail éligible (email requis + échéance < 90j)', { icon: 'ℹ️' })
      else toast.success(`${nb_envoyes} email(s) envoyé(s)${nb_erreurs > 0 ? ` · ${nb_erreurs} erreur(s)` : ''}`)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur envoi alertes')
    } finally {
      setSendingAlertes(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-2"
          style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const stats = data?.stats || {}
  const totalAlertes = (stats.bauxExpirant || 0) + (stats.depotsMissing || 0) + (stats.quittancesRetard || 0) + (stats.bauxSansQuittance || 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>Alertes & Échéances</h1>
          <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>Surveillance automatique de votre portefeuille</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEnvoyerAlertes}
            disabled={sendingAlertes}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50"
            style={{ borderColor: '#e2e8f0', color: '#374151', backgroundColor: '#fff' }}
            title="Envoyer un email aux locataires dont le bail expire dans 90 jours"
          >
            {sendingAlertes ? '⏳' : '✉️'} Envoyer alertes
          </button>
        </div>
        {totalAlertes > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: '#fee2e2', border: '1px solid #fecaca' }}>
            <span style={{ fontSize: '14px' }}>🔔</span>
            <span className="text-xs font-semibold" style={{ color: '#dc2626' }}>
              {totalAlertes} alerte{totalAlertes > 1 ? 's' : ''} en attente
            </span>
          </div>
        )}
      </div>

      {/* KPI résumé */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Baux expirant',    value: stats.bauxExpirant || 0,      emoji: '📅', urgency: stats.bauxExpirant > 0 },
          { label: 'Dépôts manquants', value: stats.depotsMissing || 0,     emoji: '🔒', urgency: stats.depotsMissing > 0 },
          { label: 'Impayés > 30j',   value: stats.quittancesRetard || 0,  emoji: '⚠️', urgency: stats.quittancesRetard > 0 },
          { label: 'Sans quittance',   value: stats.bauxSansQuittance || 0, emoji: '📄', urgency: stats.bauxSansQuittance > 0 },
        ].map(item => (
          <div key={item.label} className="rounded-xl p-4 border"
            style={{
              backgroundColor: item.urgency ? '#fff7f7' : 'white',
              borderColor: item.urgency ? '#fecaca' : '#e2e8f0',
            }}>
            <div className="text-xl mb-1">{item.emoji}</div>
            <p className="text-2xl font-bold" style={{ color: item.urgency ? '#dc2626' : '#1a1a1a' }}>{item.value}</p>
            <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{item.label}</p>
          </div>
        ))}
      </div>

      {/* ── Section 1 : Baux expirant ── */}
      <div className="card p-5">
        <SectionHeader emoji="📅" title="Baux expirant dans les 90 jours" count={data?.bauxExpirant?.length || 0} color="#dc2626" />
        {data?.bauxExpirant?.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: '#9ca3af' }}>✅ Aucun bail n'expire dans les 90 prochains jours</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #f0ece0' }}>
                  {['Bail', 'Locataire', 'Immeuble/Lot', 'Fin de bail', 'Loyer HT', 'Délai'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: '#9ca3af', backgroundColor: '#faf9f7' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.bauxExpirant.map((b: any) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid #f5f3f0' }}>
                    <td className="px-4 py-3 text-xs font-semibold" style={{ color: '#978A47' }}>{b.code}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#1a1a1a' }}>{b.locataire_nom}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>{b.immeuble_name} · {b.lot_code}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#6b7280' }}>{fmtDate(b.end_date)}</td>
                    <td className="px-4 py-3 text-xs font-medium" style={{ color: '#1a1a1a' }}>{fmt(b.loyer_ht)}</td>
                    <td className="px-4 py-3"><UrgenceBadge jours={parseInt(b.jours_restants)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 2 : Impayés > 30j ── */}
      <div className="card p-5">
        <SectionHeader emoji="⚠️" title="Quittances impayées depuis plus de 30 jours" count={data?.quittancesRetard?.length || 0} color="#d97706" />
        {data?.quittancesRetard?.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: '#9ca3af' }}>✅ Aucune quittance en retard de plus de 30 jours</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #f0ece0' }}>
                  {['Quittance', 'Locataire', 'Immeuble', 'Échéance', 'Montant TTC', 'Retard'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: '#9ca3af', backgroundColor: '#faf9f7' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.quittancesRetard.map((q: any) => (
                  <tr key={q.id} style={{ borderBottom: '1px solid #f5f3f0' }}>
                    <td className="px-4 py-3 text-xs font-semibold" style={{ color: '#978A47' }}>{q.code}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#1a1a1a' }}>{q.locataire_nom}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>{q.immeuble_name}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#6b7280' }}>{fmtDate(q.due_date)}</td>
                    <td className="px-4 py-3 text-xs font-semibold" style={{ color: '#dc2626' }}>{fmt(q.total_ttc)}</td>
                    <td className="px-4 py-3"><RetardBadge jours={parseInt(q.jours_retard)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 3 : Dépôts manquants ── */}
      <div className="card p-5">
        <SectionHeader emoji="🔒" title="Dépôts de garantie non encaissés" count={data?.depotsMissing?.length || 0} color="#7c3aed" />
        {data?.depotsMissing?.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: '#9ca3af' }}>✅ Tous les dépôts de garantie ont été encaissés</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #f0ece0' }}>
                  {['Bail', 'Locataire', 'Immeuble/Lot', 'Début bail', 'Dépôt dû'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: '#9ca3af', backgroundColor: '#faf9f7' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.depotsMissing.map((b: any) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid #f5f3f0' }}>
                    <td className="px-4 py-3 text-xs font-semibold" style={{ color: '#978A47' }}>{b.code}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#1a1a1a' }}>{b.locataire_nom}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>{b.immeuble_name} · {b.lot_code}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>{fmtDate(b.start_date)}</td>
                    <td className="px-4 py-3 text-xs font-semibold" style={{ color: '#7c3aed' }}>{fmt(b.depot_garantie)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 4 : Baux sans quittance ce mois ── */}
      <div className="card p-5">
        <SectionHeader emoji="📄" title={`Baux sans quittance ce mois (${new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' })})`} count={data?.bauxSansQuittance?.length || 0} color="#978A47" />
        {data?.bauxSansQuittance?.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: '#9ca3af' }}>✅ Tous les baux mensuels ont une quittance ce mois-ci</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #f0ece0' }}>
                  {['Bail', 'Locataire', 'SCI', 'Immeuble/Lot', 'Loyer HT'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: '#9ca3af', backgroundColor: '#faf9f7' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.bauxSansQuittance.map((b: any) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid #f5f3f0' }}>
                    <td className="px-4 py-3 text-xs font-semibold" style={{ color: '#978A47' }}>{b.code}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#1a1a1a' }}>{b.locataire_nom}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>{b.sci_name}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>{b.immeuble_name} · {b.lot_code}</td>
                    <td className="px-4 py-3 text-xs font-medium" style={{ color: '#1a1a1a' }}>{fmt(b.loyer_ht)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
