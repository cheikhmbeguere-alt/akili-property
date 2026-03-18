import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { depotGarantieAPI } from '../services/api'

interface Props {
  bailId: number
  onClose: () => void
  onSuccess: () => void
}

const fmt = (n: any) =>
  parseFloat(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'

export default function SortieLocataireModal({ bailId, onClose, onSuccess }: Props) {
  const [dateSortie, setDateSortie] = useState(new Date().toISOString().split('T')[0])
  const [etatDesLieux, setEtatDesLieux] = useState('bon_etat')
  const [retenues, setRetenues] = useState('0')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: calcul, isLoading } = useQuery({
    queryKey: ['calcul-sortie', bailId],
    queryFn: () => depotGarantieAPI.getCalculSortie(bailId).then(r => r.data),
  })

  const retenuesNum = parseFloat(retenues || '0') || 0
  const soldeImpaye = calcul?.solde_impaye || 0
  const depotRecu = calcul?.depot_garantie_recu || 0
  const montantRestitue = Math.max(0, depotRecu - retenuesNum - soldeImpaye)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await depotGarantieAPI.enregistrerSortie(bailId, {
        date_sortie: dateSortie,
        etat_des_lieux: etatDesLieux,
        retenues: retenuesNum,
        notes: notes || undefined,
      })
      toast.success('Sortie enregistrée — bail terminé')
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erreur lors de la sortie')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: '#e2e8f0' }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1a1a' }}>
              🚪 Sortie de locataire
            </h2>
            {calcul && (
              <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                {calcul.locataire_nom} · {calcul.immeuble_name} / {calcul.lot_code}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2"
              style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-5">

            {/* Calcul automatique */}
            <div className="rounded-xl border p-4 space-y-2.5" style={{ backgroundColor: '#faf9f7', borderColor: '#e2e8f0' }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#9ca3af' }}>
                Récapitulatif financier
              </p>

              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#6b7280' }}>Dépôt de garantie reçu</span>
                <span className="font-semibold" style={{ color: '#1a1a1a' }}>{fmt(depotRecu)}</span>
              </div>

              {soldeImpaye > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: '#6b7280' }}>Loyers impayés</span>
                  <span className="font-semibold" style={{ color: '#dc2626' }}>− {fmt(soldeImpaye)}</span>
                </div>
              )}

              {retenuesNum > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: '#6b7280' }}>Retenues (dégradations)</span>
                  <span className="font-semibold" style={{ color: '#dc2626' }}>− {fmt(retenuesNum)}</span>
                </div>
              )}

              <div className="border-t pt-2.5" style={{ borderColor: '#e2e8f0' }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold" style={{ color: '#1a1a1a' }}>Montant à restituer</span>
                  <span className="text-lg font-bold"
                    style={{ color: montantRestitue > 0 ? '#16a34a' : '#dc2626' }}>
                    {fmt(montantRestitue)}
                  </span>
                </div>
                {montantRestitue === 0 && depotRecu > 0 && (
                  <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                    Le dépôt de garantie est intégralement retenu
                  </p>
                )}
              </div>
            </div>

            {/* Formulaire */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
                  Date de sortie *
                </label>
                <input type="date" value={dateSortie}
                  onChange={e => setDateSortie(e.target.value)} required
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ borderColor: '#e2e8f0' }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
                  État des lieux
                </label>
                <select value={etatDesLieux} onChange={e => setEtatDesLieux(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ borderColor: '#e2e8f0' }}>
                  <option value="bon_etat">Bon état</option>
                  <option value="degradations">Dégradations</option>
                  <option value="non_realise">Non réalisé</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
                Retenues pour dégradations (€)
              </label>
              <input type="number" min="0" step="0.01" value={retenues}
                onChange={e => setRetenues(e.target.value)}
                placeholder="0.00"
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: '#e2e8f0' }} />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
                Notes (optionnel)
              </label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Observations sur l'état du logement, motif de retenue..."
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none"
                style={{ borderColor: '#e2e8f0' }} />
            </div>

            {/* Avertissement */}
            <div className="rounded-lg p-3" style={{ backgroundColor: '#fef3c7', borderLeft: '3px solid #d97706' }}>
              <p className="text-xs font-semibold" style={{ color: '#92400e' }}>⚠️ Action irréversible</p>
              <p className="text-xs mt-0.5" style={{ color: '#78350f' }}>
                Cette action terminera le bail définitivement et enregistrera le mouvement de dépôt de garantie.
              </p>
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border"
                style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>
                Annuler
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
                style={{ backgroundColor: '#978A47' }}>
                {saving ? '⏳ Enregistrement…' : '✅ Confirmer la sortie'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
