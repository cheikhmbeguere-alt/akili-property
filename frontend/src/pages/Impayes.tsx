import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { impayesAPI, notificationsAPI } from '../services/api'
import Protect from '../components/Protect'
import QuittancesEnAttente from '../components/QuittancesEnAttente'

type Filter = 'tous' | 'j7' | 'j14' | 'j15plus'
type RelanceType = 'relance1' | 'relance2' | 'mise_en_demeure'

const RELANCE_LABELS: Record<RelanceType, string> = {
  relance1:        '1ère relance (amiable)',
  relance2:        '2ème relance',
  mise_en_demeure: 'Mise en demeure',
}

function RetardBadge({ jours }: { jours: number }) {
  if (jours <= 0) return <span className="text-xs font-medium" style={{ color: '#16a34a' }}>✅ À jour</span>
  if (jours <= 7)  return <span className="text-xs px-2 py-0.5 rounded-full font-medium"
    style={{ backgroundColor: '#fef9c3', color: '#a16207' }}>🟡 J+{jours}</span>
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium"
    style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>🔴 J+{jours}</span>
}

interface RelanceModalProps {
  bail: any
  onClose: () => void
  onSuccess: () => void
}

function RelanceModal({ bail, onClose, onSuccess }: RelanceModalProps) {
  const [type, setType]           = useState<RelanceType>('relance1')
  const [notes, setNotes]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [sendEmail, setSendEmail] = useState(false)

  const typeMap: Record<RelanceType, string> = {
    relance1:        'premier_rappel',
    relance2:        'deuxieme_rappel',
    mise_en_demeure: 'mise_en_demeure',
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await impayesAPI.createRelance(bail.bail_id, { type, montant_du: bail.solde, notes })
      if (sendEmail) {
        try {
          await notificationsAPI.envoyerRelance(bail.bail_id, typeMap[type])
          toast.success('Relance enregistrée et email envoyé ✉️')
        } catch (emailErr: any) {
          toast.success('Relance enregistrée')
          toast.error('Email non envoyé : ' + (emailErr.response?.data?.error || 'erreur SMTP'))
        }
      } else {
        toast.success('Relance enregistrée')
      }
      onSuccess()
      onClose()
    } catch {
      toast.error('Erreur lors de l\'enregistrement')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold mb-1" style={{ color: '#1a1a1a' }}>Enregistrer une relance</h2>
        <p className="text-xs mb-5" style={{ color: '#9ca3af' }}>
          {bail.locataire_nom} · {bail.lot_code} · Solde:{' '}
          <strong style={{ color: '#dc2626' }}>
            {parseFloat(bail.solde).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
          </strong>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>
              Type de relance
            </label>
            <select
              value={type}
              onChange={e => setType(e.target.value as RelanceType)}
              className={inputCls}
              style={{ borderColor: '#e2e8f0', color: '#1a1a1a', backgroundColor: '#fff' }}
            >
              {(Object.entries(RELANCE_LABELS) as [RelanceType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Notes</label>
            <textarea
              rows={3}
              placeholder="Contact, canal utilisé, réponse du locataire..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className={inputCls}
              style={{ borderColor: '#e2e8f0', color: '#1a1a1a', resize: 'vertical' }}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={e => setSendEmail(e.target.checked)}
              className="w-4 h-4 rounded"
              style={{ accentColor: '#0f172a' }}
            />
            <span className="text-sm" style={{ color: '#374151' }}>
              ✉️ Envoyer par email au locataire
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border"
              style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>
              Annuler
            </button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: '#1a1a1a' }}>
              {loading ? '…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Impayes() {
  const [filter, setFilter]           = useState<Filter>('tous')
  const [relanceBail, setRelanceBail] = useState<any>(null)
  const [expanded, setExpanded]       = useState<Set<number>>(new Set())
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['impayes-report'],
    queryFn: async () => {
      const res = await impayesAPI.getReport()
      return res.data
    },
    refetchInterval: 60_000,
  })

  const baux: any[] = data?.baux || []
  const kpis = data?.kpis || { total_impayes: 0, nb_en_retard: 0, total_baux: 0 }

  const filtered = baux.filter(b => {
    const solde = parseFloat(b.solde) || 0
    const jours = parseInt(b.jours_retard) || 0
    if (filter === 'tous')    return true
    if (filter === 'j7')      return solde > 0 && jours >= 1  && jours <= 7
    if (filter === 'j14')     return solde > 0 && jours >= 8  && jours <= 14
    if (filter === 'j15plus') return solde > 0 && jours >= 15
    return true
  })

  const toggleExpanded = (bailId: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(bailId)) next.delete(bailId)
      else next.add(bailId)
      return next
    })
  }

  const filters: { id: Filter; label: string }[] = [
    { id: 'tous',    label: 'Tous' },
    { id: 'j7',      label: 'J+1 à J+7' },
    { id: 'j14',     label: 'J+8 à J+14' },
    { id: 'j15plus', label: '+15 jours' },
  ]

  const formatEur = (val: any) =>
    parseFloat(val || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>Impayés</h1>
        <p className="text-sm mt-0.5" style={{ color: '#9ca3af' }}>
          Soldes en attente — mis à jour en temps réel
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#e2e8f0' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#9ca3af' }}>
            Total impayés
          </p>
          <p className="text-2xl font-bold" style={{ color: '#dc2626' }}>
            {isLoading ? '…' : formatEur(kpis.total_impayes)}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#e2e8f0' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#9ca3af' }}>
            Locataires en retard
          </p>
          <p className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>
            {isLoading ? '…' : kpis.nb_en_retard}
            <span className="text-sm font-normal ml-1" style={{ color: '#9ca3af' }}>
              / {kpis.total_baux}
            </span>
          </p>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#e2e8f0' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#9ca3af' }}>
            Taux de recouvrement
          </p>
          <p className="text-2xl font-bold" style={{ color: '#978A47' }}>
            {isLoading || kpis.total_baux === 0 ? '—' : (
              `${Math.round((1 - kpis.nb_en_retard / kpis.total_baux) * 100)} %`
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors"
            style={{
              backgroundColor: filter === f.id ? '#978A47' : '#fff',
              color:           filter === f.id ? '#fff'    : '#6b7280',
              borderColor:     filter === f.id ? '#978A47' : '#e2e8f0',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent"
              style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span style={{ fontSize: '40px' }}>✅</span>
            <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>Aucun impayé</p>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Tous les loyers sont à jour pour ce filtre</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#faf9f7', borderBottom: '1px solid #ede9e6' }}>
                  <th className="px-4 py-3 w-8" />
                  {['Locataire', 'Lot', 'Loyer mensuel', 'Total dû', 'Payé', 'Solde', 'Retard', 'Dernière relance', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                      style={{ color: '#9ca3af' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((b: any) => {
                  const solde     = parseFloat(b.solde) || 0
                  const jours     = parseInt(b.jours_retard) || 0
                  const isOpen    = expanded.has(b.bail_id)

                  return (
                    <>
                      <tr key={b.bail_id} className="border-b" style={{ borderColor: isOpen ? '#e2e8f0' : '#f5f3f0', backgroundColor: isOpen ? '#faf9f7' : undefined }}>
                        {/* Bouton expand */}
                        <td className="px-3 py-3">
                          {solde > 0 && (
                            <button
                              onClick={() => toggleExpanded(b.bail_id)}
                              className="flex items-center justify-center w-6 h-6 rounded-full border transition-all"
                              style={{
                                borderColor: isOpen ? '#978A47' : '#e2e8f0',
                                backgroundColor: isOpen ? '#978A47' : '#fff',
                                color: isOpen ? '#fff' : '#6b7280',
                              }}
                              title={isOpen ? 'Masquer les factures' : 'Voir les factures en attente'}
                            >
                              <span style={{ fontSize: '10px', lineHeight: 1 }}>
                                {isOpen ? '▼' : '▶'}
                              </span>
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: '#1a1a1a' }}>
                          {b.locataire_nom || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium" style={{ color: '#978A47' }}>
                            {b.lot_code}
                          </span>
                          {b.lot_name && (
                            <span className="text-xs ml-1" style={{ color: '#9ca3af' }}>· {b.lot_name}</span>
                          )}
                        </td>
                        <td className="px-4 py-3" style={{ color: '#6b7280' }}>
                          {formatEur(b.loyer_mensuel)}
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: '#1a1a1a' }}>
                          {formatEur(b.total_du)}
                        </td>
                        <td className="px-4 py-3" style={{ color: '#16a34a' }}>
                          {formatEur(b.total_paye)}
                        </td>
                        <td className="px-4 py-3 font-bold"
                          style={{ color: solde > 0 ? '#dc2626' : '#16a34a' }}>
                          {solde > 0 ? `- ${formatEur(solde)}` : '✅'}
                        </td>
                        <td className="px-4 py-3">
                          <RetardBadge jours={jours} />
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: '#9ca3af' }}>
                          {b.derniere_relance
                            ? RELANCE_LABELS[b.derniere_relance as RelanceType] || b.derniere_relance
                            : <span>—</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          {solde > 0 && (
                            <Protect minRole="editor">
                              <button
                                onClick={() => setRelanceBail(b)}
                                className="text-xs font-semibold px-3 py-1 rounded-lg border transition-colors"
                                style={{ color: '#1a1a1a', borderColor: '#e2e8f0' }}
                              >
                                Relancer
                              </button>
                            </Protect>
                          )}
                        </td>
                      </tr>

                      {/* Ligne dépliable : factures en attente */}
                      {isOpen && <QuittancesEnAttente bailId={b.bail_id} />}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Relance modal */}
      {relanceBail && (
        <RelanceModal
          bail={relanceBail}
          onClose={() => setRelanceBail(null)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['impayes-report'] })}
        />
      )}
    </div>
  )
}
