import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { depotGarantieAPI } from '../services/api'
import SortieLocataireModal from '../components/SortieLocataireModal'

const fmt = (n: any) =>
  parseFloat(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString('fr-FR') : '–'

function StatutBadge({ statut }: { statut: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string; emoji: string }> = {
    en_attente:       { label: 'En attente',   bg: '#fef3c7', color: '#d97706', emoji: '🟡' },
    recu:             { label: 'Reçu',          bg: '#dcfce7', color: '#16a34a', emoji: '✅' },
    restitue_ou_retenu: { label: 'Clôturé',    bg: '#f3f4f6', color: '#6b7280', emoji: '🔒' },
    non_applicable:   { label: 'Sans DG',       bg: '#f3f4f6', color: '#9ca3af', emoji: '–' },
  }
  const c = cfg[statut] || cfg.en_attente
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: c.bg, color: c.color }}>
      {c.emoji} {c.label}
    </span>
  )
}

export default function DepotGarantie() {
  const [sortieModal, setSortieModal] = useState<number | null>(null) // bail_id
  const [filter, setFilter] = useState<'tous' | 'actifs' | 'termines'>('actifs')
  const queryClient = useQueryClient()

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['depot-garantie'],
    queryFn: () => depotGarantieAPI.getAll().then(r => r.data),
    staleTime: 2 * 60_000,
  })

  const filtered = rows.filter((r: any) => {
    if (filter === 'actifs')   return r.bail_status === 'actif'
    if (filter === 'termines') return r.bail_status === 'terminé'
    return true
  })

  // KPIs
  const totalEncaisse = rows
    .filter((r: any) => r.depot_garantie_received_date && r.bail_status === 'actif')
    .reduce((s: number, r: any) => s + parseFloat(r.depot_garantie || 0), 0)

  const enAttente = rows.filter((r: any) =>
    r.dg_statut === 'en_attente' && r.bail_status === 'actif'
  ).length

  const aRestituer = rows.filter((r: any) =>
    r.dg_statut === 'recu' && r.bail_status === 'actif'
  ).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>Dépôts de Garantie</h1>
          <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
            Suivi des dépôts de garantie et sorties de locataires
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'DG encaissés (baux actifs)', value: fmt(totalEncaisse), emoji: '💰', color: '#16a34a' },
          { label: 'Dossiers sans DG reçu',      value: enAttente,          emoji: '🟡', color: '#d97706' },
          { label: 'Baux actifs avec DG',        value: aRestituer,         emoji: '✅', color: '#978A47' },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl p-4 border bg-white"
            style={{ borderColor: '#e2e8f0' }}>
            <div className="text-xl mb-1">{kpi.emoji}</div>
            <p className="text-lg font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
            <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex gap-2">
        {(['actifs', 'termines', 'tous'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors"
            style={{
              backgroundColor: filter === f ? '#978A47' : 'white',
              color:           filter === f ? 'white' : '#6b7280',
              borderColor:     filter === f ? '#978A47' : '#e2e8f0',
            }}>
            {{ actifs: 'Baux actifs', termines: 'Baux terminés', tous: 'Tous' }[f]}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2"
              style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <span style={{ fontSize: '40px' }}>🔒</span>
            <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>Aucun dossier</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: '#faf9f7', borderBottom: '1px solid #ede9e6' }}>
                    {['Locataire', 'Immeuble / Lot', 'SCI', 'Début bail', 'Montant DG', 'Date réception', 'Statut', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                        style={{ color: '#9ca3af' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any) => (
                    <tr key={r.bail_id} className="border-b hover:bg-stone-50 transition-colors"
                      style={{ borderColor: '#f5f3f0' }}>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold" style={{ color: '#1a1a1a' }}>{r.locataire_nom}</p>
                        <p className="text-xs" style={{ color: '#9ca3af' }}>{r.locataire_email}</p>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>
                        {r.immeuble_name} · <span style={{ color: '#978A47' }}>{r.lot_code}</span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>{r.sci_name || '—'}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#6b7280' }}>
                        {fmtDate(r.start_date)}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: '#1a1a1a' }}>
                        {r.depot_garantie ? fmt(r.depot_garantie) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#6b7280' }}>
                        {fmtDate(r.depot_garantie_received_date)}
                      </td>
                      <td className="px-4 py-3">
                        <StatutBadge statut={r.dg_statut} />
                      </td>
                      <td className="px-4 py-3">
                        {r.bail_status === 'actif' && (
                          <button
                            onClick={() => setSortieModal(r.bail_id)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg border whitespace-nowrap"
                            style={{ borderColor: '#978A47', color: '#978A47' }}>
                            🚪 Sortie
                          </button>
                        )}
                        {r.bail_status === 'terminé' && r.sortie_id && (
                          <div className="text-xs" style={{ color: '#9ca3af' }}>
                            <p>Sortie le {fmtDate(r.date_sortie)}</p>
                            {parseFloat(r.montant_restitue) > 0 && (
                              <p className="font-medium" style={{ color: '#16a34a' }}>
                                Restitué : {fmt(r.montant_restitue)}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y" style={{ borderColor: '#f5f3f0' }}>
              {filtered.map((r: any) => (
                <div key={r.bail_id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>{r.locataire_nom}</p>
                      <p className="text-xs" style={{ color: '#6b7280' }}>
                        {r.immeuble_name} · {r.lot_code}
                      </p>
                    </div>
                    <StatutBadge statut={r.dg_statut} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: '#6b7280' }}>DG</span>
                    <span className="text-sm font-bold" style={{ color: '#1a1a1a' }}>
                      {r.depot_garantie ? fmt(r.depot_garantie) : '—'}
                    </span>
                  </div>
                  {r.depot_garantie_received_date && (
                    <p className="text-xs" style={{ color: '#9ca3af' }}>
                      Reçu le {fmtDate(r.depot_garantie_received_date)}
                    </p>
                  )}
                  {r.bail_status === 'actif' && (
                    <button
                      onClick={() => setSortieModal(r.bail_id)}
                      className="w-full py-2 text-xs font-semibold rounded-lg border"
                      style={{ borderColor: '#978A47', color: '#978A47' }}>
                      🚪 Enregistrer la sortie
                    </button>
                  )}
                  {r.bail_status === 'terminé' && r.sortie_id && (
                    <p className="text-xs" style={{ color: '#9ca3af' }}>
                      Sortie le {fmtDate(r.date_sortie)} · Restitué : {fmt(r.montant_restitue)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal sortie */}
      {sortieModal !== null && (
        <SortieLocataireModal
          bailId={sortieModal}
          onClose={() => setSortieModal(null)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['depot-garantie'] })}
        />
      )}
    </div>
  )
}
