import { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { bauxAPI } from '../services/api'

type Step = 1 | 2 | 3
type RowAction = 'create' | 'overwrite' | 'ignore'

interface ImportRow {
  _row: number
  status: 'new' | 'conflict' | 'error'
  errors: string[]
  warnings: string[]
  action: RowAction
  nom: string
  prenom: string
  email: string
  lot_code: string
  immeuble_nom: string
  sci_nom: string
  loyer_ht: number | null
  start_date: string | null
  type_bail: string
  locataire_conflict: boolean
  bail_conflict: boolean
  [key: string]: any
}

interface Summary { total: number; new: number; conflicts: number; errors: number }

interface Props { onClose: () => void; onImported: () => void }

export default function ImportBaux({ onClose, onImported }: Props) {
  const [step, setStep]       = useState<Step>(1)
  const [rows, setRows]       = useState<ImportRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ─── Étape 1 : télécharger template ──────────────────────────────────────
  const handleDownload = async () => {
    const res = await bauxAPI.importTemplate()
    const url = URL.createObjectURL(new Blob([res.data]))
    const a   = document.createElement('a')
    a.href = url; a.download = 'template_import_baux.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Étape 1 → 2 : upload et preview ─────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const res = await bauxAPI.importPreview(file)
      setRows(res.data.rows)
      setSummary(res.data.summary)
      setStep(2)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur lecture fichier')
    } finally {
      setLoading(false)
    }
  }

  // ─── Changer action d'une ligne ───────────────────────────────────────────
  const setAction = (rowIdx: number, action: RowAction) => {
    setRows(r => r.map((row, i) => i === rowIdx ? { ...row, action } : row))
  }

  const setAllConflicts = (action: RowAction) => {
    setRows(r => r.map(row => row.status === 'conflict' ? { ...row, action } : row))
  }

  // ─── Étape 2 → 3 : confirmer import ──────────────────────────────────────
  const handleConfirm = async () => {
    setLoading(true)
    try {
      const res = await bauxAPI.importConfirm(rows)
      const { created, skipped, errors } = res.data
      if (errors?.length) {
        errors.forEach((e: string) => toast.error(e, { duration: 6000 }))
      }
      toast.success(`${created} bail(s) importé(s), ${skipped} ignoré(s)`)
      setStep(3)
      onImported()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur lors de l\'import')
    } finally {
      setLoading(false)
    }
  }

  const formatEur = (v: number | null) =>
    v != null ? (v * 12).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—'

  const actionToLabel: Record<RowAction, string> = {
    create:    '✅ Créer',
    overwrite: '♻️ Écraser',
    ignore:    '⏭ Ignorer',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full flex flex-col"
        style={{ maxWidth: step === 2 ? '900px' : '520px', maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#e2e8f0' }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1a1a' }}>Import Excel — Baux</h2>
            <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
              Étape {step} / 3 — {step === 1 ? 'Préparer le fichier' : step === 2 ? 'Vérifier & configurer' : 'Import terminé'}
            </p>
          </div>
          <button onClick={onClose} className="text-lg" style={{ color: '#9ca3af' }}>✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* ── Étape 1 ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="rounded-xl border p-4" style={{ borderColor: '#e2e8f0', backgroundColor: '#faf9f7' }}>
                <p className="text-sm font-semibold mb-2" style={{ color: '#1a1a1a' }}>1. Télécharger le template</p>
                <p className="text-xs mb-3" style={{ color: '#6b7280' }}>
                  Remplissez le fichier Excel avec vos données. Le loyer et les charges doivent être saisis en <strong>montants annuels HC</strong>.
                </p>
                <button onClick={handleDownload}
                  className="px-4 py-2 text-sm font-semibold rounded-lg border transition-colors"
                  style={{ borderColor: '#978A47', color: '#978A47' }}>
                  📥 Télécharger le template
                </button>
              </div>

              <div className="rounded-xl border p-4" style={{ borderColor: '#e2e8f0', backgroundColor: '#faf9f7' }}>
                <p className="text-sm font-semibold mb-2" style={{ color: '#1a1a1a' }}>2. Importer le fichier rempli</p>
                <p className="text-xs mb-3" style={{ color: '#6b7280' }}>
                  Format accepté : <code>.xlsx</code> — taille max 10 Mo
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: '#1a1a1a' }}>
                  {loading ? '⏳ Analyse en cours…' : '📤 Sélectionner le fichier'}
                </button>
              </div>
            </div>
          )}

          {/* ── Étape 2 ── */}
          {step === 2 && summary && (
            <div className="space-y-4">
              {/* Résumé */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Total lignes',  val: summary.total,     color: '#1a1a1a' },
                  { label: 'Nouvelles',     val: summary.new,       color: '#16a34a' },
                  { label: 'Conflits',      val: summary.conflicts, color: '#d97706' },
                  { label: 'Erreurs',       val: summary.errors,    color: '#dc2626' },
                ].map(k => (
                  <div key={k.label} className="rounded-lg border p-3 text-center" style={{ borderColor: '#e2e8f0' }}>
                    <p className="text-xl font-bold" style={{ color: k.color }}>{k.val}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{k.label}</p>
                  </div>
                ))}
              </div>

              {/* Actions globales conflits */}
              {summary.conflicts > 0 && (
                <div className="flex items-center gap-2 flex-wrap rounded-lg p-3"
                  style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
                  <span className="text-xs font-semibold" style={{ color: '#92400e' }}>
                    ⚠️ {summary.conflicts} conflit(s) — Action globale :
                  </span>
                  {(['overwrite', 'ignore'] as RowAction[]).map(a => (
                    <button key={a} onClick={() => setAllConflicts(a)}
                      className="px-3 py-1 text-xs font-semibold rounded-full border transition-colors"
                      style={{ borderColor: '#d97706', color: '#92400e' }}>
                      {actionToLabel[a]} tous
                    </button>
                  ))}
                </div>
              )}

              {/* Tableau */}
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ backgroundColor: '#faf9f7', borderBottom: '1px solid #ede9e6' }}>
                        {['#', 'Statut', 'Locataire', 'Lot', 'Immeuble', 'Loyer annuel', 'Début', 'Type', 'Action'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wide whitespace-nowrap"
                            style={{ color: '#9ca3af' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={row._row} className="border-b" style={{ borderColor: '#f5f3f0' }}>
                          <td className="px-3 py-2.5" style={{ color: '#9ca3af' }}>{row._row}</td>
                          <td className="px-3 py-2.5">
                            {row.status === 'new' && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#dcfce7', color: '#16a34a' }}>Nouveau</span>}
                            {row.status === 'conflict' && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>Conflit</span>}
                            {row.status === 'error' && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
                                title={row.errors.join(' | ')}>
                                Erreur
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-medium" style={{ color: '#1a1a1a' }}>
                            {row.prenom} {row.nom}
                            {row.warnings.length > 0 && (
                              <span className="ml-1 text-xs" style={{ color: '#d97706' }} title={row.warnings.join(' | ')}>⚠️</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5" style={{ color: '#978A47' }}>{row.lot_code}</td>
                          <td className="px-3 py-2.5" style={{ color: '#6b7280' }}>{row.immeuble_nom}</td>
                          <td className="px-3 py-2.5 font-medium" style={{ color: '#1a1a1a' }}>{formatEur(row.loyer_ht)}</td>
                          <td className="px-3 py-2.5" style={{ color: '#6b7280' }}>
                            {row.start_date ? new Date(row.start_date).toLocaleDateString('fr-FR') : '—'}
                          </td>
                          <td className="px-3 py-2.5 capitalize" style={{ color: '#6b7280' }}>{row.type_bail}</td>
                          <td className="px-3 py-2.5">
                            {row.status === 'error' ? (
                              <span className="text-xs" style={{ color: '#dc2626' }}>—</span>
                            ) : row.status === 'new' ? (
                              <span className="text-xs font-medium" style={{ color: '#16a34a' }}>✅ Créer</span>
                            ) : (
                              <select
                                value={row.action}
                                onChange={e => setAction(i, e.target.value as RowAction)}
                                className="border rounded px-2 py-1 text-xs outline-none"
                                style={{ borderColor: '#e2e8f0', color: '#1a1a1a' }}>
                                <option value="overwrite">♻️ Écraser</option>
                                <option value="ignore">⏭ Ignorer</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Étape 3 ── */}
          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <span style={{ fontSize: '48px' }}>✅</span>
              <p className="text-base font-bold" style={{ color: '#1a1a1a' }}>Import terminé</p>
              <p className="text-sm text-center" style={{ color: '#6b7280' }}>
                Les baux ont été importés avec succès.
              </p>
              <button onClick={onClose}
                className="px-6 py-2 text-sm font-semibold rounded-lg text-white mt-2"
                style={{ backgroundColor: '#1a1a1a' }}>
                Fermer
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 2 && (
          <div className="flex justify-between items-center px-6 py-4 border-t" style={{ borderColor: '#e2e8f0' }}>
            <button onClick={() => setStep(1)}
              className="px-4 py-2 text-sm font-medium rounded-lg border"
              style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>
              ← Retour
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || rows.filter(r => r.status !== 'error' && r.action === 'create').length === 0 &&
                rows.filter(r => r.status === 'conflict' && r.action === 'overwrite').length === 0}
              className="px-5 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-40"
              style={{ backgroundColor: '#978A47' }}>
              {loading ? '⏳ Import en cours…' : `Confirmer l'import (${rows.filter(r => r.status !== 'error' && r.action !== 'ignore').length} baux)`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
