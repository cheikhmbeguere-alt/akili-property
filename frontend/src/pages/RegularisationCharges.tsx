import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { chargesReellesAPI, immeublesAPI, pennylaneAPI } from '../services/api'
import { useSci } from '../context/SciContext'
import { useRole } from '../hooks/useRole'

// ─── Types & constantes ───────────────────────────────────────────────────────

const TYPES_CHARGE = [
  { value: 'eau',           label: '💧 Eau' },
  { value: 'electricite',   label: '⚡ Électricité' },
  { value: 'chauffage',     label: '🔥 Chauffage' },
  { value: 'gaz',           label: '🏭 Gaz' },
  { value: 'gardiennage',   label: '👮 Gardiennage' },
  { value: 'entretien',     label: '🔧 Entretien / Nettoyage' },
  { value: 'travaux',       label: '🏗️ Travaux' },
  { value: 'assurance',     label: '🛡️ Assurance' },
  { value: 'taxe_fonciere', label: '📋 Taxe foncière' },
  { value: 'autre',         label: '📦 Autre' },
]

const MOIS_FR = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun',
                 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

const currentYear = new Date().getFullYear()

type Tab = 'saisie' | 'pennylane' | 'regularisation'

const fmt = (n: number) =>
  (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

// ─── Formulaire de saisie ─────────────────────────────────────────────────────

const emptyForm = {
  sci_id: '', immeuble_id: '', lot_id: '', bail_id: '',
  periode_annee: currentYear, periode_mois: '',
  type_charge: 'autre', libelle: '',
  montant_ht: '', tva_taux: '0', montant_ttc: '',
  date_facture: '', reference: '', notes: '',
}

function SaisieTab({
  immeubles, refetch, canEdit,
}: {
  immeubles: any[], refetch: () => void, canEdit: boolean,
}) {
  const { selectedSciId } = useSci()
  const [form, setForm] = useState<any>({ ...emptyForm, sci_id: selectedSciId ?? '' })
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const { canDelete } = useRole()

  const { data: allCharges = [], isLoading } = useQuery({
    queryKey: ['charges-reelles', selectedSciId],
    queryFn: async () => (await chargesReellesAPI.getAll(selectedSciId ? { sci_id: selectedSciId } : {})).data,
  })

  const { data: lotsData = [] } = useQuery({
    queryKey: ['lots-for-imm', form.immeuble_id],
    queryFn: async () => {
      if (!form.immeuble_id) return []
      const res = await fetch(`/api/lots/immeuble/${form.immeuble_id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      })
      return res.json()
    },
    enabled: !!form.immeuble_id,
  })

  const set = (k: string, v: any) => {
    setForm((prev: any) => {
      const next = { ...prev, [k]: v }
      // Auto-calc TTC
      if (k === 'montant_ht' || k === 'tva_taux') {
        const ht  = parseFloat(k === 'montant_ht'  ? v : next.montant_ht)  || 0
        const tva = parseFloat(k === 'tva_taux' ? v : next.tva_taux) || 0
        next.montant_ttc = (ht * (1 + tva / 100)).toFixed(2)
      }
      if (k === 'montant_ttc') {
        const ttc = parseFloat(v) || 0
        const tva = parseFloat(next.tva_taux) || 0
        next.montant_ht = tva > 0 ? (ttc / (1 + tva / 100)).toFixed(2) : ttc.toFixed(2)
      }
      // Reset lot si changement immeuble
      if (k === 'immeuble_id') { next.lot_id = ''; next.bail_id = '' }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.libelle || !form.montant_ttc) {
      toast.error('Libellé et montant requis')
      return
    }
    setLoading(true)
    try {
      const payload = {
        ...form,
        sci_id:       form.sci_id       ? Number(form.sci_id)       : null,
        immeuble_id:  form.immeuble_id  ? Number(form.immeuble_id)  : null,
        lot_id:       form.lot_id       ? Number(form.lot_id)       : null,
        bail_id:      form.bail_id      ? Number(form.bail_id)      : null,
        periode_mois: form.periode_mois ? Number(form.periode_mois) : null,
        tva_taux:     Number(form.tva_taux),
        montant_ht:   Number(form.montant_ht) || 0,
        montant_ttc:  Number(form.montant_ttc),
      }
      if (editingId) {
        await chargesReellesAPI.update(editingId, payload)
        toast.success('Charge mise à jour')
        setEditingId(null)
      } else {
        await chargesReellesAPI.create(payload)
        toast.success('Charge enregistrée')
      }
      setForm({ ...emptyForm, sci_id: selectedSciId ?? '' })
      refetch()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await chargesReellesAPI.delete(id)
      toast.success('Charge supprimée')
      refetch()
    } catch {
      toast.error('Erreur suppression')
    }
  }

  const handleEdit = (c: any) => {
    setEditingId(c.id)
    setForm({
      sci_id: c.sci_id ?? '', immeuble_id: c.immeuble_id ?? '', lot_id: c.lot_id ?? '',
      bail_id: c.bail_id ?? '',
      periode_annee: c.periode_annee, periode_mois: c.periode_mois ?? '',
      type_charge: c.type_charge, libelle: c.libelle,
      montant_ht: c.montant_ht, tva_taux: c.tva_taux, montant_ttc: c.montant_ttc,
      date_facture: c.date_facture ? c.date_facture.substring(0, 10) : '',
      reference: c.reference ?? '', notes: c.notes ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400 transition-colors'
  const labelCls = 'block text-xs font-semibold mb-1'

  return (
    <div className="space-y-6">
      {/* Formulaire */}
      {canEdit && (
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#e2e8f0' }}>
          <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a1a' }}>
            {editingId ? '✏️ Modifier la charge' : '+ Nouvelle charge réelle'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Ligne 1 : périmètre */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls} style={{ color: '#374151' }}>Immeuble</label>
                <select value={form.immeuble_id} onChange={e => set('immeuble_id', e.target.value)}
                  className={inputCls} style={{ borderColor: '#e2e8f0', backgroundColor: '#fff' }}>
                  <option value="">— Tous immeubles —</option>
                  {immeubles.map((im: any) => (
                    <option key={im.id} value={im.id}>{im.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} style={{ color: '#374151' }}>Lot <span style={{ color: '#9ca3af' }}>(optionnel)</span></label>
                <select value={form.lot_id} onChange={e => set('lot_id', e.target.value)}
                  disabled={!form.immeuble_id}
                  className={inputCls} style={{ borderColor: '#e2e8f0', backgroundColor: '#fff' }}>
                  <option value="">— Tous lots —</option>
                  {lotsData.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.code} {l.name ? `— ${l.name}` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} style={{ color: '#374151' }}>Type de charge</label>
                <select value={form.type_charge} onChange={e => set('type_charge', e.target.value)}
                  className={inputCls} style={{ borderColor: '#e2e8f0', backgroundColor: '#fff' }}>
                  {TYPES_CHARGE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            {/* Ligne 2 : libellé */}
            <div>
              <label className={labelCls} style={{ color: '#374151' }}>Libellé *</label>
              <input required value={form.libelle} onChange={e => set('libelle', e.target.value)}
                className={inputCls} style={{ borderColor: '#e2e8f0' }}
                placeholder="Ex: Facture EDF janv. 2025 — Imm. Clairoix" />
            </div>

            {/* Ligne 3 : montants */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={labelCls} style={{ color: '#374151' }}>Montant HT (€)</label>
                <input type="number" step="0.01" min="0" value={form.montant_ht}
                  onChange={e => set('montant_ht', e.target.value)}
                  className={inputCls} style={{ borderColor: '#e2e8f0' }} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls} style={{ color: '#374151' }}>TVA (%)</label>
                <select value={form.tva_taux} onChange={e => set('tva_taux', e.target.value)}
                  className={inputCls} style={{ borderColor: '#e2e8f0', backgroundColor: '#fff' }}>
                  <option value="0">0 %</option>
                  <option value="5.5">5,5 %</option>
                  <option value="10">10 %</option>
                  <option value="20">20 %</option>
                </select>
              </div>
              <div>
                <label className={labelCls} style={{ color: '#374151' }}>Montant TTC (€) *</label>
                <input required type="number" step="0.01" min="0" value={form.montant_ttc}
                  onChange={e => set('montant_ttc', e.target.value)}
                  className={inputCls} style={{ borderColor: '#e2e8f0' }} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls} style={{ color: '#374151' }}>Date facture</label>
                <input type="date" value={form.date_facture}
                  onChange={e => set('date_facture', e.target.value)}
                  className={inputCls} style={{ borderColor: '#e2e8f0' }} />
              </div>
            </div>

            {/* Ligne 4 : période + référence */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={labelCls} style={{ color: '#374151' }}>Année *</label>
                <input required type="number" min="2020" max="2099" value={form.periode_annee}
                  onChange={e => set('periode_annee', e.target.value)}
                  className={inputCls} style={{ borderColor: '#e2e8f0' }} />
              </div>
              <div>
                <label className={labelCls} style={{ color: '#374151' }}>Mois <span style={{ color: '#9ca3af' }}>(optionnel)</span></label>
                <select value={form.periode_mois} onChange={e => set('periode_mois', e.target.value)}
                  className={inputCls} style={{ borderColor: '#e2e8f0', backgroundColor: '#fff' }}>
                  <option value="">— Annuel —</option>
                  {MOIS_FR.slice(1).map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls} style={{ color: '#374151' }}>Référence facture</label>
                <input value={form.reference} onChange={e => set('reference', e.target.value)}
                  className={inputCls} style={{ borderColor: '#e2e8f0' }} placeholder="FACT-2025-001" />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              {editingId && (
                <button type="button" onClick={() => { setEditingId(null); setForm({ ...emptyForm, sci_id: selectedSciId ?? '' }) }}
                  className="px-4 py-2 text-sm font-medium rounded-lg border"
                  style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>
                  Annuler
                </button>
              )}
              <button type="submit" disabled={loading}
                className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
                style={{ backgroundColor: '#978A47' }}>
                {loading ? '…' : editingId ? 'Mettre à jour' : '+ Enregistrer la charge'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: '#e2e8f0', backgroundColor: '#faf9f7' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#9ca3af' }}>
            Charges enregistrées — {allCharges.length} entrée(s)
          </p>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-t-transparent" style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
          </div>
        ) : allCharges.length === 0 ? (
          <div className="py-14 text-center">
            <p style={{ fontSize: '36px' }}>🧾</p>
            <p className="text-sm mt-2" style={{ color: '#9ca3af' }}>Aucune charge enregistrée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#faf9f7', borderBottom: '1px solid #ede9e6' }}>
                  {['Année', 'Immeuble / Lot', 'Type', 'Libellé', 'Montant HT', 'TTC', 'Source', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: '#9ca3af' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allCharges.map((c: any) => (
                  <tr key={c.id} className="border-b" style={{ borderColor: '#f5f3f0' }}>
                    <td className="px-4 py-3 text-xs font-semibold" style={{ color: '#1a1a1a' }}>
                      {c.periode_annee}{c.periode_mois ? ` / ${MOIS_FR[c.periode_mois]}` : ''}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#374151' }}>
                      <p className="font-medium">{c.immeuble_name ?? '—'}</p>
                      {c.lot_code && <p style={{ color: '#9ca3af' }}>{c.lot_code}{c.lot_name ? ` ${c.lot_name}` : ''}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: '#F5F0DC', color: '#978A47' }}>
                        {TYPES_CHARGE.find(t => t.value === c.type_charge)?.label ?? c.type_charge}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#374151' }}>
                      <p>{c.libelle}</p>
                      {c.reference && <p style={{ color: '#9ca3af' }}>{c.reference}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-right font-medium" style={{ color: '#374151' }}>
                      {fmt(parseFloat(c.montant_ht))}
                    </td>
                    <td className="px-4 py-3 text-xs text-right font-semibold" style={{ color: '#1a1a1a' }}>
                      {fmt(parseFloat(c.montant_ttc))}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: c.source === 'pennylane' ? '#ede9fe' : '#f0fdf4',
                          color: c.source === 'pennylane' ? '#7c3aed' : '#16a34a',
                        }}>
                        {c.source === 'pennylane' ? '🏦 Pennylane' : '✏️ Manuel'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {canEdit && (
                          <button onClick={() => handleEdit(c)}
                            className="text-xs font-medium" style={{ color: '#978A47' }}>
                            Modifier
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDelete(c.id)}
                            className="text-xs font-medium" style={{ color: '#ef4444' }}>
                            Supprimer
                          </button>
                        )}
                      </div>
                    </td>
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

// ─── Onglet Pennylane ─────────────────────────────────────────────────────────

function PennylaneTab({ immeubles, refetch }: { immeubles: any[], refetch: () => void }) {
  const { sciList, selectedSciId } = useSci()
  const [sciId, setSciId]           = useState<number | ''>(selectedSciId ?? '')
  const [token, setToken]           = useState('')
  const [tokenStatus, setTokenStatus] = useState<any>(null)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [transactions, setTransactions] = useState<any[]>([])
  const [txLoading, setTxLoading]   = useState(false)
  const [cursor, setCursor]         = useState<string | null>(null)
  const [hasMore, setHasMore]       = useState(false)
  const [matchOverrides, setMatchOverrides] = useState<Record<string, { immeuble_id: string; type_charge: string }>>({})
  const [importing, setImporting]   = useState(false)
  const [periodeAnnee, setPeriodeAnnee] = useState(currentYear)

  const checkStatus = async (id: number) => {
    try {
      const res = await pennylaneAPI.getStatus(id)
      setTokenStatus(res.data)
    } catch {
      setTokenStatus(null)
    }
  }

  const handleSciChange = (id: number | '') => {
    setSciId(id)
    setTransactions([])
    setCursor(null)
    setTokenStatus(null)
    if (id) checkStatus(id as number)
  }

  const handleSaveToken = async () => {
    if (!sciId || !token.trim()) return
    setTokenLoading(true)
    try {
      await pennylaneAPI.saveToken(sciId as number, token)
      await checkStatus(sciId as number)
      setToken('')
      toast.success('Token Pennylane enregistré')
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Token invalide')
    } finally {
      setTokenLoading(false)
    }
  }

  const handleDeleteToken = async () => {
    if (!sciId) return
    try {
      await pennylaneAPI.deleteToken(sciId as number)
      setTokenStatus(null)
      setTransactions([])
      toast.success('Token supprimé')
    } catch {
      toast.error('Erreur')
    }
  }

  const fetchTransactions = async (nextCursor?: string | null) => {
    if (!sciId) return
    setTxLoading(true)
    try {
      // On réutilise l'API Pennylane mais pour les dépenses (Pennylane filtre côté serveur)
      const res = await pennylaneAPI.getTransactions(sciId as number, {
        cursor: nextCursor ?? undefined,
        type: 'expense',  // filtre côté backend si supporté
      })
      const data = res.data
      const newTxs = (data.transactions ?? []).map((tx: any) => ({
        ...tx,
        // Exclure les transactions déjà importées comme encaissements
        already_imported_charge: false,
      }))
      setTransactions(prev => nextCursor ? [...prev, ...newTxs] : newTxs)
      setHasMore(data.meta?.has_more ?? false)
      setCursor(data.meta?.next_cursor ?? null)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur chargement transactions')
    } finally {
      setTxLoading(false)
    }
  }

  const handleImportBatch = async () => {
    const toImport = transactions.filter(tx => !tx.already_imported)
    if (!toImport.length) { toast.error('Aucune transaction à importer'); return }
    setImporting(true)
    try {
      const items = toImport.map(tx => {
        const override = matchOverrides[tx.id] ?? {}
        return {
          sci_id:       sciId,
          immeuble_id:  override.immeuble_id ? Number(override.immeuble_id) : (tx.suggested_immeuble_id ?? null),
          type_charge:  override.type_charge || 'autre',
          libelle:      tx.label || tx.thirdparty,
          montant_ht:   Math.abs(tx.amount),
          tva_taux:     tx.vat_rate ?? 0,
          montant_ttc:  Math.abs(tx.amount_with_tax ?? tx.amount),
          date_facture: tx.date,
          reference:    tx.reference ?? null,
          periode_annee: periodeAnnee,
          pennylane_id: tx.id,
        }
      })
      const res = await chargesReellesAPI.importBatch(items)
      toast.success(`${res.data.imported} charge(s) importée(s)`)
      refetch()
      setTransactions([])
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur import')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Sélection SCI + token */}
      <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#e2e8f0' }}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#9ca3af' }}>
          Connexion Pennylane
        </p>
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>SCI</label>
            <select value={sciId} onChange={e => handleSciChange(e.target.value ? Number(e.target.value) : '')}
              className="border rounded-lg px-3 py-2 text-sm outline-none"
              style={{ borderColor: '#e2e8f0', minWidth: '180px', backgroundColor: '#fff' }}>
              <option value="">— Choisir une SCI —</option>
              {sciList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {sciId && !tokenStatus?.configured && (
            <>
              <div className="flex-1" style={{ minWidth: '200px' }}>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Token API Pennylane</label>
                <input type="password" value={token} onChange={e => setToken(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ borderColor: '#e2e8f0' }} placeholder="eyJ…" />
              </div>
              <button onClick={handleSaveToken} disabled={tokenLoading || !token.trim()}
                className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
                style={{ backgroundColor: '#1a1a1a' }}>
                {tokenLoading ? '…' : 'Enregistrer'}
              </button>
            </>
          )}
          {tokenStatus?.configured && (
            <div className="flex items-center gap-3">
              <span className="text-xs px-3 py-1.5 rounded-full font-semibold"
                style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>
                ✅ Connecté — {tokenStatus.sci_name}
              </span>
              <button onClick={handleDeleteToken}
                className="text-xs font-medium" style={{ color: '#ef4444' }}>
                Déconnecter
              </button>
            </div>
          )}
        </div>

        {tokenStatus?.configured && (
          <div className="flex items-center gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Année à imputer</label>
              <input type="number" min="2020" max="2099" value={periodeAnnee}
                onChange={e => setPeriodeAnnee(Number(e.target.value))}
                className="border rounded-lg px-3 py-2 text-sm outline-none w-24"
                style={{ borderColor: '#e2e8f0' }} />
            </div>
            <div className="mt-5">
              <button onClick={() => fetchTransactions()} disabled={txLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
                style={{ backgroundColor: '#978A47' }}>
                {txLoading ? '⏳ Chargement…' : '🏦 Charger les dépenses Pennylane'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transactions */}
      {transactions.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: '#e2e8f0', backgroundColor: '#faf9f7' }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#9ca3af' }}>
              {transactions.length} transaction(s) — sélectionnez les immeubles à associer
            </p>
            <button onClick={handleImportBatch} disabled={importing}
              className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: '#1a1a1a' }}>
              {importing ? '⏳ Import…' : `📥 Importer tout (${transactions.filter(t => !t.already_imported).length})`}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#faf9f7', borderBottom: '1px solid #ede9e6' }}>
                  {['Date', 'Tiers / Libellé', 'Montant', 'Immeuble', 'Type', 'Statut'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: '#9ca3af' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map(tx => {
                  const override = matchOverrides[tx.id] ?? {}
                  return (
                    <tr key={tx.id} className="border-b" style={{ borderColor: '#f5f3f0', opacity: tx.already_imported ? 0.4 : 1 }}>
                      <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>
                        {tx.date ? new Date(tx.date).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <p className="font-semibold" style={{ color: '#1a1a1a' }}>{tx.thirdparty || '—'}</p>
                        <p style={{ color: '#9ca3af' }}>{tx.label}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-right" style={{ color: '#dc2626' }}>
                        {fmt(Math.abs(tx.amount))}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ minWidth: '160px' }}>
                        <select
                          value={override.immeuble_id ?? tx.suggested_immeuble_id ?? ''}
                          onChange={e => setMatchOverrides(prev => ({
                            ...prev,
                            [tx.id]: { ...prev[tx.id], immeuble_id: e.target.value },
                          }))}
                          disabled={tx.already_imported}
                          className="w-full border rounded px-2 py-1 text-xs outline-none"
                          style={{ borderColor: '#e2e8f0', backgroundColor: '#fff' }}>
                          <option value="">— Non imputé —</option>
                          {immeubles.map((im: any) => (
                            <option key={im.id} value={im.id}>{im.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ minWidth: '140px' }}>
                        <select
                          value={override.type_charge ?? 'autre'}
                          onChange={e => setMatchOverrides(prev => ({
                            ...prev,
                            [tx.id]: { ...prev[tx.id], type_charge: e.target.value },
                          }))}
                          disabled={tx.already_imported}
                          className="w-full border rounded px-2 py-1 text-xs outline-none"
                          style={{ borderColor: '#e2e8f0', backgroundColor: '#fff' }}>
                          {TYPES_CHARGE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {tx.already_imported ? (
                          <span className="px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: '#f1f5f9', color: '#94a3b8' }}>Déjà importé</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>À importer</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="p-4 text-center border-t" style={{ borderColor: '#f0f0f0' }}>
              <button onClick={() => fetchTransactions(cursor)} disabled={txLoading}
                className="text-sm font-medium" style={{ color: '#978A47' }}>
                {txLoading ? 'Chargement…' : 'Charger plus'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Onglet Régularisation ────────────────────────────────────────────────────

function RegularisationTab({ immeubles }: { immeubles: any[] }) {
  const [annee, setAnnee]             = useState(currentYear - 1)
  const [immeubleId, setImmeubleId]   = useState('')
  const [queried, setQueried]         = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['regularisation', annee, immeubleId],
    queryFn: async () => {
      const params: any = { annee }
      if (immeubleId) params.immeuble_id = immeubleId
      return (await chargesReellesAPI.getRegularisation(params)).data
    },
    enabled: queried,
    staleTime: 10_000,
  })

  const handleCalculer = () => {
    setQueried(true)
    if (queried) refetch()
  }

  const lignes = data?.lignes ?? []
  const kpis   = data?.kpis ?? {}

  // Grouper par immeuble
  const groups = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const l of lignes) {
      const k = l.immeuble_name
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(l)
    }
    return Array.from(map.entries()).map(([name, items]) => ({ name, items }))
  }, [lignes])

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#e2e8f0' }}>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Année de régularisation</label>
            <input type="number" min="2020" max="2099" value={annee}
              onChange={e => setAnnee(Number(e.target.value))}
              className="border rounded-lg px-3 py-2 text-sm outline-none w-24"
              style={{ borderColor: '#e2e8f0' }} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Immeuble</label>
            <select value={immeubleId} onChange={e => setImmeubleId(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm outline-none"
              style={{ borderColor: '#e2e8f0', minWidth: '180px', backgroundColor: '#fff' }}>
              <option value="">Tous les immeubles</option>
              {immeubles.map((im: any) => <option key={im.id} value={im.id}>{im.name}</option>)}
            </select>
          </div>
          <button onClick={handleCalculer} disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: '#0f172a' }}>
            {isLoading ? '⏳ Calcul…' : '⚖️ Calculer la régularisation'}
          </button>
        </div>

        {data && (
          <p className="text-xs mt-3" style={{ color: '#9ca3af' }}>
            Résultat basé sur les baux actifs en {annee} et les charges enregistrées pour cette année.
            Répartition des charges d'immeuble au <strong>prorata des surfaces</strong>.
          </p>
        )}
      </div>

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Provisions payées', value: fmt(kpis.total_provisions), color: '#2563eb', emoji: '💳' },
            { label: 'Charges réelles', value: fmt(kpis.total_charges), color: '#d97706', emoji: '🧾' },
            { label: 'Solde global', value: fmt(kpis.total_solde), color: kpis.total_solde > 0 ? '#dc2626' : '#16a34a', emoji: kpis.total_solde > 0 ? '⚠️' : '✅' },
            { label: 'À rembourser', value: `${kpis.nb_remboursements ?? 0} locataires`, color: '#16a34a', emoji: '💸' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border p-4" style={{ borderColor: '#e2e8f0', borderLeft: `4px solid ${k.color}` }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: k.color }}>{k.label}</p>
              <p className="text-lg font-bold" style={{ color: '#0f172a' }}>{k.value}</p>
              <p style={{ fontSize: '20px' }}>{k.emoji}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tableau par immeuble */}
      {queried && !isLoading && groups.length === 0 && (
        <div className="bg-white rounded-xl border p-12 text-center" style={{ borderColor: '#e2e8f0' }}>
          <p style={{ fontSize: '36px' }}>📋</p>
          <p className="text-sm mt-2" style={{ color: '#9ca3af' }}>Aucun bail actif trouvé pour {annee}</p>
        </div>
      )}

      {groups.map(group => {
        const totalProv   = group.items.reduce((s: number, l: any) => s + l.provisions, 0)
        const totalCharge = group.items.reduce((s: number, l: any) => s + l.charges_reelles, 0)
        const totalSolde  = group.items.reduce((s: number, l: any) => s + l.solde, 0)
        return (
          <div key={group.name} className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
            <div className="px-5 py-3 flex items-center gap-3"
              style={{ backgroundColor: '#EEF2FF', borderBottom: '2px solid #93c5fd' }}>
              <span style={{ fontSize: '16px' }}>🏢</span>
              <span className="font-bold text-sm" style={{ color: '#1e3a5f' }}>{group.name}</span>
              <span className="text-xs ml-auto font-semibold"
                style={{ color: totalSolde > 0.01 ? '#dc2626' : '#16a34a' }}>
                Solde : {totalSolde > 0.01 ? `+${fmt(totalSolde)}` : fmt(totalSolde)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    {['Lot', 'Locataire', 'Charges/mois', 'Mois actifs', 'Provisions', 'Charges réelles', 'Solde', 'Type'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-xs font-semibold text-right first:text-left"
                        style={{ color: '#64748b' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((l: any) => (
                    <tr key={l.bail_id} className="border-t"
                      style={{
                        borderColor: '#f1f5f9',
                        backgroundColor: l.type === 'complement' ? '#fff5f5' : l.type === 'remboursement' ? '#f0fdf4' : '#fff',
                      }}>
                      <td className="px-4 py-3 text-xs">
                        <p className="font-semibold" style={{ color: '#0f172a' }}>{l.lot_code}</p>
                        {l.lot_name && <p style={{ color: '#94a3b8' }}>{l.lot_name}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <p style={{ color: '#374151' }}>{l.locataire_nom}</p>
                        {l.locataire_email && <p style={{ color: '#94a3b8' }}>{l.locataire_email}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-right" style={{ color: '#374151' }}>{fmt(l.charges_ht_mensuel)}</td>
                      <td className="px-4 py-3 text-xs text-right" style={{ color: '#64748b' }}>{l.nb_mois} mois</td>
                      <td className="px-4 py-3 text-xs text-right font-semibold" style={{ color: '#2563eb' }}>{fmt(l.provisions)}</td>
                      <td className="px-4 py-3 text-xs text-right font-semibold" style={{ color: '#d97706' }}>{fmt(l.charges_reelles)}</td>
                      <td className="px-4 py-3 text-xs text-right font-bold"
                        style={{ color: l.solde > 0.01 ? '#dc2626' : l.solde < -0.01 ? '#16a34a' : '#6b7280' }}>
                        {l.solde > 0.01 ? `+${fmt(l.solde)}` : fmt(l.solde)}
                      </td>
                      <td className="px-4 py-3 text-xs text-center">
                        {l.type === 'complement' && (
                          <span className="px-2 py-0.5 rounded-full font-semibold"
                            style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>
                            ⬆️ Complément
                          </span>
                        )}
                        {l.type === 'remboursement' && (
                          <span className="px-2 py-0.5 rounded-full font-semibold"
                            style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>
                            ⬇️ Remboursement
                          </span>
                        )}
                        {l.type === 'equilibre' && (
                          <span className="px-2 py-0.5 rounded-full font-semibold"
                            style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}>
                            ⚖️ Équilibre
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                    <td colSpan={4} className="px-4 py-2.5 text-xs font-bold" style={{ color: '#374151' }}>
                      Sous-total {group.name}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-bold text-right" style={{ color: '#2563eb' }}>{fmt(totalProv)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-right" style={{ color: '#d97706' }}>{fmt(totalCharge)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-right"
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
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function RegularisationCharges() {
  const [tab, setTab] = useState<Tab>('saisie')
  const { canEdit }   = useRole()
  const queryClient   = useQueryClient()

  const { data: immeubles = [] } = useQuery({
    queryKey: ['immeubles'],
    queryFn: async () => (await immeublesAPI.getAll()).data,
  })

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['charges-reelles'] })
  }

  const TABS: { key: Tab; label: string; emoji: string }[] = [
    { key: 'saisie',         label: 'Saisie manuelle', emoji: '✏️' },
    { key: 'pennylane',      label: 'Import Pennylane', emoji: '🏦' },
    { key: 'regularisation', label: 'Régularisation',  emoji: '⚖️' },
  ]

  return (
    <div>
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f172a' }}>Régularisation de charges</h1>
          <p className="text-sm mt-1" style={{ color: '#64748b' }}>
            Saisie des charges réelles · Import Pennylane · Calcul du solde par locataire
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-white border rounded-xl p-1" style={{ borderColor: '#e2e8f0', width: 'fit-content' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: tab === t.key ? '#0f172a' : 'transparent',
              color: tab === t.key ? '#fff' : '#6b7280',
            }}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {tab === 'saisie'         && <SaisieTab immeubles={immeubles} refetch={refetch} canEdit={canEdit} />}
      {tab === 'pennylane'      && <PennylaneTab immeubles={immeubles} refetch={refetch} />}
      {tab === 'regularisation' && <RegularisationTab immeubles={immeubles} />}
    </div>
  )
}
