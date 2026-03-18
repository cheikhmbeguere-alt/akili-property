import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../services/api'

type Preview = {
  sci:        any[]
  immeubles:  any[]
  lots:       any[]
  locataires: any[]
  baux:       any[]
}

type Counts = { sci: number; immeubles: number; lots: number; locataires: number; baux: number }

type Step = 'idle' | 'preview' | 'done'

const SECTIONS = [
  { key: 'sci',        label: 'SCI',        emoji: '🏛️', color: '#6366f1' },
  { key: 'immeubles',  label: 'Immeubles',  emoji: '🏢', color: '#0891b2' },
  { key: 'lots',       label: 'Lots',       emoji: '🚪', color: '#059669' },
  { key: 'locataires', label: 'Locataires', emoji: '👤', color: '#d97706' },
  { key: 'baux',       label: 'Baux',       emoji: '📄', color: '#dc2626' },
] as const

export default function ImportGlobal() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep]       = useState<Step>('idle')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [errors, setErrors]   = useState<string[]>([])
  const [counts, setCounts]   = useState<Counts | null>(null)
  const [results, setResults] = useState<any | null>(null)
  const [fileName, setFileName] = useState('')

  // ── Télécharger le template ──────────────────────────────────────────────────
  const downloadTemplate = async () => {
    try {
      const res = await api.get('/import/global/template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a   = document.createElement('a')
      a.href = url; a.download = 'template_import_global.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erreur téléchargement template')
    }
  }

  // ── Upload + Preview ─────────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setLoading(true)
    setErrors([])
    setPreview(null)
    setCounts(null)
    setStep('idle')

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post('/import/global/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setPreview(res.data.preview)
      setErrors(res.data.errors ?? [])
      setCounts(res.data.counts)
      setStep('preview')
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erreur lors de l\'analyse du fichier')
    } finally {
      setLoading(false)
    }
  }

  // ── Confirmer l'import ───────────────────────────────────────────────────────
  const confirmImport = async () => {
    if (!preview) return
    setLoading(true)
    try {
      const res = await api.post('/import/global/confirm', { preview })
      setResults(res.data.results)
      setStep('done')
      qc.invalidateQueries({ queryKey: ['sci'] })
      qc.invalidateQueries({ queryKey: ['immeubles'] })
      qc.invalidateQueries({ queryKey: ['lots'] })
      qc.invalidateQueries({ queryKey: ['locataires'] })
      qc.invalidateQueries({ queryKey: ['baux'] })
      toast.success('Import réalisé avec succès !')
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erreur lors de l\'import')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setStep('idle'); setPreview(null); setErrors([]); setCounts(null); setResults(null); setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const hasBlockingErrors = errors.length > 0 && errors.some(e => !e.includes('déjà existant'))

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f172a' }}>Import global</h1>
          <p className="text-sm mt-1" style={{ color: '#64748b' }}>
            Importez SCI, immeubles, lots, locataires et baux en une seule opération
          </p>
        </div>
        {step !== 'idle' && (
          <button onClick={reset} className="text-sm px-4 py-2 rounded-lg border"
            style={{ color: '#64748b', borderColor: '#e2e8f0' }}>
            Recommencer
          </button>
        )}
      </div>

      {/* Étape 1 : télécharger + uploader */}
      {step === 'idle' && (
        <div className="space-y-4">
          {/* Télécharger template */}
          <div className="card p-6 flex items-center gap-5">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ backgroundColor: '#f0fdf4' }}>📥</div>
            <div className="flex-1">
              <p className="font-semibold" style={{ color: '#0f172a' }}>Étape 1 — Télécharger le template Excel</p>
              <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>
                5 onglets : SCI · Immeubles · Lots · Locataires · Baux — chaque ligne d'exemple est à remplacer par vos données
              </p>
            </div>
            <button onClick={downloadTemplate}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex-shrink-0"
              style={{ backgroundColor: '#0f172a' }}>
              Télécharger
            </button>
          </div>

          {/* Uploader */}
          <div className="card p-6">
            <div className="flex items-center gap-5">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                style={{ backgroundColor: '#eff6ff' }}>📤</div>
              <div className="flex-1">
                <p className="font-semibold" style={{ color: '#0f172a' }}>Étape 2 — Importer votre fichier complété</p>
                <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>
                  Fichier .xlsx — max 10 Mo — les données existantes ne seront pas écrasées
                </p>
              </div>
              <label className="px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer flex-shrink-0"
                style={{ backgroundColor: loading ? '#94a3b8' : '#0f172a' }}>
                {loading ? 'Analyse...' : 'Choisir le fichier'}
                <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} disabled={loading} />
              </label>
            </div>
          </div>

          {/* Ordre d'import */}
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#94a3b8' }}>
              Ordre d'import
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {SECTIONS.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-full"
                    style={{ backgroundColor: s.color + '18', color: s.color }}>
                    {s.emoji} {s.label}
                  </span>
                  {i < SECTIONS.length - 1 && <span style={{ color: '#cbd5e1' }}>→</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Étape 2 : Preview */}
      {step === 'preview' && preview && (
        <div className="space-y-4">
          <p className="text-sm font-medium" style={{ color: '#64748b' }}>
            Fichier analysé : <strong style={{ color: '#0f172a' }}>{fileName}</strong>
          </p>

          {/* Compteurs */}
          <div className="grid grid-cols-5 gap-3">
            {SECTIONS.map(s => (
              <div key={s.key} className="card p-4 text-center">
                <div className="text-2xl mb-1">{s.emoji}</div>
                <div className="text-2xl font-bold" style={{ color: s.color }}>
                  {counts?.[s.key] ?? 0}
                </div>
                <div className="text-xs mt-0.5 font-medium" style={{ color: '#64748b' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Erreurs bloquantes */}
          {errors.filter(e => !e.includes('déjà existant')).length > 0 && (
            <div className="rounded-xl border p-4 space-y-1"
              style={{ backgroundColor: '#fff1f2', borderColor: '#fecdd3' }}>
              <p className="text-sm font-semibold mb-2" style={{ color: '#be123c' }}>
                🚨 Erreurs à corriger avant import
              </p>
              {errors.filter(e => !e.includes('déjà existant')).map((e, i) => (
                <p key={i} className="text-xs" style={{ color: '#9f1239' }}>• {e}</p>
              ))}
            </div>
          )}

          {/* Warnings (doublons) */}
          {errors.filter(e => e.includes('déjà existant')).length > 0 && (
            <div className="rounded-xl border p-4 space-y-1"
              style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}>
              <p className="text-sm font-semibold mb-2" style={{ color: '#92400e' }}>
                ⚠️ Ces entrées existent déjà et seront ignorées
              </p>
              {errors.filter(e => e.includes('déjà existant')).map((e, i) => (
                <p key={i} className="text-xs" style={{ color: '#78350f' }}>• {e}</p>
              ))}
            </div>
          )}

          {/* Aperçu détaillé par section */}
          {SECTIONS.map(s => {
            const rows = preview[s.key]
            if (!rows.length) return null
            // Labels lisibles par clé
            const LABELS: Record<string, string> = {
              name: 'Nom', sci_name: 'SCI', immeuble_name: 'Immeuble',
              code: 'Réf. lot', type: 'Type', surface: 'Surface (m²)', floor: 'Étage',
              company_name: 'Raison sociale', first_name: 'Prénom', last_name: 'Nom',
              email: 'Email', phone: 'Téléphone',
              lot_code: 'Lot', locataire_ref: 'Locataire', bail_ref: 'Réf. bail',
              start_date: 'Début', end_date: 'Fin', loyer_ht: 'Loyer HT', type_bail: 'Type bail',
            }
            const HIDDEN = ['notes', 'tenant_id', 'tva_rate', 'tva_applicable', 'indexation', 'indice', 'date_indexation', 'charges_ht', 'depot_garantie', 'frequency', 'address', 'postal_code', 'city', 'tva_number']
            return (
              <div key={s.key} className="card overflow-hidden">
                <div className="px-5 py-3 flex items-center gap-2"
                  style={{ backgroundColor: s.color + '12', borderBottom: `1px solid ${s.color}30` }}>
                  <span>{s.emoji}</span>
                  <span className="font-semibold text-sm" style={{ color: s.color }}>{s.label}</span>
                  <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: s.color + '20', color: s.color }}>{rows.length} ligne{rows.length > 1 ? 's' : ''}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {rows.slice(0, 5).map((row: any, i: number) => (
                        <tr key={i} style={{ backgroundColor: i % 2 ? '#f8fafc' : 'white' }}>
                          {Object.entries(row)
                            .filter(([k]) => !HIDDEN.includes(k))
                            .slice(0, 6)
                            .map(([k, v]) => (
                            <td key={k} className="px-4 py-2" style={{ color: '#374151' }}>
                              <span className="font-medium" style={{ color: '#94a3b8' }}>{LABELS[k] ?? k}: </span>
                              {v == null || v === ''
                                ? <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>(auto)</span>
                                : String(v)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {rows.length > 5 && (
                        <tr><td colSpan={6} className="px-4 py-2 text-center text-xs" style={{ color: '#94a3b8' }}>
                          + {rows.length - 5} ligne{rows.length - 5 > 1 ? 's' : ''} supplémentaire{rows.length - 5 > 1 ? 's' : ''}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={reset}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold border"
              style={{ color: '#64748b', borderColor: '#e2e8f0' }}>
              Annuler
            </button>
            <button onClick={confirmImport} disabled={loading || hasBlockingErrors}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: hasBlockingErrors ? '#94a3b8' : '#0f172a' }}>
              {loading ? 'Import en cours...' : hasBlockingErrors ? 'Corriger les erreurs d\'abord' : `Confirmer l'import (${Object.values(counts ?? {}).reduce((a: number, b: number) => a + b, 0)} lignes)`}
            </button>
          </div>
        </div>
      )}

      {/* Étape 3 : Résultat */}
      {step === 'done' && results && (
        <div className="space-y-4">
          <div className="rounded-xl border p-6 text-center"
            style={{ backgroundColor: '#f0fdf4', borderColor: '#86efac' }}>
            <div className="text-4xl mb-3">✅</div>
            <p className="text-lg font-bold" style={{ color: '#166534' }}>Import réalisé avec succès</p>
          </div>

          <div className="grid grid-cols-5 gap-3">
            {SECTIONS.map(s => (
              <div key={s.key} className="card p-4 text-center">
                <div className="text-2xl mb-1">{s.emoji}</div>
                <div className="text-2xl font-bold" style={{ color: s.color }}>
                  {results[s.key] ?? 0}
                </div>
                <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>créé{results[s.key] > 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>

          {results.skipped?.length > 0 && (
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>
                Ignorés (déjà existants)
              </p>
              {results.skipped.map((s: string, i: number) => (
                <p key={i} className="text-xs" style={{ color: '#64748b' }}>• {s}</p>
              ))}
            </div>
          )}

          <button onClick={reset}
            className="w-full py-2.5 rounded-lg text-sm font-semibold border"
            style={{ color: '#64748b', borderColor: '#e2e8f0' }}>
            Faire un autre import
          </button>
        </div>
      )}
    </div>
  )
}
