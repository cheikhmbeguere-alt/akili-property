import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { lotsAPI, locatairesAPI } from '../services/api'
import toast from 'react-hot-toast'

interface BailFormProps {
  onSubmit: (data: any) => Promise<void>
  onCancel: () => void
  initialData?: any
  isEdit?: boolean
}

const INDICES = [
  { id: 1, code: 'ILC', name: 'Indice des Loyers Commerciaux' },
  { id: 2, code: 'ILAT', name: 'Indice des Loyers des Activités Tertiaires' },
  { id: 3, code: 'ICC', name: 'Indice du Coût de la Construction' },
  { id: 4, code: 'IRL', name: 'Indice de Référence des Loyers' }
]

export default function BailForm({ onSubmit, onCancel, initialData, isEdit = false }: BailFormProps) {
  const [formData, setFormData] = useState({
    code: '',
    lot_id: '',
    locataire_id: '',
    start_date: '',
    end_date: '',
    notice_period_months: '3',
    quittancement_frequency: 'mensuel',
    loyer_ht: '',
    charges_ht: '0',
    tva_applicable: true,
    tva_rate: '20.00',
    tva_on_charges: false,
    depot_garantie: '',
    depot_garantie_received_date: '',
    indexation_applicable: true,
    indexation_frequency: 'annuelle',
    indice_id: '1',
    indice_base_value: '',
    indice_base_year: new Date().getFullYear().toString(),
    indice_base_quarter: '1',
    indexation_date_month: '1',
    indexation_date_day: '1',
    franchise_start_date: '',
    franchise_end_date: '',
    type_bail: 'commercial',
    notes: '',
    solde_reprise: '0',
    solde_reprise_date: '',
    loyer_reprise: ''
  })
  const [loading, setLoading] = useState(false)
  // Évite la réinitialisation du formulaire à chaque rechargement des listes
  const editInitialized = useRef(false)
  const createAutoFilled = useRef(false)

  const currentLotId = initialData?.lot_id
  const { data: lotList = [] } = useQuery({
    queryKey: ['lots', isEdit ? currentLotId : 'new'],
    queryFn: async () => {
      const response = await lotsAPI.getAll()
      // En mode édition, conserver le lot du bail actuel même s'il est actif
      return response.data.filter((lot: any) =>
        !lot.bail_status || lot.bail_status !== 'actif' || (isEdit && String(lot.id) === String(currentLotId))
      )
    }
  })

  const { data: locataireList = [] } = useQuery({
    queryKey: ['locataires'],
    queryFn: async () => {
      const response = await locatairesAPI.getAll()
      return response.data.filter((loc: any) => loc.is_active !== false)
    }
  })

  // Normalise une date ISO (2024-03-12T00:00:00Z) ou YYYY-MM-DD → YYYY-MM-DD pour <input type="date">
  const fmtDateInput = (d: string | null | undefined): string => {
    if (!d) return ''
    return String(d).substring(0, 10)
  }

  // Initialisation en mode édition : une seule fois par changement de initialData
  useEffect(() => {
    if (!initialData) {
      editInitialized.current = false
      return
    }
    if (editInitialized.current) return  // déjà initialisé — ne pas écraser les saisies de l'utilisateur
    editInitialized.current = true
    setFormData({
      code: initialData.code || '',
      lot_id: initialData.lot_id || '',
      locataire_id: initialData.locataire_id || '',
      start_date: fmtDateInput(initialData.start_date),
      end_date: fmtDateInput(initialData.end_date),
      notice_period_months: initialData.notice_period_months?.toString() || '3',
      quittancement_frequency: initialData.quittancement_frequency || 'mensuel',
      loyer_ht: initialData.loyer_ht || '',
      charges_ht: initialData.charges_ht || '0',
      tva_applicable: initialData.tva_applicable !== false,
      tva_rate: initialData.tva_rate?.toString() || '20.00',
      tva_on_charges: initialData.tva_on_charges || false,
      depot_garantie: initialData.depot_garantie || '',
      depot_garantie_received_date: fmtDateInput(initialData.depot_garantie_received_date),
      indexation_applicable: initialData.indexation_applicable !== false,
      indexation_frequency: initialData.indexation_frequency || 'annuelle',
      indice_id: initialData.indice_id?.toString() || '1',
      indice_base_value: initialData.indice_base_value || '',
      indice_base_year: initialData.indice_base_year?.toString() || new Date().getFullYear().toString(),
      indice_base_quarter: initialData.indice_base_quarter?.toString() || '1',
      indexation_date_month: initialData.indexation_date_month?.toString() || '1',
      indexation_date_day: initialData.indexation_date_day?.toString() || '1',
      franchise_start_date: fmtDateInput(initialData.franchise_start_date),
      franchise_end_date: fmtDateInput(initialData.franchise_end_date),
      type_bail: initialData.type_bail || 'commercial',
      notes: initialData.notes || '',
      solde_reprise: initialData.solde_reprise?.toString() || '0',
      solde_reprise_date: fmtDateInput(initialData.solde_reprise_date),
      loyer_reprise: initialData.loyer_reprise?.toString() || ''
    })
  }, [initialData])

  // Auto-fill en mode création : une seule fois quand les listes sont disponibles
  useEffect(() => {
    if (initialData || createAutoFilled.current) return
    if (lotList.length > 0 && locataireList.length > 0) {
      createAutoFilled.current = true
      setFormData(prev => ({
        ...prev,
        lot_id: prev.lot_id || lotList[0].id,
        locataire_id: prev.locataire_id || locataireList[0].id,
      }))
    }
  }, [lotList, locataireList, initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.code || !formData.lot_id || !formData.locataire_id || !formData.start_date || !formData.loyer_ht) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return
    }

    // Validation : l'année de l'indice de base ne peut pas dépasser l'année de début du bail
    if (formData.indexation_applicable && formData.indice_base_year && formData.start_date) {
      const bailStartYear = parseInt(formData.start_date.substring(0, 4))
      const baseYear = parseInt(formData.indice_base_year)
      if (!isNaN(baseYear) && baseYear > bailStartYear) {
        toast.error(`L'année de l'indice de base (${baseYear}) ne peut pas dépasser l'année de début du bail (${bailStartYear})`)
        return
      }
    }

    setLoading(true)
    try {
      await onSubmit({
        ...formData,
        lot_id: parseInt(formData.lot_id),
        locataire_id: parseInt(formData.locataire_id),
        notice_period_months: formData.notice_period_months ? parseInt(formData.notice_period_months) : null,
        loyer_ht: parseFloat(formData.loyer_ht),
        charges_ht: parseFloat(formData.charges_ht),
        tva_rate: formData.tva_applicable ? parseFloat(formData.tva_rate) : null,
        depot_garantie: formData.depot_garantie ? parseFloat(formData.depot_garantie) : null,
        indice_id: formData.indexation_applicable ? parseInt(formData.indice_id) : null,
        indice_base_value: formData.indexation_applicable && formData.indice_base_value ? parseFloat(formData.indice_base_value) : null,
        indice_base_year: formData.indexation_applicable && formData.indice_base_year ? parseInt(formData.indice_base_year) : null,
        indice_base_quarter: formData.indexation_applicable && formData.indice_base_quarter ? parseInt(formData.indice_base_quarter) : null,
        indexation_date_month: formData.indexation_applicable && formData.indexation_date_month ? parseInt(formData.indexation_date_month) : null,
        indexation_date_day: formData.indexation_applicable && formData.indexation_date_day ? parseInt(formData.indexation_date_day) : null,
        indexation_frequency: formData.indexation_applicable ? formData.indexation_frequency : null,
        end_date: formData.end_date || null,
        depot_garantie_received_date: formData.depot_garantie_received_date || null,
        franchise_start_date: formData.franchise_start_date || null,
        franchise_end_date: formData.franchise_end_date || null,
        solde_reprise: formData.solde_reprise ? parseFloat(formData.solde_reprise) : 0,
        solde_reprise_date: formData.solde_reprise_date || null,
        loyer_reprise: formData.loyer_reprise ? parseFloat(formData.loyer_reprise) : null
      })
      toast.success(isEdit ? 'Bail modifié avec succès' : 'Bail créé avec succès')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  // Année max autorisée pour l'indice de base = année de début du bail
  const startYear = formData.start_date ? parseInt(formData.start_date.substring(0, 4)) : new Date().getFullYear()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked
    const newValue = type === 'checkbox' ? checked : value

    // Quand start_date change : auto-corriger indice_base_year si supérieur à la nouvelle année
    if (name === 'start_date' && value) {
      const newStartYear = parseInt(value.substring(0, 4))
      const currentBaseYear = parseInt(formData.indice_base_year)
      setFormData({
        ...formData,
        start_date: value,
        indice_base_year: (isNaN(currentBaseYear) || currentBaseYear > newStartYear)
          ? newStartYear.toString()
          : formData.indice_base_year,
      })
      return
    }

    setFormData({
      ...formData,
      [name]: newValue
    })
  }

  // Label dynamique selon la fréquence
  const getLoyerLabel = () => {
    switch(formData.quittancement_frequency) {
      case 'mensuel': return 'Loyer mensuel HT'
      case 'trimestriel': return 'Loyer trimestriel HT'
      case 'annuel': return 'Loyer annuel HT'
      default: return 'Loyer HT'
    }
  }

  const getChargesLabel = () => {
    switch(formData.quittancement_frequency) {
      case 'mensuel': return 'Charges mensuelles HT'
      case 'trimestriel': return 'Charges trimestrielles HT'
      case 'annuel': return 'Charges annuelles HT'
      default: return 'Charges HT'
    }
  }

  if (lotList.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-yellow-900 mb-2">⚠️ Aucun lot disponible</h4>
        <p className="text-sm text-yellow-700">Tous les lots sont déjà loués ou aucun lot n'existe. Créez d'abord des lots.</p>
        <button onClick={onCancel} className="mt-3 text-sm text-yellow-900 underline">Retour</button>
      </div>
    )
  }

  if (locataireList.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-yellow-900 mb-2">⚠️ Aucun locataire disponible</h4>
        <p className="text-sm text-yellow-700">Créez d'abord au moins un locataire.</p>
        <button onClick={onCancel} className="mt-3 text-sm text-yellow-900 underline">Retour</button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Informations de base */}
      <div>
        <h4 className="text-md font-medium text-gray-900 mb-4">Informations générales</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* TYPE DE BAIL */}
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700">Type de bail <span className="text-red-500">*</span></label>
            <div className="mt-1 flex flex-wrap gap-2">
              {[
                { value: 'commercial',      label: 'Commercial',       desc: 'Bail commercial 3-6-9' },
                { value: 'professionnel',   label: 'Professionnel',    desc: 'Professions libérales' },
                { value: 'habitation',      label: 'Habitation',       desc: 'Résidentiel (loi 89)' },
                { value: 'mixte',           label: 'Mixte',            desc: 'Usage mixte' },
              ].map(opt => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-colors text-sm"
                  style={{
                    borderColor: formData.type_bail === opt.value ? '#af9500' : '#d1d5db',
                    backgroundColor: formData.type_bail === opt.value ? '#F5F0DC' : 'white',
                    color: formData.type_bail === opt.value ? '#78621e' : '#374151',
                  }}
                >
                  <input
                    type="radio" name="type_bail" value={opt.value}
                    checked={formData.type_bail === opt.value}
                    onChange={handleChange} className="sr-only"
                  />
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-xs opacity-70">— {opt.desc}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Code Bail <span className="text-red-500">*</span></label>
            <input type="text" name="code" value={formData.code} onChange={handleChange} disabled={isEdit} required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none disabled:bg-gray-100"
              placeholder="BAIL-2024-001" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Lot <span className="text-red-500">*</span></label>
            <select name="lot_id" value={formData.lot_id} onChange={handleChange} disabled={isEdit} required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none disabled:bg-gray-100">
              {lotList.map((lot: any) => (
                <option key={lot.id} value={lot.id}>{lot.immeuble_code} - {lot.code} ({lot.surface}m²)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Locataire <span className="text-red-500">*</span></label>
            <select name="locataire_id" value={formData.locataire_id} onChange={handleChange} disabled={isEdit} required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none disabled:bg-gray-100">
              {locataireList.map((loc: any) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} - {loc.type === 'entreprise' ? loc.company_name : `${loc.first_name} ${loc.last_name}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Date de début <span className="text-red-500">*</span></label>
            <input type="date" name="start_date" value={formData.start_date} onChange={handleChange} required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Date de fin</label>
            <input type="date" name="end_date" value={formData.end_date} onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Préavis (mois)</label>
            <input type="number" name="notice_period_months" value={formData.notice_period_months} onChange={handleChange} min="0"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none" />
          </div>
        </div>
      </div>

      {/* Conditions financières */}
      <div>
        <h4 className="text-md font-medium text-gray-900 mb-4">Conditions financières</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* FRÉQUENCE EN PREMIER */}
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700">
              Fréquence de quittancement <span className="text-red-500">*</span>
            </label>
            <select name="quittancement_frequency" value={formData.quittancement_frequency} onChange={handleChange}
              className="mt-1 block w-full md:w-64 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none">
              <option value="mensuel">Mensuel</option>
              <option value="trimestriel">Trimestriel</option>
              <option value="annuel">Annuel</option>
            </select>
          </div>

          {/* LOYER avec label dynamique */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {getLoyerLabel()} <span className="text-red-500">*</span>
            </label>
            <input type="number" name="loyer_ht" value={formData.loyer_ht} onChange={handleChange} required step="0.01" min="0"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
              placeholder={formData.quittancement_frequency === 'mensuel' ? '1500.00' : formData.quittancement_frequency === 'trimestriel' ? '4500.00' : '18000.00'} />
          </div>

          {/* CHARGES avec label dynamique */}
          <div>
            <label className="block text-sm font-medium text-gray-700">{getChargesLabel()}</label>
            <input type="number" name="charges_ht" value={formData.charges_ht} onChange={handleChange} step="0.01" min="0"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
              placeholder={formData.quittancement_frequency === 'mensuel' ? '150.00' : formData.quittancement_frequency === 'trimestriel' ? '450.00' : '1800.00'} />
          </div>

          <div className="flex items-center pt-6">
            <input type="checkbox" name="tva_applicable" checked={formData.tva_applicable} onChange={handleChange}
              className="h-4 w-4 text-yellow-600 border-gray-300 rounded" />
            <label className="ml-2 text-sm text-gray-700">TVA applicable</label>
          </div>

          {formData.tva_applicable && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Taux TVA (%)</label>
                <select name="tva_rate" value={formData.tva_rate} onChange={handleChange}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none">
                  <option value="20.00">20%</option>
                  <option value="10.00">10%</option>
                  <option value="5.50">5.5%</option>
                </select>
              </div>

              <div className="flex items-center pt-6">
                <input type="checkbox" name="tva_on_charges" checked={formData.tva_on_charges} onChange={handleChange}
                  className="h-4 w-4 text-yellow-600 border-gray-300 rounded" />
                <label className="ml-2 text-sm text-gray-700">TVA sur charges</label>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">Dépôt de garantie</label>
            <input type="number" name="depot_garantie" value={formData.depot_garantie} onChange={handleChange} step="0.01" min="0"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none" />
          </div>

          {formData.depot_garantie && parseFloat(String(formData.depot_garantie)) > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Date réception DG</label>
              <input type="date" name="depot_garantie_received_date" value={formData.depot_garantie_received_date} onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none" />
            </div>
          )}

          {/* Solde de reprise */}
          <div className="md:col-span-3">
            <div className="rounded-lg p-3 border" style={{ backgroundColor: '#fafaf7', borderColor: '#e5e1d5' }}>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Reprise de portefeuille
                <span className="ml-2 text-xs font-normal" style={{ color: '#9ca3af' }}>
                  (optionnel — remplir uniquement si ce bail existait avant votre reprise)
                </span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Solde impayé historique (€)</label>
                  <input type="number" name="solde_reprise" value={formData.solde_reprise} onChange={handleChange} step="0.01" min="0"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none text-sm"
                    placeholder="0.00" />
                  <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>Arriéré avant l'entrée dans le système</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date de reprise du dossier</label>
                  <input type="date" name="solde_reprise_date" value={formData.solde_reprise_date} onChange={handleChange}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none text-sm" />
                  <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>Le rattrapage d'indexation partira de cette date</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Loyer HT en vigueur à la reprise (€)</label>
                  <input type="number" name="loyer_reprise" value={formData.loyer_reprise} onChange={handleChange} step="0.01" min="0"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none text-sm"
                    placeholder="Ex: 2 500.00" />
                  <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>Si déjà indexé avant la reprise, sinon laisser vide</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Indexation */}
      <div>
        <div className="flex items-center mb-4">
          <input type="checkbox" name="indexation_applicable" checked={formData.indexation_applicable} onChange={handleChange}
            className="h-4 w-4 text-yellow-600 border-gray-300 rounded" />
          <label className="ml-2 text-md font-medium text-gray-900">Indexation applicable</label>
        </div>

        {formData.indexation_applicable && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Indice</label>
              <select name="indice_id" value={formData.indice_id} onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none">
                {INDICES.map(ind => (
                  <option key={ind.id} value={ind.id}>{ind.code} - {ind.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Valeur de base</label>
              <input type="number" name="indice_base_value" value={formData.indice_base_value} onChange={handleChange} step="0.01"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
                placeholder="130.52" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Année base
                {formData.start_date && (
                  <span className="ml-1 text-xs font-normal" style={{ color: '#9ca3af' }}>
                    (max {startYear})
                  </span>
                )}
              </label>
              <input type="number" name="indice_base_year" value={formData.indice_base_year} onChange={handleChange}
                min="2000" max={startYear}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Trimestre base</label>
              <select name="indice_base_quarter" value={formData.indice_base_quarter} onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none">
                <option value="1">T1</option>
                <option value="2">T2</option>
                <option value="3">T3</option>
                <option value="4">T4</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Fréquence révision</label>
              <select name="indexation_frequency" value={formData.indexation_frequency} onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none">
                <option value="annuelle">Annuelle</option>
                <option value="triennale">Triennale (3 ans)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Mois indexation</label>
              <input type="number" name="indexation_date_month" value={formData.indexation_date_month} onChange={handleChange} min="1" max="12"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Jour indexation</label>
              <input type="number" name="indexation_date_day" value={formData.indexation_date_day} onChange={handleChange} min="1" max="31"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none" />
            </div>
          </div>
        )}
      </div>

      {/* Franchise */}
      <div>
        <h4 className="text-md font-medium text-gray-900 mb-4">Franchise de loyer (optionnel)</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Date début franchise</label>
            <input type="date" name="franchise_start_date" value={formData.franchise_start_date} onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Date fin franchise</label>
            <input type="date" name="franchise_end_date" value={formData.franchise_end_date} onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none" />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Notes</label>
        <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none" />
      </div>

      <div className="flex justify-end space-x-3 pt-4 border-t">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
          Annuler
        </button>
        <button type="submit" disabled={loading}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-stone-800 hover:bg-stone-700 focus:outline-none disabled:opacity-50">
          {loading ? 'Enregistrement...' : (isEdit ? 'Modifier' : 'Créer')}
        </button>
      </div>
    </form>
  )
}
