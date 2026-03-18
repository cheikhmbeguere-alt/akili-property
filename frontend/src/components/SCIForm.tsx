import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

interface SCIFormProps {
  onSubmit: (data: any) => Promise<void>
  onCancel: () => void
  initialData?: any
  isEdit?: boolean
}

export default function SCIForm({ onSubmit, onCancel, initialData, isEdit = false }: SCIFormProps) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    siret: '',
    address: '',
    tva_number: ''
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (initialData) {
      setFormData({
        code: initialData.code || '',
        name: initialData.name || '',
        siret: initialData.siret || '',
        address: initialData.address || '',
        tva_number: initialData.tva_number || ''
      })
    }
  }, [initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.code || !formData.name) {
      toast.error('Le code et le nom sont obligatoires')
      return
    }

    setLoading(true)
    try {
      await onSubmit(formData)
      toast.success(isEdit ? 'SCI modifiée avec succès' : 'SCI créée avec succès')
      if (!isEdit) {
        setFormData({
          code: '',
          name: '',
          siret: '',
          address: '',
          tva_number: ''
        })
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Code SCI <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="code"
            value={formData.code}
            onChange={handleChange}
            disabled={isEdit}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none disabled:bg-gray-100"
            placeholder="Ex: SCI01"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Nom <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
            placeholder="Ex: SCI du Centre"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            SIRET
          </label>
          <input
            type="text"
            name="siret"
            value={formData.siret}
            onChange={handleChange}
            maxLength={14}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
            placeholder="12345678901234"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Numéro TVA
          </label>
          <input
            type="text"
            name="tva_number"
            value={formData.tva_number}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
            placeholder="FR12345678901"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Adresse
        </label>
        <textarea
          name="address"
          value={formData.address}
          onChange={handleChange}
          rows={3}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
          placeholder="Adresse complète de la SCI"
        />
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-stone-800 hover:bg-stone-700 focus:outline-none disabled:opacity-50"
        >
          {loading ? 'Enregistrement...' : (isEdit ? 'Modifier' : 'Créer')}
        </button>
      </div>
    </form>
  )
}
