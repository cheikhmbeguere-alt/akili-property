import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { immeublesAPI } from '../services/api'
import toast from 'react-hot-toast'

interface LotFormProps {
  onSubmit: (data: any) => Promise<void>
  onCancel: () => void
  initialData?: any
  isEdit?: boolean
}

export default function LotForm({ onSubmit, onCancel, initialData, isEdit = false }: LotFormProps) {
  const [formData, setFormData] = useState({
    immeuble_id: '',
    code: '',
    name: '',
    surface: '',
    floor: '',
    type: 'bureau',
    description: ''
  })
  const [loading, setLoading] = useState(false)

  // Récupérer la liste des immeubles
  const { data: immeubleList = [] } = useQuery({
    queryKey: ['immeubles'],
    queryFn: async () => {
      const response = await immeublesAPI.getAll()
      return response.data
    }
  })

  useEffect(() => {
    if (initialData) {
      setFormData({
        immeuble_id: initialData.immeuble_id || '',
        code: initialData.code || '',
        name: initialData.name || '',
        surface: initialData.surface || '',
        floor: initialData.floor || '',
        type: initialData.type || 'bureau',
        description: initialData.description || ''
      })
    } else if (immeubleList.length > 0 && !formData.immeuble_id) {
      // Sélectionner le premier immeuble par défaut
      setFormData(prev => ({ ...prev, immeuble_id: immeubleList[0].id }))
    }
  }, [initialData, immeubleList])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.immeuble_id || !formData.code || !formData.surface) {
      toast.error('L\'immeuble, le code et la surface sont obligatoires')
      return
    }

    setLoading(true)
    try {
      await onSubmit({
        ...formData,
        immeuble_id: parseInt(formData.immeuble_id),
        surface: parseFloat(formData.surface),
        floor: formData.floor ? parseInt(formData.floor) : null
      })
      toast.success(isEdit ? 'Lot modifié avec succès' : 'Lot créé avec succès')
      if (!isEdit) {
        setFormData({
          immeuble_id: formData.immeuble_id, // Garde le même immeuble
          code: '',
          name: '',
          surface: '',
          floor: '',
          type: 'bureau',
          description: ''
        })
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  if (immeubleList.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-yellow-900 mb-2">⚠️ Aucun immeuble disponible</h4>
        <p className="text-sm text-yellow-700">
          Vous devez d'abord créer au moins un immeuble avant de pouvoir créer des lots.
        </p>
        <button
          onClick={onCancel}
          className="mt-3 text-sm text-yellow-900 underline hover:no-underline"
        >
          Retour
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">
            Immeuble <span className="text-red-500">*</span>
          </label>
          <select
            name="immeuble_id"
            value={formData.immeuble_id}
            onChange={handleChange}
            disabled={isEdit}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none disabled:bg-gray-100"
          >
            {immeubleList.map((immeuble: any) => (
              <option key={immeuble.id} value={immeuble.id}>
                {immeuble.code} - {immeuble.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Code Lot <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="code"
            value={formData.code}
            onChange={handleChange}
            disabled={isEdit}
            required
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none disabled:bg-gray-100"
            placeholder="Ex: LOT-A1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Nom
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
            placeholder="Ex: Bureau étage 2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Surface (m²) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            name="surface"
            value={formData.surface}
            onChange={handleChange}
            required
            step="0.01"
            min="0"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
            placeholder="150.00"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Étage
          </label>
          <input
            type="number"
            name="floor"
            value={formData.floor}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
            placeholder="Ex: 2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Type
          </label>
          <select
            name="type"
            value={formData.type}
            onChange={handleChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
          >
            <option value="bureau">Bureau</option>
            <option value="entrepot">Entrepôt</option>
            <option value="parking">Parking</option>
            <option value="commerce">Commerce</option>
            <option value="atelier">Atelier</option>
            <option value="autre">Autre</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={2}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
            placeholder="Informations complémentaires sur le lot"
          />
        </div>
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
