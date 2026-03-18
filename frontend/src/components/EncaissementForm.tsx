import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { bauxAPI } from '../services/api'

interface Props {
  onSubmit: (data: any) => Promise<void>
  onCancel: () => void
  initialData?: any
  isEdit?: boolean
}

const METHODES = [
  { value: 'virement',    label: 'Virement' },
  { value: 'cheque',      label: 'Chèque' },
  { value: 'prelevement', label: 'Prélèvement' },
  { value: 'especes',     label: 'Espèces' },
  { value: 'carte',       label: 'Carte' },
]

const MOIS = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre'
]

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

export default function EncaissementForm({ onSubmit, onCancel, initialData, isEdit = false }: Props) {
  const [formData, setFormData] = useState({
    bail_id:        initialData?.bail_id        || '',
    payment_date:   initialData?.payment_date   ? initialData.payment_date.split('T')[0] : new Date().toISOString().split('T')[0],
    amount:         initialData?.amount         || '',
    payment_method: initialData?.payment_method || 'virement',
    reference:      initialData?.reference      || '',
    periode_mois:   initialData?.periode_mois   || currentMonth,
    periode_annee:  initialData?.periode_annee  || currentYear,
    notes:          initialData?.notes          || '',
  })
  const [loading, setLoading] = useState(false)

  const { data: bauxList = [] } = useQuery({
    queryKey: ['baux-actifs'],
    queryFn: async () => {
      const res = await bauxAPI.getAll()
      return res.data.filter((b: any) => b.status === 'actif')
    }
  })

  useEffect(() => {
    if (initialData) {
      setFormData({
        bail_id:        initialData.bail_id        || '',
        payment_date:   initialData.payment_date   ? initialData.payment_date.split('T')[0] : new Date().toISOString().split('T')[0],
        amount:         initialData.amount         || '',
        payment_method: initialData.payment_method || 'virement',
        reference:      initialData.reference      || '',
        periode_mois:   initialData.periode_mois   || currentMonth,
        periode_annee:  initialData.periode_annee  || currentYear,
        notes:          initialData.notes          || '',
      })
    }
  }, [initialData])

  const set = (field: string, value: any) =>
    setFormData(prev => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.amount || parseFloat(formData.amount as string) <= 0) return
    setLoading(true)
    try {
      await onSubmit({
        ...formData,
        bail_id:       formData.bail_id       ? Number(formData.bail_id)       : null,
        amount:        parseFloat(formData.amount as string),
        periode_mois:  formData.periode_mois  ? Number(formData.periode_mois)  : null,
        periode_annee: formData.periode_annee ? Number(formData.periode_annee) : null,
      })
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:border-stone-400'
  const labelCls = 'block text-xs font-semibold mb-1'

  const getBailLabel = (b: any) => {
    const locataire = b.locataire_type === 'entreprise'
      ? b.locataire_company || b.locataire_last_name
      : [b.locataire_first_name, b.locataire_last_name].filter(Boolean).join(' ')
    return `${b.code} — ${locataire} (${b.lot_name || b.lot_code || ''})`
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Bail */}
      <div>
        <label className={labelCls} style={{ color: '#374151' }}>Bail / Locataire</label>
        <select
          value={formData.bail_id}
          onChange={e => set('bail_id', e.target.value)}
          className={inputCls}
          style={{ borderColor: '#e2e8f0', color: '#1a1a1a', backgroundColor: '#fff' }}
        >
          <option value="">— Sélectionner un bail —</option>
          {bauxList.map((b: any) => (
            <option key={b.id} value={b.id}>{getBailLabel(b)}</option>
          ))}
        </select>
      </div>

      {/* Date + Montant */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls} style={{ color: '#374151' }}>Date de paiement *</label>
          <input
            type="date"
            required
            value={formData.payment_date}
            onChange={e => set('payment_date', e.target.value)}
            className={inputCls}
            style={{ borderColor: '#e2e8f0', color: '#1a1a1a' }}
          />
        </div>
        <div>
          <label className={labelCls} style={{ color: '#374151' }}>Montant (€) *</label>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={formData.amount}
            onChange={e => set('amount', e.target.value)}
            className={inputCls}
            style={{ borderColor: '#e2e8f0', color: '#1a1a1a' }}
          />
        </div>
      </div>

      {/* Méthode */}
      <div>
        <label className={labelCls} style={{ color: '#374151' }}>Méthode de paiement</label>
        <select
          value={formData.payment_method}
          onChange={e => set('payment_method', e.target.value)}
          className={inputCls}
          style={{ borderColor: '#e2e8f0', color: '#1a1a1a', backgroundColor: '#fff' }}
        >
          {METHODES.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Période */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls} style={{ color: '#374151' }}>Mois concerné</label>
          <select
            value={formData.periode_mois}
            onChange={e => set('periode_mois', e.target.value)}
            className={inputCls}
            style={{ borderColor: '#e2e8f0', color: '#1a1a1a', backgroundColor: '#fff' }}
          >
            {MOIS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} style={{ color: '#374151' }}>Année</label>
          <input
            type="number"
            min="2000"
            max="2099"
            value={formData.periode_annee}
            onChange={e => set('periode_annee', e.target.value)}
            className={inputCls}
            style={{ borderColor: '#e2e8f0', color: '#1a1a1a' }}
          />
        </div>
      </div>

      {/* Référence */}
      <div>
        <label className={labelCls} style={{ color: '#374151' }}>Référence / Libellé</label>
        <input
          type="text"
          placeholder="Ex: Loyer janvier 2025, Virement DURAND..."
          value={formData.reference}
          onChange={e => set('reference', e.target.value)}
          className={inputCls}
          style={{ borderColor: '#e2e8f0', color: '#1a1a1a' }}
        />
      </div>

      {/* Notes */}
      <div>
        <label className={labelCls} style={{ color: '#374151' }}>Notes</label>
        <textarea
          rows={2}
          placeholder="Informations complémentaires..."
          value={formData.notes}
          onChange={e => set('notes', e.target.value)}
          className={inputCls}
          style={{ borderColor: '#e2e8f0', color: '#1a1a1a', resize: 'vertical' }}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors"
          style={{ borderColor: '#e2e8f0', color: '#6b7280' }}
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: '#978A47' }}
        >
          {loading ? '…' : isEdit ? 'Mettre à jour' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}
