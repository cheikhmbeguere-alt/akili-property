import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { indexationAPI } from '../services/api'
import Protect from '../components/Protect'

type Tab = 'a-faire' | 'historique' | 'indices' | 'rattrapage'

// ─── Modal saisie valeur indice ───────────────────────────────────────────────
function AddIndiceValueModal({ indice, onClose, onSaved }: { indice: any; onClose: () => void; onSaved: () => void }) {
  const currentYear    = new Date().getFullYear()
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3)
  const [year, setYear]       = useState(currentYear)
  const [quarter, setQuarter] = useState(currentQuarter)
  const [value, setValue]     = useState('')
  const [pubDate, setPubDate] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await indexationAPI.addIndiceValue(indice.id, { year, quarter, value: parseFloat(value), publication_date: pubDate || null })
      toast.success(`Valeur ${indice.code} T${quarter} ${year} enregistrée`)
      onSaved()
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-bold mb-5" style={{ color: '#1a1a1a' }}>
          Ajouter une valeur — {indice.code}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Année</label>
              <input type="number" value={year} onChange={e => setYear(+e.target.value)}
                className={inputCls} style={{ borderColor: '#e2e8f0' }} required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Trimestre</label>
              <select value={quarter} onChange={e => setQuarter(+e.target.value)}
                className={inputCls} style={{ borderColor: '#e2e8f0' }}>
                {[1,2,3,4].map(q => <option key={q} value={q}>T{q}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Valeur publiée *</label>
            <input type="number" step="0.0001" value={value} onChange={e => setValue(e.target.value)}
              className={inputCls} style={{ borderColor: '#e2e8f0' }} placeholder="ex: 122.45" required />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Date de publication</label>
            <input type="date" value={pubDate} onChange={e => setPubDate(e.target.value)}
              className={inputCls} style={{ borderColor: '#e2e8f0' }} />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border" style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>
              Annuler
            </button>
            <button type="submit" disabled={loading}
              className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: '#978A47' }}>
              {loading ? '…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function Indexations() {
  const [tab, setTab]                 = useState<Tab>('a-faire')
  const [selectedIndice, setSelectedIndice] = useState<any>(null)
  const [applying, setApplying]       = useState<Set<number>>(new Set())
  const [syncing, setSyncing]         = useState(false)
  const [rattrapageBailId, setRattrapageBailId] = useState<string>('')
  const [rattrapageData, setRattrapageData]     = useState<any>(null)
  const [loadingRattrapage, setLoadingRattrapage] = useState(false)
  const [applyingYear, setApplyingYear]           = useState<number | null>(null)
  const [lastApplied, setLastApplied]             = useState<{ year: number; loyer: number } | null>(null)
  const navigate                      = useNavigate()
  const queryClient                   = useQueryClient()

  const { data: aFaire = [], isLoading: loadingAFaire } = useQuery({
    queryKey: ['indexations-a-faire'],
    queryFn: () => indexationAPI.getAFaire().then(r => r.data),
  })

  const { data: historique = [], isLoading: loadingHisto } = useQuery({
    queryKey: ['indexations-historique'],
    queryFn: () => indexationAPI.getHistorique().then(r => r.data),
    enabled: tab === 'historique',
  })

  const { data: indices = [], isLoading: loadingIndices } = useQuery({
    queryKey: ['indices'],
    queryFn: () => indexationAPI.getIndices().then(r => r.data),
    enabled: tab === 'indices',
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['indexations-a-faire'] })
    queryClient.invalidateQueries({ queryKey: ['indexations-historique'] })
    queryClient.invalidateQueries({ queryKey: ['baux'] })
  }

  const handleLoadRattrapage = async () => {
    const id = parseInt(rattrapageBailId)
    if (!id) return toast.error('Saisissez un ID de bail')
    setLoadingRattrapage(true)
    setRattrapageData(null)
    try {
      const res = await indexationAPI.getRattrapage(id)
      setRattrapageData(res.data)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Bail introuvable ou indexation non applicable')
    } finally {
      setLoadingRattrapage(false)
    }
  }

  const handleApplyRattrapage = async (row: any) => {
    if (!row.can_apply || !rattrapageData) return
    setApplyingYear(row.year)
    try {
      await indexationAPI.apply(rattrapageData.bail_id, {
        nouveau_loyer_ht: row.nouveau_loyer,
        indice_ancien:    row.indice_ancien,
        indice_nouveau:   row.indice_nouveau,
        indexation_date:  row.anniversary_date,
        notes:            `Rattrapage ${row.year}`,
      })
      // Confirmation inline + toast
      setLastApplied({ year: row.year, loyer: row.nouveau_loyer })
      setTimeout(() => setLastApplied(null), 4000)
      toast.success(`Indexation ${row.year} appliquée — loyer : ${formatEur(row.nouveau_loyer)}`)
      // Recharger le rattrapage pour mettre à jour
      const res = await indexationAPI.getRattrapage(rattrapageData.bail_id)
      setRattrapageData(res.data)
      invalidate()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur')
    } finally {
      setApplyingYear(null)
    }
  }

  const handleApplyAllRattrapage = async () => {
    if (!rattrapageData) return
    const pending = rattrapageData.rows.filter((r: any) => r.can_apply)
    if (!pending.length) return toast('Aucune indexation à appliquer', { icon: 'ℹ️' })
    // Appliquer en série (ordre chronologique)
    for (const row of pending) {
      setApplyingYear(row.year)
      try {
        await indexationAPI.apply(rattrapageData.bail_id, {
          nouveau_loyer_ht: row.nouveau_loyer,
          indice_ancien:    row.indice_ancien,
          indice_nouveau:   row.indice_nouveau,
          indexation_date:  row.anniversary_date,
          notes:            `Rattrapage ${row.year}`,
        })
      } catch (err: any) {
        toast.error(`Erreur ${row.year}: ${err?.response?.data?.error || 'Erreur'}`)
        break
      }
    }
    setApplyingYear(null)
    const res = await indexationAPI.getRattrapage(rattrapageData.bail_id)
    setRattrapageData(res.data)
    invalidate()
    toast.success(`${pending.length} indexation(s) de rattrapage appliquées`)
  }

  const handleApply = async (bail: any) => {
    if (!bail.nouveau_loyer_ht || !bail.indice_nouveau || !bail.indice_ancien) {
      return toast.error('Valeur d\'indice manquante — ajoutez-la dans l\'onglet Indices')
    }
    setApplying(s => new Set(s).add(bail.bail_id))
    try {
      await indexationAPI.apply(bail.bail_id, {
        nouveau_loyer_ht: bail.nouveau_loyer_ht,
        indice_ancien: bail.indice_ancien,
        indice_nouveau: bail.indice_nouveau,
      })
      toast.success(`Indexation appliquée — nouveau loyer : ${formatEur(bail.nouveau_loyer_ht)}/mois`)
      invalidate()
    } catch {
      toast.error('Erreur lors de l\'indexation')
    } finally {
      setApplying(s => { const n = new Set(s); n.delete(bail.bail_id); return n })
    }
  }

  const handleSyncInsee = async () => {
    setSyncing(true)
    try {
      const res = await indexationAPI.syncInsee()
      const { totalImported, details } = res.data
      const errors = details.filter((d: any) => d.error)
      if (totalImported > 0) {
        toast.success(`${totalImported} valeur(s) synchronisées depuis INSEE`)
      } else if (!errors.length) {
        toast('Indices déjà à jour', { icon: 'ℹ️' })
      }
      if (errors.length) {
        errors.forEach((d: any) => toast.error(`${d.code} : ${d.error}`))
      }
      queryClient.invalidateQueries({ queryKey: ['indices'] })
      queryClient.invalidateQueries({ queryKey: ['indexations-a-faire'] })
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Erreur de synchronisation INSEE'
      toast.error(msg)
    } finally {
      setSyncing(false)
    }
  }

  const handleApplyAll = async () => {
    const eligible = aFaire.filter((b: any) => b.nouveau_loyer_ht && b.indice_nouveau && b.indice_ancien)
    if (!eligible.length) return toast.error('Aucun bail avec indice disponible')
    try {
      const res = await indexationAPI.applyBatch(eligible.map((b: any) => ({
        bail_id: b.bail_id,
        nouveau_loyer_ht: b.nouveau_loyer_ht,
        indice_ancien: b.indice_ancien,
        indice_nouveau: b.indice_nouveau,
      })))
      toast.success(`${res.data.applied} indexation(s) appliquée(s)`)
      if (res.data.errors?.length) res.data.errors.forEach((e: string) => toast.error(e))
      invalidate()
    } catch {
      toast.error('Erreur lors de l\'indexation en masse')
    }
  }

  const formatEur = (v: number | null) =>
    v != null ? v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—'

  const formatPct = (v: number | null) =>
    v != null ? `${v > 0 ? '+' : ''}${v.toFixed(2)} %` : '—'

  const TABS: { id: Tab; label: string; emoji: string }[] = [
    { id: 'a-faire',    label: 'À faire',    emoji: '⏰' },
    { id: 'historique', label: 'Historique', emoji: '📋' },
    { id: 'indices',    label: 'Indices',    emoji: '📊' },
    { id: 'rattrapage', label: 'Rattrapage', emoji: '⏪' },
  ]

  const eligible = aFaire.filter((b: any) => b.nouveau_loyer_ht && b.indice_nouveau)
  // loyer_effectif = dernier nouveau_loyer ou loyer_ht de base si jamais indexé
  const loyerEffectif = (b: any) => b.loyer_effectif ?? b.loyer_ht

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>Indexation des loyers</h1>
          <p className="text-sm mt-0.5" style={{ color: '#9ca3af' }}>
            Révision annuelle des loyers selon l'indice de référence
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'indices' && (
            <Protect minRole="admin">
              <button
                onClick={handleSyncInsee}
                disabled={syncing}
                className="px-4 py-2 text-sm font-semibold rounded-lg border disabled:opacity-40"
                style={{ borderColor: '#978A47', color: '#978A47' }}>
                {syncing ? '⏳ Sync…' : '🔄 Sync INSEE'}
              </button>
            </Protect>
          )}
          {tab === 'a-faire' && aFaire.length > 0 && (
            <Protect minRole="editor">
              <button
                onClick={handleApplyAll}
                disabled={eligible.length === 0}
                className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-40"
                style={{ backgroundColor: '#978A47' }}>
                ⚡ Appliquer tout ({eligible.length})
              </button>
            </Protect>
          )}
        </div>
      </div>

      {/* KPI banner */}
      {tab === 'a-faire' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#e2e8f0' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#9ca3af' }}>Indexations dues</p>
            <p className="text-2xl font-bold" style={{ color: aFaire.length > 0 ? '#d97706' : '#16a34a' }}>{aFaire.length}</p>
          </div>
          <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#e2e8f0' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#9ca3af' }}>Prêtes à appliquer</p>
            <p className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>{eligible.length}</p>
          </div>
          <div className="bg-white rounded-xl border p-4 col-span-2 sm:col-span-1" style={{ borderColor: '#e2e8f0' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#9ca3af' }}>Gain mensuel estimé</p>
            <p className="text-2xl font-bold" style={{ color: '#16a34a' }}>
              {formatEur(eligible.reduce((s: number, b: any) => s + (b.nouveau_loyer_ht - loyerEffectif(b)), 0))}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b" style={{ borderColor: '#e2e8f0' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-4 py-2.5 text-sm font-medium transition-colors border-b-2"
            style={{
              color: tab === t.id ? '#978A47' : '#9ca3af',
              borderBottomColor: tab === t.id ? '#978A47' : 'transparent',
              marginBottom: '-1px',
            }}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* ── À faire ── */}
      {tab === 'a-faire' && (
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
          {loadingAFaire ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-2"
                style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
            </div>
          ) : aFaire.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <span style={{ fontSize: '40px' }}>✅</span>
              <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>Tous les loyers sont à jour</p>
              <p className="text-xs" style={{ color: '#9ca3af' }}>Aucune indexation due pour l'année en cours</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: '#faf9f7', borderBottom: '1px solid #ede9e6' }}>
                    {['Locataire', 'Lot', 'Loyer actuel', 'Indice', 'Base → Nouveau', 'Variation', 'Nouveau loyer', 'Date prévue', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                        style={{ color: '#9ca3af' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aFaire.map((b: any) => {
                    const hasIndice = !!b.indice_nouveau
                    return (
                      <tr key={b.bail_id} className="border-b table-row-hover" style={{ borderColor: '#f5f3f0' }}>
                        <td className="px-4 py-3 font-medium" style={{ color: '#1a1a1a' }}>{b.locataire_nom}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium" style={{ color: '#978A47' }}>{b.lot_code}</span>
                          {b.lot_name && <span className="text-xs ml-1" style={{ color: '#9ca3af' }}>· {b.lot_name}</span>}
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: '#1a1a1a' }}>
                          {formatEur(loyerEffectif(b))}
                          {b.loyer_effectif && b.loyer_effectif !== b.loyer_ht && (
                            <span className="block text-xs" style={{ color: '#9ca3af' }}>
                              base {formatEur(b.loyer_ht)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                            {b.indice_code}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>
                          {hasIndice
                            ? <>{b.indice_ancien?.toFixed(2)} → <strong style={{ color: '#1a1a1a' }}>{b.indice_nouveau?.toFixed(2)}</strong></>
                            : <span style={{ color: '#d97706' }}>⚠️ Valeur manquante</span>}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold"
                          style={{ color: b.variation_pct > 0 ? '#16a34a' : b.variation_pct < 0 ? '#dc2626' : '#6b7280' }}>
                          {formatPct(b.variation_pct)}
                        </td>
                        <td className="px-4 py-3 font-bold" style={{ color: '#16a34a' }}>
                          {hasIndice ? formatEur(b.nouveau_loyer_ht) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>
                          {b.date_prevue ? new Date(b.date_prevue).toLocaleDateString('fr-FR') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Protect minRole="editor">
                            <button
                              onClick={() => handleApply(b)}
                              disabled={!hasIndice || applying.has(b.bail_id)}
                              className="text-xs font-semibold px-3 py-1 rounded-lg text-white disabled:opacity-40"
                              style={{ backgroundColor: hasIndice ? '#978A47' : '#9ca3af' }}>
                              {applying.has(b.bail_id) ? '…' : 'Appliquer'}
                            </button>
                          </Protect>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Historique ── */}
      {tab === 'historique' && (
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
          {loadingHisto ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-2"
                style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
            </div>
          ) : historique.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <span style={{ fontSize: '40px' }}>📋</span>
              <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>Aucune indexation enregistrée</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: '#faf9f7', borderBottom: '1px solid #ede9e6' }}>
                    {['Date', 'Locataire', 'Lot', 'Indice', 'Ancien loyer', 'Nouveau loyer', 'Coefficient', 'Variation'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                        style={{ color: '#9ca3af' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historique.map((ix: any) => {
                    const variation = (ix.coefficient - 1) * 100
                    return (
                      <tr key={ix.id} className="border-b table-row-hover" style={{ borderColor: '#f5f3f0' }}>
                        <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>
                          {new Date(ix.indexation_date).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: '#1a1a1a' }}>{ix.locataire_nom}</td>
                        <td className="px-4 py-3 text-xs font-medium" style={{ color: '#978A47' }}>{ix.lot_code}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                            style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                            {ix.indice_code}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: '#6b7280' }}>{formatEur(ix.ancien_loyer_ht)}</td>
                        <td className="px-4 py-3 font-semibold" style={{ color: '#1a1a1a' }}>{formatEur(ix.nouveau_loyer_ht)}</td>
                        <td className="px-4 py-3 text-xs font-mono" style={{ color: '#6b7280' }}>
                          ×{ix.coefficient.toFixed(4)}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold"
                          style={{ color: variation > 0 ? '#16a34a' : '#dc2626' }}>
                          {formatPct(variation)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Indices ── */}
      {tab === 'indices' && (
        <div className="space-y-4">
          {loadingIndices ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-2"
                style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
            </div>
          ) : (
            indices.map((indice: any) => (
              <IndiceCard
                key={indice.id}
                indice={indice}
                onAddValue={() => setSelectedIndice(indice)}
              />
            ))
          )}
        </div>
      )}

      {/* ── Rattrapage ── */}
      {tab === 'rattrapage' && (
        <div className="space-y-5">
          {/* Sélection bail */}
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#e2e8f0' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: '#1a1a1a' }}>
              Sélectionner un bail à rattraper
            </p>
            <div className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#6b7280' }}>ID Bail</label>
                <input
                  type="number" value={rattrapageBailId}
                  onChange={e => setRattrapageBailId(e.target.value)}
                  placeholder="ex: 1"
                  className="border rounded-lg px-3 py-2 text-sm w-32 outline-none"
                  style={{ borderColor: '#e2e8f0' }}
                  onKeyDown={e => e.key === 'Enter' && handleLoadRattrapage()}
                />
              </div>
              <button
                onClick={handleLoadRattrapage}
                disabled={loadingRattrapage}
                className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-40"
                style={{ backgroundColor: '#978A47' }}>
                {loadingRattrapage ? '⏳ Chargement…' : '🔍 Calculer'}
              </button>
              {rattrapageData && (
                <Protect minRole="editor">
                  <button
                    onClick={handleApplyAllRattrapage}
                    disabled={applyingYear !== null}
                    className="px-4 py-2 text-sm font-semibold rounded-lg border disabled:opacity-40"
                    style={{ borderColor: '#978A47', color: '#978A47' }}>
                    ⚡ Tout appliquer
                  </button>
                </Protect>
              )}
            </div>
          </div>

          {/* Résultats */}
          {rattrapageData && (
            <>
            {/* ── Bandeau statut indexation ── */}
            {(() => {
              const manquantes = rattrapageData.rows.filter((r: any) => !r.already_done && r.can_apply)
              const loyerAttendu = [...rattrapageData.rows].reverse().find((r: any) => r.nouveau_loyer)?.nouveau_loyer ?? null
              const loyerActuel = rattrapageData.loyer_reprise ?? rattrapageData.loyer_contractuel
              const hasRows = rattrapageData.rows.length > 0
              if (!hasRows) return null
              if (manquantes.length === 0) return (
                <div className="rounded-xl border px-5 py-4 flex items-center gap-3"
                  style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
                  <span className="text-xl">✅</span>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#166534' }}>Indexation à jour</p>
                    <p className="text-xs mt-0.5" style={{ color: '#16a34a' }}>
                      Toutes les années connues sont correctement indexées.
                      {loyerAttendu && <span> Loyer indexé : <strong>{formatEur(loyerAttendu)}</strong> / mois</span>}
                    </p>
                  </div>
                </div>
              )
              return (
                <div className="rounded-xl border px-5 py-4 flex items-start gap-3 justify-between flex-wrap"
                  style={{ backgroundColor: '#fffbeb', borderColor: '#fcd34d' }}>
                  <div className="flex items-start gap-3">
                    <span className="text-xl">⚠️</span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: '#92400e' }}>
                        {manquantes.length} année{manquantes.length > 1 ? 's' : ''} non indexée{manquantes.length > 1 ? 's' : ''} détectée{manquantes.length > 1 ? 's' : ''}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: '#b45309' }}>
                        Loyer actuel : <strong>{formatEur(loyerActuel)}</strong>
                        {loyerAttendu && <> · Loyer indexé attendu : <strong>{formatEur(loyerAttendu)}</strong></>}
                        {loyerAttendu && loyerActuel && <> · Écart : <strong style={{ color: '#16a34a' }}>+{formatEur(loyerAttendu - loyerActuel)}</strong></>}
                      </p>
                    </div>
                  </div>
                  <Protect minRole="editor">
                    <button
                      onClick={handleApplyAllRattrapage}
                      disabled={applyingYear !== null}
                      className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-40 whitespace-nowrap"
                      style={{ backgroundColor: '#0f172a' }}>
                      {applyingYear !== null ? '⏳ Application…' : '⚡ Appliquer le rattrapage complet'}
                    </button>
                  </Protect>
                </div>
              )
            })()}

            {/* ── Bandeau anomalie (variation négative) ── */}
            {(() => {
              const anomalies = rattrapageData.rows.filter(
                (r: any) => r.variation_pct !== null && r.variation_pct < -0.5
              )
              if (anomalies.length === 0) return null
              const hasApplied = anomalies.some((r: any) => r.already_done)
              const first = anomalies[0]
              return (
                <div className="rounded-xl border px-5 py-4 space-y-2"
                  style={{ backgroundColor: '#fff1f2', borderColor: '#fecdd3' }}>
                  <div className="flex items-start gap-3">
                    <span className="text-xl flex-shrink-0">🚨</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold" style={{ color: '#be123c' }}>
                        Variation négative détectée en {first.year} : {first.variation_pct?.toFixed(2)}%
                      </p>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: '#9f1239' }}>
                        La valeur de base de l'indice <strong>({rattrapageData.indice_base_value ?? '?'})</strong> semble
                        incorrecte pour {rattrapageData.indice_code} {rattrapageData.indice_base_year} T{rattrapageData.ref_quarter}.
                        Cela arrive lorsqu'une valeur récente est saisie comme référence sur un bail ancien.
                        <br />
                        <strong>Pour corriger :</strong> 1) Modifiez la valeur de base dans le bail,
                        2) Supprimez les indexations erronées si déjà appliquées,
                        3) Relancez le rattrapage.
                      </p>
                      {hasApplied && (
                        <p className="text-xs mt-1 font-medium" style={{ color: '#be123c' }}>
                          ⚠️ Des indexations avec variation négative ont déjà été appliquées — supprimez-les via l'onglet Historique avant de relancer.
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => navigate('/etat-locatif')}
                      className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg text-white whitespace-nowrap"
                      style={{ backgroundColor: '#be123c' }}>
                      Modifier le bail →
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* ── Confirmation inline après apply ── */}
            {lastApplied && (
              <div className="rounded-xl border px-5 py-3 flex items-center gap-3"
                style={{ backgroundColor: '#f0fdf4', borderColor: '#86efac' }}>
                <span className="text-lg">✅</span>
                <p className="text-sm font-semibold" style={{ color: '#166534' }}>
                  Indexation {lastApplied.year} appliquée — Nouveau loyer : <strong>{formatEur(lastApplied.loyer)}</strong> / mois
                </p>
              </div>
            )}

            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
              {/* Info bail */}
              <div className="px-5 py-3 border-b flex flex-wrap gap-4 text-xs" style={{ borderColor: '#f5f3f0', backgroundColor: '#faf9f7' }}>
                <span><span style={{ color: '#9ca3af' }}>Bail ID</span> <strong style={{ color: '#1a1a1a' }}>{rattrapageData.bail_id}</strong></span>
                <span><span style={{ color: '#9ca3af' }}>Loyer contractuel</span> <strong style={{ color: '#1a1a1a' }}>{formatEur(rattrapageData.loyer_contractuel)}</strong></span>
                {rattrapageData.loyer_reprise && (
                  <span><span style={{ color: '#9ca3af' }}>Loyer reprise</span> <strong style={{ color: '#978A47' }}>{formatEur(rattrapageData.loyer_reprise)}</strong></span>
                )}
                <span><span style={{ color: '#9ca3af' }}>Indice</span> <strong style={{ color: '#978A47' }}>{rattrapageData.indice_code}</strong></span>
                <span><span style={{ color: '#9ca3af' }}>Trimestre référence</span> <strong style={{ color: '#1a1a1a' }}>T{rattrapageData.ref_quarter}</strong></span>
                <span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: rattrapageData.indexation_frequency === 'triennale' ? '#fef3c7' : '#f0fdf4',
                      color: rattrapageData.indexation_frequency === 'triennale' ? '#92400e' : '#166534',
                    }}>
                    {rattrapageData.indexation_frequency === 'triennale' ? '⏳ Triennale (tous les 3 ans)' : '📅 Annuelle'}
                  </span>
                </span>
                {rattrapageData.solde_reprise_date && (
                  <span><span style={{ color: '#9ca3af' }}>Date reprise</span> <strong style={{ color: '#1a1a1a' }}>{new Date(rattrapageData.solde_reprise_date).toLocaleDateString('fr-FR')}</strong></span>
                )}
              </div>

              <div>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: '#faf9f7', borderBottom: '1px solid #ede9e6' }}>
                      {['Année', 'Indices (N-1 → N)', 'Loyer mensuel avant', 'Loyer mensuel après', 'Loyer annuel', 'Variation', 'Statut'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                          style={{ color: '#9ca3af' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rattrapageData.rows.map((row: any) => (
                      <tr key={row.year} className="border-b" style={{ borderColor: '#f5f3f0',
                        backgroundColor: row.already_done ? '#f0fdf4' : row.can_apply ? 'white' : '#fffbeb' }}>
                        <td className="px-3 py-2.5 font-bold" style={{ color: '#1a1a1a' }}>
                          {row.year}
                          <div className="text-xs font-normal" style={{ color: '#9ca3af' }}>
                            {new Date(row.anniversary_date).toLocaleDateString('fr-FR')}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono">
                          {row.indice_ancien != null && row.indice_nouveau != null ? (
                            <span>
                              <span style={{ color: '#6b7280' }}>{row.ref_year_ancien} T{row.ref_quarter} = </span>
                              <strong style={{ color: '#1a1a1a' }}>{row.indice_ancien.toFixed(2)}</strong>
                              <span style={{ color: '#9ca3af' }}> → </span>
                              <span style={{ color: '#6b7280' }}>{row.ref_year_nouveau} T{row.ref_quarter} = </span>
                              <strong style={{ color: '#1a1a1a' }}>{row.indice_nouveau.toFixed(2)}</strong>
                            </span>
                          ) : (
                            <span style={{ color: '#d97706' }}>⚠️ Indice manquant</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5" style={{ color: '#6b7280' }}>{formatEur(row.loyer_base)}</td>
                        <td className="px-3 py-2.5 font-semibold" style={{ color: row.nouveau_loyer ? '#16a34a' : '#9ca3af' }}>
                          {row.nouveau_loyer ? formatEur(row.nouveau_loyer) : '—'}
                        </td>
                        <td className="px-3 py-2.5 font-semibold" style={{ color: row.nouveau_loyer ? '#0891b2' : '#9ca3af' }}>
                          {row.nouveau_loyer ? formatEur(row.nouveau_loyer * 12) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-semibold"
                          style={{ color: row.variation_pct == null ? '#9ca3af' : row.variation_pct < 0 ? '#be123c' : '#16a34a' }}>
                          {row.variation_pct != null
                            ? `${row.variation_pct >= 0 ? '+' : ''}${row.variation_pct.toFixed(2)} %`
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.already_done ? (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: '#dcfce7', color: '#166534' }}>
                              ✅ Fait
                            </span>
                          ) : row.can_apply ? (
                            <Protect minRole="editor">
                              <button
                                onClick={() => handleApplyRattrapage(row)}
                                disabled={applyingYear !== null}
                                className="text-xs font-semibold px-3 py-1 rounded-lg text-white disabled:opacity-40"
                                style={{ backgroundColor: '#978A47' }}>
                                {applyingYear === row.year ? '…' : 'Appliquer'}
                              </button>
                            </Protect>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                              ⚠️ Manquant
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Récap */}
              {(() => {
                const last = rattrapageData.rows.filter((r: any) => r.already_done || r.nouveau_loyer).slice(-1)[0]
                const loyerFinal = last?.already_done
                  ? last.existing?.nouveau_loyer_ht
                  : last?.nouveau_loyer
                return loyerFinal ? (
                  <div className="px-5 py-4 border-t flex items-center justify-between" style={{ borderColor: '#e2e8f0' }}>
                    <span className="text-sm" style={{ color: '#6b7280' }}>
                      Loyer effectif après rattrapage complet
                    </span>
                    <span className="text-lg font-bold" style={{ color: '#16a34a' }}>
                      {formatEur(loyerFinal)} / mois
                    </span>
                  </div>
                ) : null
              })()}
            </div>
            </>
          )}
        </div>
      )}

      {/* Modal saisie indice */}
      {selectedIndice && (
        <AddIndiceValueModal
          indice={selectedIndice}
          onClose={() => setSelectedIndice(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['indices'] })
            queryClient.invalidateQueries({ queryKey: ['indexations-a-faire'] })
          }}
        />
      )}
    </div>
  )
}

// ─── Card indice ──────────────────────────────────────────────────────────────
function IndiceCard({ indice, onAddValue }: { indice: any; onAddValue: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [values, setValues]     = useState<any[]>([])
  const [loading, setLoading]   = useState(false)

  const loadValues = async () => {
    if (expanded) { setExpanded(false); return }
    setLoading(true)
    try {
      const res = await indexationAPI.getIndiceValues(indice.id)
      setValues(res.data)
      setExpanded(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold px-3 py-1 rounded-lg"
            style={{ backgroundColor: '#F5F0DC', color: '#978A47' }}>{indice.code}</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>{indice.name}</p>
            {indice.derniere_valeur ? (
              <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                Dernière valeur : <strong style={{ color: '#1a1a1a' }}>{parseFloat(indice.derniere_valeur).toFixed(2)}</strong>
                {' '}— T{indice.dernier_trimestre} {indice.derniere_annee}
              </p>
            ) : (
              <p className="text-xs mt-0.5" style={{ color: '#d97706' }}>⚠️ Aucune valeur enregistrée</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Protect minRole="editor">
            <button
              onClick={onAddValue}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border"
              style={{ borderColor: '#978A47', color: '#978A47' }}>
              + Valeur
            </button>
          </Protect>
          <button
            onClick={loadValues}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border"
            style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>
            {loading ? '…' : expanded ? '▲ Masquer' : '▼ Historique'}
          </button>
        </div>
      </div>

      {expanded && values.length > 0 && (
        <div className="border-t px-5 py-3" style={{ borderColor: '#f5f3f0' }}>
          <div className="grid grid-cols-4 gap-2">
            {values.slice(0, 12).map(v => (
              <div key={v.id} className="rounded-lg p-2.5 text-center"
                style={{ backgroundColor: '#faf9f7' }}>
                <p className="text-xs font-semibold" style={{ color: '#9ca3af' }}>T{v.quarter} {v.year}</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: '#1a1a1a' }}>
                  {parseFloat(v.value).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
