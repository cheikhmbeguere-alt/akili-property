import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { encaissementsAPI, bauxAPI, pennylaneAPI, sciAPI, exportAPI, quittancesAPI } from '../services/api'
import EncaissementList from '../components/EncaissementList'
import EncaissementForm from '../components/EncaissementForm'
import Protect from '../components/Protect'
import PennylaneGuide from '../components/PennylaneGuide'

type Tab = 'liste' | 'a-encaisser' | 'saisie' | 'import' | 'pennylane' | 'fec'

interface ImportResult {
  imported: number
  skipped: number
  unmatched_count: number
  unmatched: Array<{
    date?: string
    montant?: number
    reference?: string
    locataire_hint?: string
    row_index: number
  }>
}

// ─── Onglet Pennylane ─────────────────────────────────────────────────────────
function PennylaneTab({ onImported }: { onImported: () => void }) {
  const [selectedSciId, setSelectedSciId] = useState<number | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingTx, setLoadingTx] = useState(false)
  const [transactions, setTransactions] = useState<any[]>([])
  const [meta, setMeta] = useState<any>({})
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [importing, setImporting] = useState<Set<string>>(new Set())
  const [matchOverrides, setMatchOverrides] = useState<Record<string, string>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importingBatch, setImportingBatch] = useState(false)
  const [periodeMap, setPeriodeMap] = useState<Record<string, { mois: string; annee: string }>>({})

  const { data: sciList = [] } = useQuery({
    queryKey: ['sci-list'],
    queryFn: () => sciAPI.getAll().then(r => r.data),
  })

  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['pennylane-status', selectedSciId],
    queryFn: () => selectedSciId ? pennylaneAPI.getStatus(selectedSciId).then(r => r.data) : null,
    enabled: !!selectedSciId,
  })

  const { data: bauxList = [] } = useQuery({
    queryKey: ['baux-actifs'],
    queryFn: () => bauxAPI.getAll().then(r => r.data.filter((b: any) => b.status === 'actif')),
  })

  const getBailLabel = (b: any) => {
    const loc = b.locataire_type === 'entreprise'
      ? b.locataire_company || b.locataire_last_name
      : [b.locataire_first_name, b.locataire_last_name].filter(Boolean).join(' ')
    return `${b.code} — ${loc} (${parseFloat(b.loyer_ht).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })})`
  }

  const loadTransactions = async (cur?: string) => {
    if (!selectedSciId) return
    setLoadingTx(true)
    try {
      const r = await pennylaneAPI.getTransactions(selectedSciId, { cursor: cur })
      setTransactions(r.data.transactions || [])
      setMeta(r.data.meta || {})
      setCursor(cur)
      setSelectedIds(new Set())
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur Pennylane')
    } finally {
      setLoadingTx(false)
    }
  }

  const handleSaveToken = async () => {
    if (!token.trim() || !selectedSciId) return
    setSaving(true)
    try {
      const r = await pennylaneAPI.saveToken(selectedSciId, token.trim())
      toast.success(`Connecté à Pennylane — ${r.data.sci_name}`)
      refetchStatus()
      loadTransactions(undefined)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Token invalide')
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    if (!selectedSciId) return
    await pennylaneAPI.deleteToken(selectedSciId)
    toast('Déconnecté de Pennylane', { icon: 'ℹ️' })
    refetchStatus()
    setTransactions([])
  }

  const handleImportOne = async (tx: any) => {
    const bailId = matchOverrides[tx.id] || tx.suggested_bail?.bail_id
    if (!bailId) return toast.error('Sélectionnez un bail pour cette transaction')
    setImporting(s => new Set(s).add(String(tx.id)))
    try {
      const d = new Date(tx.date)
      await pennylaneAPI.importOne({
        transaction_id: tx.id,
        bail_id: Number(bailId),
        date: tx.date,
        amount: tx.amount,
        label: tx.label,
        periode_mois:  periodeMap[tx.id]?.mois  ? parseInt(periodeMap[tx.id].mois)  : d.getMonth() + 1,
        periode_annee: periodeMap[tx.id]?.annee ? parseInt(periodeMap[tx.id].annee) : d.getFullYear(),
      })
      toast.success(`Encaissement créé — ${tx.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}`)
      setTransactions(prev => prev.filter(t => t.id !== tx.id))
      onImported()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur d\'import')
    } finally {
      setImporting(s => { const n = new Set(s); n.delete(String(tx.id)); return n })
    }
  }

  const handleImportBatch = async () => {
    const toImport = transactions.filter(tx => {
      if (!selectedIds.has(String(tx.id))) return false
      return !!(matchOverrides[tx.id] || tx.suggested_bail?.bail_id)
    })
    if (!toImport.length) return toast.error('Aucune transaction sélectionnée avec bail associé')
    setImportingBatch(true)
    try {
      const items = toImport.map(tx => {
        const d = new Date(tx.date)
        return {
          transaction_id: tx.id,
          bail_id: Number(matchOverrides[tx.id] || tx.suggested_bail?.bail_id),
          date: tx.date,
          amount: tx.amount,
          label: tx.label,
          periode_mois:  periodeMap[tx.id]?.mois  ? parseInt(periodeMap[tx.id].mois)  : d.getMonth() + 1,
          periode_annee: periodeMap[tx.id]?.annee ? parseInt(periodeMap[tx.id].annee) : d.getFullYear(),
        }
      })
      const r = await pennylaneAPI.importBatch(items)
      toast.success(`${r.data.imported} encaissement(s) importé(s)`)
      if (r.data.errors?.length) r.data.errors.forEach((e: string) => toast.error(e))
      setTransactions(prev => prev.filter(tx => !selectedIds.has(String(tx.id))))
      setSelectedIds(new Set())
      onImported()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur import batch')
    } finally {
      setImportingBatch(false)
    }
  }

  const toggleSelect = (id: string) =>
    setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const selectAllWithMatch = () => {
    const ids = transactions
      .filter(tx => !tx.already_imported && (tx.suggested_bail || matchOverrides[tx.id]))
      .map(tx => String(tx.id))
    setSelectedIds(new Set(ids))
  }

  useEffect(() => {
    if (status?.configured) loadTransactions(undefined)
  }, [status?.configured, selectedSciId])

  const formatEur = (v: number) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

  // ── Sélecteur de SCI ──
  if (!selectedSciId) {
    return (
      <div className="max-w-lg space-y-5">
        {showGuide && <PennylaneGuide onClose={() => setShowGuide(false)} />}
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-xl border p-5 flex-1" style={{ backgroundColor: '#F5F0DC', borderColor: '#E8DFC0' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: '#978A47' }}>🏦 Synchronisation Pennylane</p>
          <p className="text-xs leading-relaxed" style={{ color: '#6b7280' }}>
            Chaque société dispose de son propre workspace Pennylane et donc de son propre token API.
            Sélectionnez la société pour laquelle vous souhaitez importer des transactions.
          </p>
          </div>
          <button onClick={() => setShowGuide(true)}
            title="Guide de connexion"
            className="shrink-0 w-9 h-9 rounded-full border flex items-center justify-center text-sm font-bold"
            style={{ borderColor: '#978A47', color: '#978A47', backgroundColor: 'white' }}>
            ?
          </button>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
            Société (SCI)
          </label>
          <select
            onChange={e => { setSelectedSciId(Number(e.target.value)); setTransactions([]); setCursorHistory([]) }}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
            style={{ borderColor: '#e2e8f0', color: '#1a1a1a' }}>
            <option value="">— Sélectionner une SCI —</option>
            {sciList.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
    )
  }

  // ── Token invalide ou expiré ──
  if (status?.error) {
    return (
      <div className="max-w-lg space-y-5">
        {showGuide && <PennylaneGuide onClose={() => setShowGuide(false)} />}
        <div className="flex items-center justify-between">
          <button onClick={() => { setSelectedSciId(null); setTransactions([]) }}
            className="text-xs font-medium" style={{ color: '#978A47' }}>← Changer de société</button>
          <button onClick={() => setShowGuide(true)}
            className="text-xs font-medium flex items-center gap-1" style={{ color: '#6b7280' }}>
            ❓ Guide de connexion
          </button>
        </div>
        <div className="rounded-xl border p-5" style={{ backgroundColor: '#fee2e2', borderColor: '#fecaca' }}>
          <p className="text-sm font-semibold mb-1" style={{ color: '#dc2626' }}>⚠️ Token invalide ou expiré</p>
          <p className="text-xs leading-relaxed" style={{ color: '#6b7280' }}>
            Le token Pennylane enregistré pour cette SCI n'est plus valide. Générez-en un nouveau dans Pennylane → Paramètres → API.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>Nouveau token API</label>
          <input type="password" value={token} onChange={e => setToken(e.target.value)}
            placeholder="eyJ..." className="w-full border rounded-lg px-3 py-2 text-sm font-mono outline-none"
            style={{ borderColor: '#e2e8f0' }} />
        </div>
        <button onClick={handleSaveToken} disabled={saving || !token.trim()}
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: '#978A47' }}>
          {saving ? '⏳ Vérification…' : '🔗 Enregistrer le nouveau token'}
        </button>
      </div>
    )
  }

  // ── SCI sélectionnée mais token non configuré ──
  if (!status?.configured) {
    return (
      <div className="max-w-lg space-y-5">
        <button onClick={() => { setSelectedSciId(null); setTransactions([]) }}
          className="text-xs font-medium flex items-center gap-1" style={{ color: '#978A47' }}>
          ← Changer de société
        </button>
        <div className="rounded-xl border p-5" style={{ backgroundColor: '#F5F0DC', borderColor: '#E8DFC0' }}>
          <p className="text-sm font-semibold mb-1" style={{ color: '#978A47' }}>
            🔗 Connexion Pennylane — {status?.sci_name || sciList.find((s: any) => s.id === selectedSciId)?.name}
          </p>
          <p className="text-xs leading-relaxed" style={{ color: '#6b7280' }}>
            Collez le token API du workspace Pennylane de cette société.
            Retrouvez-le dans Pennylane → Paramètres → API.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
            Token API Pennylane
          </label>
          <input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="eyJ..."
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-stone-400"
            style={{ borderColor: '#e2e8f0' }}
          />
        </div>
        <button
          onClick={handleSaveToken}
          disabled={saving || !token.trim()}
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: '#978A47' }}>
          {saving ? '⏳ Vérification…' : '🔗 Connecter Pennylane'}
        </button>
      </div>
    )
  }

  // ── Configuré ──
  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: '#dcfce7' }}>
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs font-semibold" style={{ color: '#16a34a' }}>
                Pennylane — {status.sci_name}
              </span>
            </div>
            <button onClick={() => { setSelectedSciId(null); setTransactions([]); setCursorHistory([]) }}
              className="text-xs font-medium" style={{ color: '#9ca3af' }}>
              Changer
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => loadTransactions(cursor)}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border"
              style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>
              🔄
            </button>
            <button onClick={handleDisconnect}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border"
              style={{ borderColor: '#fecaca', color: '#dc2626' }}>
              Déconnecter
            </button>
          </div>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleImportBatch} disabled={importingBatch}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white disabled:opacity-40"
              style={{ backgroundColor: '#978A47' }}>
              {importingBatch ? '⏳…' : `⚡ Importer (${selectedIds.size})`}
            </button>
            <button onClick={selectAllWithMatch}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border"
              style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>
              Tout sélectionner
            </button>
          </div>
        )}
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
        {loadingTx ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2"
              style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <span style={{ fontSize: '40px' }}>🏦</span>
            <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>Aucune transaction à rapprocher</p>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Toutes les transactions sont déjà importées</p>
          </div>
        ) : (
          <>
            {/* ── Vue mobile : cartes ── */}
            <div className="sm:hidden divide-y" style={{ borderColor: '#f5f3f0' }}>
              {transactions.map((tx: any) => {
                const hasBail = !!(matchOverrides[tx.id] || tx.suggested_bail)
                const isSelected = selectedIds.has(String(tx.id))
                return (
                  <div key={tx.id} className="p-4 space-y-3"
                    style={{ backgroundColor: tx.already_imported ? '#f9fafb' : isSelected ? '#faf7ec' : 'white', opacity: tx.already_imported ? 0.6 : 1 }}>
                    {/* Ligne 1 : date + montant + checkbox */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {!tx.already_imported && (
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(String(tx.id))} />
                        )}
                        <span className="text-xs" style={{ color: '#9ca3af' }}>
                          {new Date(tx.date).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                      <span className="text-sm font-bold"
                        style={{ color: tx.amount > 0 ? '#16a34a' : '#dc2626' }}>
                        {formatEur(tx.amount)}
                      </span>
                    </div>
                    {/* Ligne 2 : libellé + tiers */}
                    <div>
                      <p className="text-xs font-semibold truncate" style={{ color: '#1a1a1a' }}>{tx.label}</p>
                      {tx.thirdparty && <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{tx.thirdparty}</p>}
                    </div>
                    {/* Bail + période + action */}
                    {tx.already_imported ? (
                      <span className="inline-block text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>✅ Déjà importé</span>
                    ) : (
                      <div className="space-y-2">
                        {tx.suggested_bail && !matchOverrides[tx.id] && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                            style={{ backgroundColor: '#fef9c3', color: '#a16207' }}>
                            🤖 {tx.suggested_bail.score}% — {tx.suggested_bail.lot_code} · {tx.suggested_bail.locataire_nom}
                          </span>
                        )}
                        <select
                          value={matchOverrides[tx.id] || (tx.suggested_bail ? String(tx.suggested_bail.bail_id) : '')}
                          onChange={e => setMatchOverrides(p => ({ ...p, [tx.id]: e.target.value }))}
                          className="text-xs border rounded px-2 py-1.5 w-full"
                          style={{ borderColor: hasBail ? '#978A47' : '#e2e8f0' }}>
                          <option value="">— Choisir un bail —</option>
                          {bauxList.map((b: any) => <option key={b.id} value={b.id}>{getBailLabel(b)}</option>)}
                        </select>
                        <div className="flex items-center gap-2">
                          <select value={periodeMap[tx.id]?.mois || ''}
                            onChange={e => setPeriodeMap(p => ({ ...p, [tx.id]: { ...p[tx.id], mois: e.target.value } }))}
                            className="text-xs border rounded px-1 py-1.5 flex-1"
                            style={{ borderColor: '#e2e8f0' }}>
                            <option value="">Mois</option>
                            {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
                          </select>
                          <select value={periodeMap[tx.id]?.annee || ''}
                            onChange={e => setPeriodeMap(p => ({ ...p, [tx.id]: { ...p[tx.id], annee: e.target.value } }))}
                            className="text-xs border rounded px-1 py-1.5 flex-1"
                            style={{ borderColor: '#e2e8f0' }}>
                            <option value="">Année</option>
                            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                          </select>
                          <button onClick={() => handleImportOne(tx)}
                            disabled={importing.has(String(tx.id)) || !hasBail}
                            className="flex-1 py-1.5 text-xs font-semibold rounded-lg text-white disabled:opacity-40"
                            style={{ backgroundColor: hasBail ? '#978A47' : '#9ca3af' }}>
                            {importing.has(String(tx.id)) ? '…' : '+ Importer'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── Vue desktop : tableau ── */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: '#faf9f7', borderBottom: '1px solid #ede9e6' }}>
                    <th className="px-3 py-3 w-8">
                      <input type="checkbox"
                        checked={selectedIds.size === transactions.filter(t => !t.already_imported).length && transactions.length > 0}
                        onChange={e => e.target.checked
                          ? setSelectedIds(new Set(transactions.filter(t => !t.already_imported).map(t => String(t.id))))
                          : setSelectedIds(new Set())} />
                    </th>
                    {['Date', 'Libellé', 'Tiers', 'Montant', 'Bail suggéré', 'Période', 'Action'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                        style={{ color: '#9ca3af' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx: any) => {
                    const hasBail = !!(matchOverrides[tx.id] || tx.suggested_bail)
                    const isSelected = selectedIds.has(String(tx.id))
                    return (
                      <tr key={tx.id} className="border-b"
                        style={{ borderColor: '#f5f3f0', backgroundColor: tx.already_imported ? '#f9fafb' : isSelected ? '#faf7ec' : 'white', opacity: tx.already_imported ? 0.6 : 1 }}>
                        <td className="px-3 py-3">
                          {!tx.already_imported && (
                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(String(tx.id))} />
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: '#6b7280' }}>
                          {new Date(tx.date).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-3 py-3 max-w-[200px]">
                          <p className="text-xs font-medium truncate" style={{ color: '#1a1a1a' }}>{tx.label}</p>
                        </td>
                        <td className="px-3 py-3 text-xs" style={{ color: '#6b7280' }}>{tx.thirdparty || '—'}</td>
                        <td className="px-3 py-3 font-semibold text-xs whitespace-nowrap"
                          style={{ color: tx.amount > 0 ? '#16a34a' : '#dc2626' }}>
                          {formatEur(tx.amount)}
                        </td>
                        <td className="px-3 py-3 min-w-[200px]">
                          {tx.already_imported ? (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>✅ Déjà importé</span>
                          ) : (
                            <div className="space-y-1">
                              {tx.suggested_bail && !matchOverrides[tx.id] && (
                                <div className="flex items-center gap-1">
                                  <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                                    style={{ backgroundColor: '#fef9c3', color: '#a16207' }}>
                                    🤖 {tx.suggested_bail.score}%
                                  </span>
                                  <span className="text-xs truncate" style={{ color: '#6b7280' }}>
                                    {tx.suggested_bail.lot_code} · {tx.suggested_bail.locataire_nom}
                                  </span>
                                </div>
                              )}
                              <select
                                value={matchOverrides[tx.id] || (tx.suggested_bail ? String(tx.suggested_bail.bail_id) : '')}
                                onChange={e => setMatchOverrides(p => ({ ...p, [tx.id]: e.target.value }))}
                                className="text-xs border rounded px-2 py-1 w-full"
                                style={{ borderColor: hasBail ? '#978A47' : '#e2e8f0', color: '#1a1a1a' }}>
                                <option value="">— Choisir un bail —</option>
                                {bauxList.map((b: any) => <option key={b.id} value={b.id}>{getBailLabel(b)}</option>)}
                              </select>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 min-w-[120px]">
                          {!tx.already_imported && (
                            <div className="flex gap-1">
                              <select value={periodeMap[tx.id]?.mois || ''}
                                onChange={e => setPeriodeMap(p => ({ ...p, [tx.id]: { ...p[tx.id], mois: e.target.value } }))}
                                className="text-xs border rounded px-1 py-1" style={{ borderColor: '#e2e8f0', width: '55px' }}>
                                <option value="">M</option>
                                {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
                              </select>
                              <select value={periodeMap[tx.id]?.annee || ''}
                                onChange={e => setPeriodeMap(p => ({ ...p, [tx.id]: { ...p[tx.id], annee: e.target.value } }))}
                                className="text-xs border rounded px-1 py-1" style={{ borderColor: '#e2e8f0', width: '65px' }}>
                                <option value="">An</option>
                                {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                              </select>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {!tx.already_imported && (
                            <button onClick={() => handleImportOne(tx)}
                              disabled={importing.has(String(tx.id)) || !hasBail}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40 whitespace-nowrap"
                              style={{ backgroundColor: hasBail ? '#978A47' : '#9ca3af' }}>
                              {importing.has(String(tx.id)) ? '…' : '+ Importer'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Pagination curseur */}
      {(meta.has_more || cursorHistory.length > 0) && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => {
              const prev = cursorHistory.slice(0, -1)
              setCursorHistory(prev)
              loadTransactions(prev[prev.length - 1])
            }}
            disabled={cursorHistory.length === 0}
            className="px-3 py-1.5 text-xs rounded-lg border disabled:opacity-40"
            style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>← Précédent</button>
          <span className="text-xs" style={{ color: '#9ca3af' }}>Page {cursorHistory.length + 1}</span>
          <button
            onClick={() => {
              if (meta.next_cursor) {
                setCursorHistory(h => [...h, cursor || ''])
                loadTransactions(meta.next_cursor)
              }
            }}
            disabled={!meta.has_more || !meta.next_cursor}
            className="px-3 py-1.5 text-xs rounded-lg border disabled:opacity-40"
            style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>Suivant →</button>
        </div>
      )}
    </div>
  )
}

// ─── Tab À encaisser ──────────────────────────────────────────────────────────
function AEncaisserTab({ quittances, bauxList, loading, onEncaisser, onRefresh }: {
  quittances: any[]
  bauxList: any[]
  loading: boolean
  onEncaisser: (bailId: number, montant: number) => void
  onRefresh: () => void
}) {
  const MOIS_FR = ['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
  const TYPE_LABELS: Record<string, string> = {
    quittance: 'Quittance', appel_loyer: 'Appel loyer', facture: 'Facture'
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-2"
          style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  // Calculer les totaux
  const totalAEncaisser = quittances.reduce((s, q) => s + parseFloat(q.total_ttc || 0), 0)

  // Enrichir avec les soldes de reprise depuis bauxList
  const bailsAvecReprise = bauxList.filter((b: any) => parseFloat(b.solde_reprise || 0) > 0)
  const totalReprise = bailsAvecReprise.reduce((s: number, b: any) => s + parseFloat(b.solde_reprise || 0), 0)

  // Grouper les quittances par bail
  const byBail = quittances.reduce((acc: Record<string, any[]>, q: any) => {
    const key = q.bail_id
    if (!acc[key]) acc[key] = []
    acc[key].push(q)
    return acc
  }, {})

  const formatEur = (n: any) =>
    parseFloat(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="metric-card-2 rounded-xl p-4 border flex items-center gap-3">
          <div className="metric-icon-2 rounded-lg flex items-center justify-center text-lg flex-shrink-0" style={{ width: 40, height: 40 }}>🟡</div>
          <div>
            <div className="metric-value-2 text-xl font-bold">{formatEur(totalAEncaisser + totalReprise)}</div>
            <div className="text-xs" style={{ color: '#9ca3af' }}>Total à encaisser</div>
          </div>
        </div>
        <div className="metric-card-1 rounded-xl p-4 border flex items-center gap-3">
          <div className="metric-icon-1 rounded-lg flex items-center justify-center text-lg flex-shrink-0" style={{ width: 40, height: 40 }}>📄</div>
          <div>
            <div className="metric-value-1 text-xl font-bold">{quittances.length}</div>
            <div className="text-xs" style={{ color: '#9ca3af' }}>Quittances ouvertes</div>
          </div>
        </div>
        <div className="metric-card-4 rounded-xl p-4 border flex items-center gap-3">
          <div className="metric-icon-4 rounded-lg flex items-center justify-center text-lg flex-shrink-0" style={{ width: 40, height: 40 }}>🔄</div>
          <div>
            <div className="metric-value-4 text-xl font-bold">{formatEur(totalReprise)}</div>
            <div className="text-xs" style={{ color: '#9ca3af' }}>Dont soldes reprise</div>
          </div>
        </div>
      </div>

      {/* Soldes de reprise */}
      {bailsAvecReprise.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: '#f0ede8', backgroundColor: '#faf9f7' }}>
            <h3 className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>🔄 Soldes de reprise</h3>
            <span className="text-xs" style={{ color: '#9ca3af' }}>Historique avant entrée dans le système</span>
          </div>
          <div className="divide-y" style={{ borderColor: '#f5f3f0' }}>
            {bailsAvecReprise.map((b: any) => {
              const locataire = b.locataire_type === 'entreprise'
                ? b.locataire_company_name || '—'
                : [b.locataire_first_name, b.locataire_last_name].filter(Boolean).join(' ') || '—'
              return (
                <div key={b.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <span className="text-sm font-medium" style={{ color: '#1a1a1a' }}>{locataire}</span>
                    <span className="ml-2 text-xs" style={{ color: '#978A47' }}>{b.code}</span>
                    <span className="ml-2 text-xs" style={{ color: '#9ca3af' }}>{b.lot_code} · {b.immeuble_code}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold" style={{ color: '#dc2626' }}>{formatEur(b.solde_reprise)}</span>
                    <button
                      onClick={() => onEncaisser(b.id, parseFloat(b.solde_reprise))}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                      style={{ backgroundColor: '#978A47' }}>
                      Encaisser
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quittances ouvertes */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: '#f0ede8', backgroundColor: '#faf9f7' }}>
          <h3 className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>🟡 Quittances émises en attente</h3>
          <button onClick={onRefresh} className="text-xs" style={{ color: '#9ca3af' }}>↻ Actualiser</button>
        </div>

        {quittances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span style={{ fontSize: '36px' }}>✅</span>
            <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>Aucune quittance en attente</p>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Toutes les quittances émises ont été réglées.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#faf9f7', borderBottom: '1px solid #ede9e6' }}>
                  {['Locataire', 'Bail / Lot', 'Période', 'Type', 'Montant TTC', 'Échéance', ''].map(h => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide ${h === '' ? 'text-right' : 'text-left'}`}
                      style={{ color: '#9ca3af' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(byBail).map(([bailId, rows]: [string, any[]]) => {
                  const first = rows[0]
                  const bailTotal = rows.reduce((s, r) => s + parseFloat(r.total_ttc || 0), 0)
                  const locataire = first.locataire_type === 'entreprise'
                    ? first.locataire_company || '—'
                    : [first.locataire_first_name, first.locataire_last_name].filter(Boolean).join(' ') || '—'
                  return (
                    <>
                      {rows.map((q: any, idx: number) => {
                        const d = new Date(q.period_start)
                        const isLate = q.due_date && new Date(q.due_date) < new Date()
                        return (
                          <tr key={q.id} className="border-b" style={{ borderColor: '#f5f3f0' }}>
                            <td className="px-4 py-3" style={{ color: '#374151' }}>
                              {idx === 0 ? locataire : ''}
                            </td>
                            <td className="px-4 py-3">
                              {idx === 0 && (
                                <span className="text-xs font-medium" style={{ color: '#978A47' }}>
                                  {first.bail_code} · {first.lot_name || first.lot_code}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm" style={{ color: '#6b7280' }}>
                              {MOIS_FR[d.getMonth() + 1]} {d.getFullYear()}
                            </td>
                            <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>
                              {TYPE_LABELS[q.type_document] || q.type_document}
                            </td>
                            <td className="px-4 py-3 font-semibold" style={{ color: '#1a1a1a' }}>
                              {formatEur(q.total_ttc)}
                            </td>
                            <td className="px-4 py-3 text-xs whitespace-nowrap"
                              style={{ color: isLate ? '#dc2626' : '#6b7280' }}>
                              {q.due_date ? new Date(q.due_date).toLocaleDateString('fr-FR') : '—'}
                              {isLate && <span className="ml-1">⚠️</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {idx === rows.length - 1 && (
                                <button
                                  onClick={() => onEncaisser(parseInt(bailId), bailTotal)}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white whitespace-nowrap"
                                  style={{ backgroundColor: '#978A47' }}>
                                  Encaisser ({formatEur(bailTotal)})
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function Encaissements() {
  const [activeTab, setActiveTab] = useState<Tab>('liste')
  const [editingItem, setEditingItem] = useState<any>(null)
  const [prefillBailId, setPrefillBailId] = useState<number | null>(null)
  const [prefillAmount, setPrefillAmount] = useState<number | null>(null)

  // CSV import state
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [unmatchedAssign, setUnmatchedAssign] = useState<Record<number, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const queryClient = useQueryClient()

  // FEC export state
  const [fecAnnee, setFecAnnee] = useState<number>(new Date().getFullYear())
  const [fecSciId, setFecSciId] = useState<string>('')
  const [fecLoading, setFecLoading] = useState(false)

  const { data: sciList = [] } = useQuery({
    queryKey: ['sci-list'],
    queryFn: () => sciAPI.getAll().then(r => r.data),
  })

  const handleFecExport = async () => {
    setFecLoading(true)
    try {
      await exportAPI.fec(fecAnnee, fecSciId ? Number(fecSciId) : undefined)
      toast.success(`FEC ${fecAnnee} exporté`)
    } catch {
      toast.error('Erreur lors de l\'export FEC')
    } finally {
      setFecLoading(false)
    }
  }

  const { data: encaissements = [], isLoading } = useQuery({
    queryKey: ['encaissements'],
    queryFn: async () => {
      const res = await encaissementsAPI.getAll()
      return res.data
    }
  })

  const { data: bauxList = [] } = useQuery({
    queryKey: ['baux-actifs'],
    queryFn: async () => {
      const res = await bauxAPI.getAll()
      return res.data.filter((b: any) => b.status === 'actif')
    }
  })

  // Quittances ouvertes (status='emis') pour le tab "À encaisser"
  const { data: quittancesOuvertes = [], isLoading: loadingQuittancesOuvertes, refetch: refetchQuittancesOuvertes } = useQuery({
    queryKey: ['quittances-ouvertes'],
    queryFn: async () => {
      const res = await quittancesAPI.getAll({ status: 'emis' })
      return res.data
    }
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['encaissements'] })
    queryClient.invalidateQueries({ queryKey: ['quittances-ouvertes'] })
  }

  const handleCreate = async (data: any) => {
    await encaissementsAPI.create(data)
    toast.success('Encaissement enregistré')
    refresh()
    setPrefillBailId(null); setPrefillAmount(null)
    setActiveTab('liste')
  }

  const handleEdit = (item: any) => { setEditingItem(item); setActiveTab('saisie') }
  const handleUpdate = async (data: any) => {
    await encaissementsAPI.update(editingItem.id, data)
    toast.success('Encaissement mis à jour')
    setEditingItem(null); refresh(); setActiveTab('liste')
  }
  const cancelForm = () => { setEditingItem(null); setPrefillBailId(null); setPrefillAmount(null); setActiveTab('liste') }

  // Depuis "À encaisser" : pré-remplir saisie avec bail + montant
  const handleEncaisserQuittance = (bailId: number, montant: number) => {
    setEditingItem(null)
    setPrefillBailId(bailId)
    setPrefillAmount(montant)
    setActiveTab('saisie')
  }

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.csv')) { setCsvFile(file); setImportResult(null) }
    else toast.error('Veuillez déposer un fichier CSV')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) { setCsvFile(file); setImportResult(null) }
  }

  const handleImport = async () => {
    if (!csvFile) return
    setImporting(true)
    try {
      const res = await encaissementsAPI.importCSV(csvFile)
      const result: ImportResult = res.data
      setImportResult(result)
      if (result.imported > 0) { toast.success(`${result.imported} encaissement(s) importé(s)`); refresh() }
      if (result.skipped > 0) toast(`${result.skipped} doublon(s) ignoré(s)`, { icon: 'ℹ️' })
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur lors de l\'import')
    } finally { setImporting(false) }
  }

  const handleAssignUnmatched = async (rowIndex: number, bailId: string) => {
    const row = importResult?.unmatched.find(u => u.row_index === rowIndex)
    if (!row || !bailId) return
    try {
      await encaissementsAPI.create({
        bail_id: Number(bailId),
        payment_date: row.date || new Date().toISOString().split('T')[0],
        amount: row.montant,
        reference: row.reference,
        source: 'import_csv',
      })
      toast.success('Encaissement associé')
      refresh()
      setImportResult(prev => prev
        ? { ...prev, unmatched: prev.unmatched.filter(u => u.row_index !== rowIndex) }
        : null)
    } catch { toast.error('Erreur lors de l\'association') }
  }

  const getBailLabel = (b: any) => {
    const locataire = b.locataire_type === 'entreprise'
      ? b.locataire_company || b.locataire_last_name
      : [b.locataire_first_name, b.locataire_last_name].filter(Boolean).join(' ')
    return `${b.code} — ${locataire}`
  }

  const tabs: { id: Tab; label: string; labelMobile: string; emoji: string; badge?: number }[] = [
    { id: 'liste',        label: 'Liste',           labelMobile: 'Liste',       emoji: '📋' },
    { id: 'a-encaisser',  label: 'À encaisser',     labelMobile: 'À enc.',      emoji: '🟡', badge: quittancesOuvertes.length },
    { id: 'saisie',       label: 'Saisie manuelle', labelMobile: 'Saisie',      emoji: '✏️' },
    { id: 'import',       label: 'Import CSV',      labelMobile: 'Import',      emoji: '📥' },
    { id: 'pennylane',    label: 'Pennylane',       labelMobile: 'Pennylane',   emoji: '🏦' },
    { id: 'fec',          label: 'Export FEC',      labelMobile: 'FEC',         emoji: '📊' },
  ]

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>Encaissements</h1>
          <p className="text-sm mt-0.5" style={{ color: '#9ca3af' }}>
            Suivi des paiements reçus — {encaissements.length} entrée(s)
          </p>
        </div>
        <Protect minRole="editor">
          <button
            onClick={() => { setEditingItem(null); setActiveTab('saisie') }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: '#978A47' }}>
            <span>+</span> Nouveau paiement
          </button>
        </Protect>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6 overflow-x-auto" style={{ borderColor: '#e2e8f0' }}>
        <nav className="flex gap-0 min-w-max">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
              style={{
                borderColor:     activeTab === tab.id ? '#978A47' : 'transparent',
                color:           activeTab === tab.id ? '#978A47' : '#9ca3af',
                backgroundColor: 'transparent',
              }}>
              <span className="sm:hidden">{tab.emoji} {tab.labelMobile}</span>
              <span className="hidden sm:inline">{tab.emoji} {tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ backgroundColor: activeTab === tab.id ? '#F5F0DC' : '#fef3c7', color: activeTab === tab.id ? '#978A47' : '#92400e', fontSize: '10px' }}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: À encaisser */}
      {activeTab === 'a-encaisser' && (
        <AEncaisserTab
          quittances={quittancesOuvertes}
          bauxList={bauxList}
          loading={loadingQuittancesOuvertes}
          onEncaisser={handleEncaisserQuittance}
          onRefresh={refetchQuittancesOuvertes}
        />
      )}

      {/* Tab: Liste */}
      {activeTab === 'liste' && (
        <div className="bg-white rounded-xl border" style={{ borderColor: '#e2e8f0' }}>
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-2"
                style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
            </div>
          ) : (
            <EncaissementList list={encaissements} onEdit={handleEdit} onRefresh={refresh} />
          )}
        </div>
      )}

      {/* Tab: Saisie manuelle */}
      {activeTab === 'saisie' && (
        <div className="bg-white rounded-xl border p-6 max-w-xl" style={{ borderColor: '#e2e8f0' }}>
          <h2 className="text-base font-semibold mb-5" style={{ color: '#1a1a1a' }}>
            {editingItem ? 'Modifier l\'encaissement' : 'Nouvel encaissement'}
          </h2>
          {prefillBailId && !editingItem && (
            <div className="mb-4 px-3 py-2 rounded-lg text-xs font-medium"
              style={{ backgroundColor: '#F5F0DC', color: '#78621e', border: '1px solid #E8DFC0' }}>
              🟡 Pré-rempli depuis "À encaisser" — bail pré-sélectionné
            </div>
          )}
          <EncaissementForm
            onSubmit={editingItem ? handleUpdate : handleCreate}
            onCancel={cancelForm}
            initialData={editingItem || (prefillBailId ? { bail_id: prefillBailId, amount: prefillAmount } : null)}
            isEdit={!!editingItem}
          />
        </div>
      )}

      {/* Tab: Import CSV */}
      {activeTab === 'import' && (
        <div className="space-y-6 max-w-2xl">
          <div className="rounded-xl border p-4" style={{ backgroundColor: '#F5F0DC', borderColor: '#E8DFC0' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: '#978A47' }}>
              💡 Import CSV flexible (export banque, Pennylane, etc.)
            </p>
            <p className="text-xs leading-relaxed" style={{ color: '#6b7280' }}>
              L'import détecte automatiquement les colonnes date, montant, libellé et locataire.
              Les lignes non-associées à un bail apparaîtront en bas pour traitement manuel.
            </p>
          </div>
          <div
            className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors"
            style={{ borderColor: csvFile ? '#978A47' : '#e2e8f0', backgroundColor: csvFile ? '#F5F0DC' : '#fafafa' }}
            onDragOver={e => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}>
            <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
            <div className="text-4xl mb-3">{csvFile ? '📄' : '📥'}</div>
            {csvFile ? (
              <>
                <p className="text-sm font-semibold" style={{ color: '#978A47' }}>{csvFile.name}</p>
                <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                  {(csvFile.size / 1024).toFixed(1)} Ko — Cliquer pour changer
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium" style={{ color: '#6b7280' }}>Glissez-déposez votre fichier CSV ici</p>
                <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>ou cliquez pour parcourir</p>
              </>
            )}
          </div>
          {csvFile && !importResult && (
            <button onClick={handleImport} disabled={importing}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#978A47' }}>
              {importing ? 'Import en cours…' : 'Importer le fichier'}
            </button>
          )}
          {importResult && (
            <div className="rounded-xl border p-4 space-y-1" style={{ borderColor: '#e2e8f0' }}>
              <p className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>Résultat de l'import</p>
              <div className="flex gap-4 mt-2 flex-wrap">
                <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>
                  ✅ {importResult.imported} importé(s)
                </span>
                {importResult.skipped > 0 && (
                  <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ backgroundColor: '#fef9c3', color: '#a16207' }}>
                    ⏭ {importResult.skipped} doublon(s)
                  </span>
                )}
                {importResult.unmatched_count > 0 && (
                  <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>
                    ⚠️ {importResult.unmatched_count} non-associé(s)
                  </span>
                )}
              </div>
            </div>
          )}
          {importResult && importResult.unmatched.length > 0 && (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: '#e2e8f0', backgroundColor: '#faf9f7' }}>
                <p className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>Lignes non associées</p>
              </div>
              <div className="divide-y" style={{ borderColor: '#f5f3f0' }}>
                {importResult.unmatched.map(row => (
                  <div key={row.row_index} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: '#1a1a1a' }}>
                        {row.reference || '(pas de libellé)'}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                        {row.date} · {row.montant != null
                          ? row.montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
                          : '—'}
                        {row.locataire_hint ? ` · ${row.locataire_hint}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={unmatchedAssign[row.row_index] || ''}
                        onChange={e => setUnmatchedAssign(prev => ({ ...prev, [row.row_index]: e.target.value }))}
                        className="text-xs border rounded-lg px-2 py-1.5"
                        style={{ borderColor: '#e2e8f0', color: '#1a1a1a', minWidth: '180px' }}>
                        <option value="">— Choisir un bail —</option>
                        {bauxList.map((b: any) => (
                          <option key={b.id} value={b.id}>{getBailLabel(b)}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAssignUnmatched(row.row_index, unmatchedAssign[row.row_index])}
                        disabled={!unmatchedAssign[row.row_index]}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium text-white disabled:opacity-40"
                        style={{ backgroundColor: '#978A47' }}>
                        Associer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {importResult && (
            <button onClick={() => { setCsvFile(null); setImportResult(null); setUnmatchedAssign({}) }}
              className="text-sm font-medium" style={{ color: '#978A47' }}>
              ← Importer un autre fichier
            </button>
          )}
        </div>
      )}

      {/* Tab: Pennylane */}
      {activeTab === 'pennylane' && (
        <PennylaneTab onImported={refresh} />
      )}

      {/* Tab: Export FEC */}
      {activeTab === 'fec' && (
        <div className="space-y-6 max-w-lg">
          <div className="rounded-xl border p-4" style={{ backgroundColor: '#F5F0DC', borderColor: '#E8DFC0' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: '#978A47' }}>
              📊 Fichier d'Écritures Comptables (FEC)
            </p>
            <p className="text-xs leading-relaxed" style={{ color: '#6b7280' }}>
              Export au format FEC conforme à l'article A47 A-1 du Livre des Procédures Fiscales.
              Génère 2 écritures par encaissement : débit banque (512000) et crédit loyers (706100).
            </p>
          </div>

          <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: '#e2e8f0' }}>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
                Année fiscale
              </label>
              <select
                value={fecAnnee}
                onChange={e => setFecAnnee(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
                style={{ borderColor: '#e2e8f0', color: '#1a1a1a' }}>
                {[2023, 2024, 2025, 2026].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
                Société (SCI) — optionnel
              </label>
              <select
                value={fecSciId}
                onChange={e => setFecSciId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400"
                style={{ borderColor: '#e2e8f0', color: '#1a1a1a' }}>
                <option value="">— Toutes les sociétés —</option>
                {sciList.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                Laissez vide pour exporter toutes les SCI dans un seul fichier.
              </p>
            </div>

            <button
              onClick={handleFecExport}
              disabled={fecLoading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ backgroundColor: '#978A47' }}>
              {fecLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Génération en cours…
                </>
              ) : (
                <>📥 Télécharger FEC {fecAnnee}{fecSciId ? ` — ${sciList.find((s: any) => s.id === Number(fecSciId))?.name || ''}` : ''}</>
              )}
            </button>
          </div>

          <div className="rounded-xl border p-4" style={{ borderColor: '#e2e8f0', backgroundColor: '#fafafa' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: '#374151' }}>📋 Structure du fichier généré</p>
            <div className="space-y-1.5">
              {[
                { compte: '512000', lib: 'Banque — débit du paiement reçu' },
                { compte: '706100', lib: 'Produits des loyers — crédit' },
              ].map(row => (
                <div key={row.compte} className="flex items-center gap-3 text-xs" style={{ color: '#6b7280' }}>
                  <span className="font-mono font-bold px-2 py-0.5 rounded" style={{ backgroundColor: '#F5F0DC', color: '#978A47' }}>
                    {row.compte}
                  </span>
                  <span>{row.lib}</span>
                </div>
              ))}
            </div>
            <p className="text-xs mt-3" style={{ color: '#9ca3af' }}>
              Format : texte tabulé (TAB) · Encodage : UTF-8 avec BOM · Compatible FEC Validator
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
