import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { reportsAPI, immeublesAPI } from '../services/api'
import QuittancesEnAttente from '../components/QuittancesEnAttente'

const MOIS_FR = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

const currentYear  = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1
const today        = new Date().toISOString().split('T')[0]
// First day of current month in YYYY-MM-DD format
const firstOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`

type CRGMode = 'mois' | 'borne' | 'annee' | 'date'

// ── Composants utilitaires ───────────────────────────────────────────────────

function KpiCard({ label, value, sub, emoji, color }: {
  label: string; value: string; sub?: string; emoji: string; color: string
}) {
  return (
    <div className="card p-5" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider mb-1 truncate" style={{ color }}>{label}</p>
          <p className="text-xl font-bold" style={{ color: '#0f172a' }}>{value}</p>
          {sub && <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>{sub}</p>}
        </div>
        <span style={{ fontSize: '22px', flexShrink: 0, marginLeft: '8px' }}>{emoji}</span>
      </div>
    </div>
  )
}

function StatutBadge({ impaye }: { impaye: boolean }) {
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{
        backgroundColor: impaye ? '#fee2e2' : '#dcfce7',
        color: impaye ? '#dc2626' : '#16a34a',
      }}>
      {impaye ? '⚠️ Impayé' : '✅ À jour'}
    </span>
  )
}

// ── Page principale ──────────────────────────────────────────────────────────

const MODES: { key: CRGMode; label: string; emoji: string }[] = [
  { key: 'mois',  label: 'Par mois',      emoji: '📅' },
  { key: 'borne', label: 'Par période',   emoji: '📆' },
  { key: 'annee', label: 'Année complète', emoji: '🗓️' },
  { key: 'date',  label: 'Solde à date',  emoji: '📌' },
]

export default function CompteRenduGestion() {
  const [mode, setMode]             = useState<CRGMode>('mois')
  const [annee, setAnnee]           = useState(currentYear)
  const [mois, setMois]             = useState(currentMonth)
  const [dateBorne1, setDateBorne1] = useState(firstOfMonth)
  const [dateBorne2, setDateBorne2] = useState(today)
  const [dateRef, setDateRef]       = useState(today)
  const [immeubleId, setImmeubleId] = useState('')
  const [exporting, setExporting]   = useState(false)
  const [expanded, setExpanded]     = useState<Set<number>>(new Set())

  const toggleExpanded = (bailId: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(bailId)) next.delete(bailId)
      else next.add(bailId)
      return next
    })
  }

  // Paramètres de la requête (calculés selon le mode)
  const queryParams = useMemo(() => {
    const p: Record<string, any> = { mode }
    if (mode !== 'date' && mode !== 'borne') p.annee = annee
    if (mode === 'mois')  p.mois      = mois
    if (mode === 'borne') { p.date_debut = dateBorne1; p.date_fin = dateBorne2; }
    if (mode === 'date')  p.date_ref  = dateRef
    if (immeubleId)       p.immeuble_id = immeubleId
    return p
  }, [mode, annee, mois, dateBorne1, dateBorne2, dateRef, immeubleId])

  // Données CRG
  const { data, isLoading, error } = useQuery({
    queryKey: ['crg', queryParams],
    queryFn: async () => (await reportsAPI.getCompteRenduGestion(queryParams)).data,
    staleTime: 30_000,
  })

  // Liste des immeubles pour le filtre
  const { data: immeubles = [] } = useQuery({
    queryKey: ['immeubles'],
    queryFn: async () => (await immeublesAPI.getAll()).data,
  })

  // Grouper les baux par immeuble
  const groups = useMemo(() => {
    if (!data?.baux?.length) return []
    const map = new Map<number, { immeuble_name: string; baux: any[] }>()
    for (const b of data.baux) {
      if (!map.has(b.immeuble_id)) {
        map.set(b.immeuble_id, { immeuble_name: b.immeuble_name, baux: [] })
      }
      map.get(b.immeuble_id)!.baux.push(b)
    }
    return Array.from(map.values())
  }, [data])

  const periodeLabel = data?.periode?.label ?? ''
  const isDateMode   = mode === 'date'

  // Export Excel
  const handleExport = async () => {
    setExporting(true)
    try {
      const blob = await reportsAPI.exportCRG({ ...queryParams, immeuble_id: immeubleId ? parseInt(immeubleId) : undefined })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const slug = mode === 'date'  ? `a-date-${dateRef}`
                 : mode === 'borne' ? `borne-${dateBorne1}-${dateBorne2}`
                 : mode === 'annee' ? `annee-${annee}`
                 : `${MOIS_FR[mois].toLowerCase()}-${annee}`
      a.download = `crg-${slug}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export téléchargé')
    } catch {
      toast.error("Erreur lors de l'export")
    } finally {
      setExporting(false)
    }
  }

  const kpis = data?.kpis
  const fmt  = (n: number) =>
    (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

  return (
    <div>
      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f172a' }}>Compte Rendu de Gestion</h1>
          <p className="text-sm mt-1" style={{ color: '#64748b' }}>
            {periodeLabel ? `Période : ${periodeLabel}` : 'Synthèse des encaissements et soldes'}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || isLoading || !data}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: '#978A47' }}
        >
          {exporting ? '⏳ Export...' : '📊 Exporter Excel'}
        </button>
      </div>

      {/* ── Sélecteur de mode ────────────────────────────────────────────── */}
      <div className="card p-4 mb-4">
        <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: '#94a3b8' }}>Vision</p>
        <div className="flex flex-wrap gap-2">
          {MODES.map(m => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: mode === m.key ? '#0f172a' : '#f1f5f9',
                color: mode === m.key ? '#fff' : '#374151',
                border: `2px solid ${mode === m.key ? '#0f172a' : 'transparent'}`,
              }}
            >
              {m.emoji} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filtres ──────────────────────────────────────────────────────── */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">

          {/* Mois (mode mois uniquement) */}
          {mode === 'mois' && (
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Mois</label>
              <select
                value={mois}
                onChange={e => setMois(Number(e.target.value))}
                className="border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: '#e2e8f0', minWidth: '130px', backgroundColor: '#fff' }}
              >
                {MOIS_FR.slice(1).map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
          )}

          {/* Plage de dates (mode borne uniquement) */}
          {mode === 'borne' && (
            <>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Date de début</label>
                <input
                  type="date"
                  value={dateBorne1}
                  onChange={e => setDateBorne1(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ borderColor: '#e2e8f0', backgroundColor: '#fff' }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Date de fin</label>
                <input
                  type="date"
                  value={dateBorne2}
                  onChange={e => setDateBorne2(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ borderColor: '#e2e8f0', backgroundColor: '#fff' }}
                />
              </div>
            </>
          )}

          {/* Date de référence (mode date uniquement) */}
          {mode === 'date' && (
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>
                Date de référence
              </label>
              <input
                type="date"
                value={dateRef}
                onChange={e => setDateRef(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: '#e2e8f0', backgroundColor: '#fff' }}
              />
              <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>
                Cumul du 1ᵉʳ loyer jusqu'à cette date
              </p>
            </div>
          )}

          {/* Année (modes mois et annee uniquement) */}
          {(mode === 'mois' || mode === 'annee') && (
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Année</label>
              <input
                type="number"
                min="2020" max="2099"
                value={annee}
                onChange={e => setAnnee(Number(e.target.value))}
                className="border rounded-lg px-3 py-2 text-sm outline-none w-24"
                style={{ borderColor: '#e2e8f0' }}
              />
            </div>
          )}

          {/* Filtre immeuble */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Immeuble</label>
            <select
              value={immeubleId}
              onChange={e => setImmeubleId(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm outline-none"
              style={{ borderColor: '#e2e8f0', minWidth: '180px', backgroundColor: '#fff' }}
            >
              <option value="">Tous les immeubles</option>
              {immeubles.map((im: any) => (
                <option key={im.id} value={im.id}>{im.name}</option>
              ))}
            </select>
          </div>

          {/* Label période (desktop) */}
          {periodeLabel && (
            <div className="ml-auto hidden sm:block">
              <p className="text-sm" style={{ color: '#64748b' }}>
                Période : <strong style={{ color: '#0f172a' }}>{periodeLabel}</strong>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard
            label="Loyers attendus"
            value={fmt(kpis.total_attendu)}
            sub={`${kpis.nb_baux_actifs} baux actifs`}
            emoji="🏠"
            color="#2563eb"
          />
          <KpiCard
            label="Total encaissé"
            value={fmt(kpis.total_encaisse)}
            sub={periodeLabel}
            emoji="💳"
            color="#16a34a"
          />
          <KpiCard
            label="Taux de recouvrement"
            value={`${kpis.taux_recouvrement.toFixed(1)} %`}
            sub={
              kpis.taux_recouvrement >= 100 ? '✅ Complet' :
              kpis.taux_recouvrement >= 80  ? '⚠️ Partiel' : '🔴 Insuffisant'
            }
            emoji="📈"
            color={
              kpis.taux_recouvrement >= 100 ? '#16a34a' :
              kpis.taux_recouvrement >= 80  ? '#d97706' : '#dc2626'
            }
          />
          <KpiCard
            label={isDateMode ? 'Impayés cumulés' : 'Impayés de la période'}
            value={fmt(kpis.total_impayes)}
            sub={`${kpis.nb_lots_vacants} lot${kpis.nb_lots_vacants !== 1 ? 's' : ''} vacant${kpis.nb_lots_vacants !== 1 ? 's' : ''}`}
            emoji={kpis.total_impayes > 0 ? '⚠️' : '✅'}
            color={kpis.total_impayes > 0 ? '#dc2626' : '#16a34a'}
          />
        </div>
      )}

      {/* ── Tableau principal ─────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="card p-12 flex items-center justify-center">
          <p className="text-sm" style={{ color: '#94a3b8' }}>Chargement...</p>
        </div>
      ) : error ? (
        <div className="card p-12 flex flex-col items-center justify-center">
          <span style={{ fontSize: '36px' }}>❌</span>
          <p className="text-sm mt-3" style={{ color: '#dc2626' }}>Erreur lors du chargement</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="card p-12 flex flex-col items-center justify-center">
          <span style={{ fontSize: '40px' }}>📋</span>
          <p className="text-sm mt-3 font-medium" style={{ color: '#64748b' }}>
            Aucun bail actif pour cette période
          </p>
        </div>
      ) : (
        <div className="space-y-4 mb-6">
          {groups.map(group => {
            const totalAttendu = group.baux.reduce((s: number, b: any) => s + b.loyer_attendu, 0)
            const totalEnc     = group.baux.reduce((s: number, b: any) => s + b.encaisse_periode, 0)
            const totalSolde   = group.baux.reduce((s: number, b: any) => s + b.solde_periode, 0)
            const nbImpayes    = group.baux.filter((b: any) => b.solde_periode > 0.01).length

            return (
              <div key={group.immeuble_name} className="card overflow-hidden">

                {/* En-tête immeuble */}
                <div className="px-5 py-3 flex items-center gap-3"
                  style={{ backgroundColor: '#EEF2FF', borderBottom: '2px solid #93c5fd' }}>
                  <span style={{ fontSize: '18px' }}>🏢</span>
                  <span className="font-bold text-sm" style={{ color: '#1e3a5f' }}>{group.immeuble_name}</span>
                  <span className="text-xs" style={{ color: '#64748b' }}>
                    {group.baux.length} bail{group.baux.length !== 1 ? 's' : ''}
                  </span>
                  {nbImpayes > 0 && (
                    <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>
                      {nbImpayes} impayé{nbImpayes !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: isDateMode ? '860px' : '740px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc' }}>
                        <th className="px-3 py-2.5 w-8" />
                        <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: '#64748b' }}>Lot</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: '#64748b' }}>Locataire</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: '#64748b' }}>N° Bail</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold" style={{ color: '#64748b' }}>Mensuel</th>
                        {isDateMode && (
                          <th className="text-right px-4 py-2.5 text-xs font-semibold" style={{ color: '#64748b' }}>
                            Mois actifs
                          </th>
                        )}
                        <th className="text-right px-4 py-2.5 text-xs font-semibold" style={{ color: '#2563eb' }}>
                          {isDateMode ? 'Total dû' : 'Attendu'}
                        </th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold" style={{ color: '#64748b' }}>Encaissé</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold" style={{ color: '#64748b' }}>Solde</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold" style={{ color: '#64748b' }}>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.baux.map((b: any) => {
                        const isImpaye = b.solde_periode > 0.01
                        const isOpen   = expanded.has(b.bail_id)
                        const nbCols   = isDateMode ? 10 : 9
                        return (
                          <>
                            <tr key={b.bail_id}
                              style={{
                                borderTop: '1px solid #f1f5f9',
                                backgroundColor: isOpen ? '#faf9f7' : isImpaye ? '#fff5f5' : '#fff',
                              }}>
                              {/* Bouton expand (seulement si impayé) */}
                              <td className="px-3 py-3">
                                {isImpaye && (
                                  <button
                                    onClick={() => toggleExpanded(b.bail_id)}
                                    className="flex items-center justify-center w-6 h-6 rounded-full border transition-all"
                                    style={{
                                      borderColor:     isOpen ? '#978A47' : '#e2e8f0',
                                      backgroundColor: isOpen ? '#978A47' : '#fff',
                                      color:           isOpen ? '#fff'    : '#6b7280',
                                    }}
                                    title={isOpen ? 'Masquer les factures' : 'Voir les factures en attente'}
                                  >
                                    <span style={{ fontSize: '10px', lineHeight: 1 }}>
                                      {isOpen ? '▼' : '▶'}
                                    </span>
                                  </button>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-xs" style={{ color: '#0f172a' }}>{b.lot_code}</p>
                                <p className="text-xs" style={{ color: '#94a3b8' }}>{b.lot_name || b.lot_type || ''}</p>
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-xs" style={{ color: '#0f172a' }}>{b.locataire_nom}</p>
                                <p className="text-xs" style={{ color: '#94a3b8' }}>
                                  {b.locataire_type === 'entreprise' ? 'Entreprise' : 'Particulier'}
                                </p>
                              </td>
                              <td className="px-4 py-3 text-xs" style={{ color: '#64748b' }}>{b.bail_code}</td>
                              <td className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#0f172a' }}>
                                {fmt(b.loyer_mensuel)}
                              </td>
                              {isDateMode && (
                                <td className="px-4 py-3 text-right text-xs font-medium" style={{ color: '#64748b' }}>
                                  {b.nb_mois ?? '—'} mois
                                </td>
                              )}
                              <td className="px-4 py-3 text-right text-xs font-semibold" style={{ color: '#2563eb' }}>
                                {fmt(b.loyer_attendu)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="text-xs font-semibold" style={{ color: '#16a34a' }}>
                                  {fmt(b.encaisse_periode)}
                                </span>
                                {b.nb_encaissements > 0 && (
                                  <p className="text-xs" style={{ color: '#94a3b8' }}>
                                    {b.nb_encaissements} mvt{b.nb_encaissements !== 1 ? 's' : ''}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-xs font-semibold"
                                style={{ color: isImpaye ? '#dc2626' : '#16a34a' }}>
                                {isImpaye ? `+${fmt(b.solde_periode)}` : fmt(b.solde_periode)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <StatutBadge impaye={isImpaye} />
                              </td>
                            </tr>

                            {/* Ligne dépliable : factures en attente */}
                            {isOpen && <QuittancesEnAttente bailId={b.bail_id} colSpan={nbCols} />}
                          </>
                        )
                      })}
                    </tbody>

                    {/* Sous-total immeuble */}
                    <tfoot>
                      <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                        <td />
                        <td colSpan={isDateMode ? 4 : 3}
                          className="px-4 py-2.5 text-xs font-bold"
                          style={{ color: '#374151' }}>
                          Sous-total {group.immeuble_name}
                        </td>
                        {isDateMode && <td className="px-4 py-2.5" />}
                        <td className="px-4 py-2.5 text-right text-xs font-bold" style={{ color: '#2563eb' }}>
                          {fmt(totalAttendu)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs font-bold" style={{ color: '#16a34a' }}>
                          {fmt(totalEnc)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs font-bold"
                          style={{ color: totalSolde > 0.01 ? '#dc2626' : '#16a34a' }}>
                          {totalSolde > 0.01 ? `+${fmt(totalSolde)}` : fmt(totalSolde)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Lots vacants ─────────────────────────────────────────────────── */}
      {data?.lots_vacants?.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 flex items-center gap-3"
            style={{ backgroundColor: '#FEF9C3', borderBottom: '2px solid #ca8a04' }}>
            <span style={{ fontSize: '18px' }}>🏚️</span>
            <span className="font-bold text-sm" style={{ color: '#78350f' }}>
              Lots vacants — {data.lots_vacants.length} lot{data.lots_vacants.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: '#64748b' }}>Immeuble</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: '#64748b' }}>Lot</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: '#64748b' }}>Désignation</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: '#64748b' }}>Type</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold" style={{ color: '#64748b' }}>Surface</th>
                </tr>
              </thead>
              <tbody>
                {data.lots_vacants.map((v: any, i: number) => (
                  <tr key={i} style={{ borderTop: '1px solid #f1f5f9', backgroundColor: '#FEFCE8' }}>
                    <td className="px-4 py-2.5 text-xs" style={{ color: '#78350f' }}>{v.immeuble_name}</td>
                    <td className="px-4 py-2.5 text-xs font-semibold" style={{ color: '#0f172a' }}>{v.lot_code}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: '#64748b' }}>{v.lot_name || '—'}</td>
                    <td className="px-4 py-2.5 text-xs" style={{ color: '#64748b' }}>{v.lot_type || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-xs" style={{ color: '#64748b' }}>
                      {v.surface ? `${parseFloat(v.surface)} m²` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
