import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sciAPI } from '../services/api'
import toast from 'react-hot-toast'

interface ImmeubleFormProps {
  onSubmit: (data: any) => Promise<void>
  onCancel: () => void
  initialData?: any
  isEdit?: boolean
}

export default function ImmeubleForm({ onSubmit, onCancel, initialData, isEdit = false }: ImmeubleFormProps) {
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    address: '',
    city: '',
    postal_code: '',
    total_surface: '',
    construction_year: ''
  })
  
  const [sciLinks, setSciLinks] = useState<Array<{sci_id: number, ownership_percentage: string, tantiemes: string}>>([])
  const [loading, setLoading] = useState(false)

  // Récupérer la liste des SCI
  const { data: sciList = [] } = useQuery({
    queryKey: ['sci'],
    queryFn: async () => {
      const response = await sciAPI.getAll()
      return response.data
    }
  })

  useEffect(() => {
    if (initialData) {
      setFormData({
        code: initialData.code || '',
        name: initialData.name || '',
        address: initialData.address || '',
        city: initialData.city || '',
        postal_code: initialData.postal_code || '',
        total_surface: initialData.total_surface || '',
        construction_year: initialData.construction_year || ''
      })
      
      if (initialData.sci_links && Array.isArray(initialData.sci_links)) {
        setSciLinks(initialData.sci_links.map((link: any) => ({
          sci_id: link.sci_id,
          ownership_percentage: link.ownership_percentage || '',
          tantiemes: link.tantiemes || ''
        })))
      }
    }
  }, [initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.code || !formData.name || !formData.address) {
      toast.error('Le code, le nom et l\'adresse sont obligatoires')
      return
    }

    if (sciLinks.length === 0) {
      toast.error('Veuillez lier au moins une SCI')
      return
    }

    // Vérifier que la somme des pourcentages = 100% si renseignés
    const totalPercentage = sciLinks.reduce((sum, link) => {
      return sum + (parseFloat(link.ownership_percentage) || 0)
    }, 0)

    if (totalPercentage > 0 && totalPercentage !== 100) {
      toast.error(`La somme des pourcentages doit être 100% (actuellement ${totalPercentage}%)`)
      return
    }

    setLoading(true)
    try {
      await onSubmit({
        ...formData,
        total_surface: formData.total_surface ? parseFloat(formData.total_surface) : null,
        construction_year: formData.construction_year ? parseInt(formData.construction_year) : null,
        sci_links: sciLinks.map(link => ({
          sci_id: link.sci_id,
          ownership_percentage: link.ownership_percentage ? parseFloat(link.ownership_percentage) : null,
          tantiemes: link.tantiemes ? parseInt(link.tantiemes) : null
        }))
      })
      toast.success(isEdit ? 'Immeuble modifié avec succès' : 'Immeuble créé avec succès')
      if (!isEdit) {
        setFormData({
          code: '',
          name: '',
          address: '',
          city: '',
          postal_code: '',
          total_surface: '',
          construction_year: ''
        })
        setSciLinks([])
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

  const addSCILink = () => {
    if (sciList.length === 0) {
      toast.error('Aucune SCI disponible. Créez d\'abord une SCI.')
      return
    }
    
    setSciLinks([...sciLinks, { sci_id: sciList[0].id, ownership_percentage: '', tantiemes: '' }])
  }

  const removeSCILink = (index: number) => {
    setSciLinks(sciLinks.filter((_, i) => i !== index))
  }

  const updateSCILink = (index: number, field: string, value: string) => {
    const updated = [...sciLinks]
    updated[index] = { ...updated[index], [field]: value }
    setSciLinks(updated)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Informations de base */}
      <div>
        <h4 className="text-md font-medium text-gray-900 mb-4">Informations générales</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Code Immeuble <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="code"
              value={formData.code}
              onChange={handleChange}
              disabled={isEdit}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none disabled:bg-gray-100"
              placeholder="Ex: IMM01"
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
              placeholder="Ex: Immeuble du Centre"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">
              Adresse <span className="text-red-500">*</span>
            </label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
              required
              rows={2}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
              placeholder="Adresse complète"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Ville
            </label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Code postal
            </label>
            <input
              type="text"
              name="postal_code"
              value={formData.postal_code}
              onChange={handleChange}
              maxLength={5}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Surface totale (m²)
            </label>
            <input
              type="number"
              name="total_surface"
              value={formData.total_surface}
              onChange={handleChange}
              step="0.01"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Année de construction
            </label>
            <input
              type="number"
              name="construction_year"
              value={formData.construction_year}
              onChange={handleChange}
              min="1800"
              max="2100"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Liens avec les SCI */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-md font-medium text-gray-900">
            SCI propriétaires <span className="text-red-500">*</span>
          </h4>
          <button
            type="button"
            onClick={addSCILink}
            className="text-sm text-yellow-700 hover:text-yellow-900"
          >
            + Ajouter une SCI
          </button>
        </div>

        {sciLinks.length === 0 ? (
          <div className="text-center py-4 bg-gray-50 rounded-md border border-dashed border-gray-300">
            <p className="text-sm text-gray-500">Aucune SCI liée. Cliquez sur "Ajouter une SCI"</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sciLinks.map((link, index) => (
              <div key={index} className="flex gap-3 items-start p-3 bg-gray-50 rounded-md">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">SCI</label>
                  <select
                    value={link.sci_id}
                    onChange={(e) => updateSCILink(index, 'sci_id', e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none text-sm"
                  >
                    {sciList.map((sci: any) => (
                      <option key={sci.id} value={sci.id}>
                        {sci.code} - {sci.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">% Détention</label>
                  <input
                    type="number"
                    value={link.ownership_percentage}
                    onChange={(e) => updateSCILink(index, 'ownership_percentage', e.target.value)}
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="50.00"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none text-sm"
                  />
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tantièmes</label>
                  <input
                    type="number"
                    value={link.tantiemes}
                    onChange={(e) => updateSCILink(index, 'tantiemes', e.target.value)}
                    placeholder="1000"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none text-sm"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => removeSCILink(index)}
                  className="mt-6 text-red-600 hover:text-red-800"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end space-x-3 pt-4 border-t">
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
