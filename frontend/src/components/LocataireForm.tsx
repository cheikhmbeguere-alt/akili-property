import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

interface LocataireFormProps {
  onSubmit: (data: any) => Promise<void>
  onCancel: () => void
  initialData?: any
  isEdit?: boolean
}

export default function LocataireForm({ onSubmit, onCancel, initialData, isEdit = false }: LocataireFormProps) {
  const [formData, setFormData] = useState({
    code: '',
    type: 'entreprise',
    company_name: '',
    siret: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postal_code: '',
    tva_number: '',
    notes: ''
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (initialData) {
      setFormData({
        code: initialData.code || '',
        type: initialData.type || 'entreprise',
        company_name: initialData.company_name || '',
        siret: initialData.siret || '',
        first_name: initialData.first_name || '',
        last_name: initialData.last_name || '',
        email: initialData.email || '',
        phone: initialData.phone || '',
        address: initialData.address || '',
        city: initialData.city || '',
        postal_code: initialData.postal_code || '',
        tva_number: initialData.tva_number || '',
        notes: initialData.notes || ''
      })
    }
  }, [initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.code) {
      toast.error('Le code est obligatoire')
      return
    }

    if (formData.type === 'entreprise' && !formData.company_name) {
      toast.error('Le nom de l\'entreprise est obligatoire')
      return
    }

    if (formData.type === 'particulier' && (!formData.first_name || !formData.last_name)) {
      toast.error('Le prénom et le nom sont obligatoires pour un particulier')
      return
    }

    setLoading(true)
    try {
      await onSubmit(formData)
      toast.success(isEdit ? 'Locataire modifié avec succès' : 'Locataire créé avec succès')
      if (!isEdit) {
        setFormData({
          code: '',
          type: 'entreprise',
          company_name: '',
          siret: '',
          first_name: '',
          last_name: '',
          email: '',
          phone: '',
          address: '',
          city: '',
          postal_code: '',
          tva_number: '',
          notes: ''
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Type de locataire */}
      <div>
        <h4 className="text-md font-medium text-gray-900 mb-4">Type de locataire</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Code Locataire <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="code"
              value={formData.code}
              onChange={handleChange}
              disabled={isEdit}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none disabled:bg-gray-100"
              placeholder="Ex: LOC001"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">
              Type <span className="text-red-500">*</span>
            </label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
            >
              <option value="entreprise">Entreprise</option>
              <option value="particulier">Particulier</option>
            </select>
          </div>
        </div>
      </div>

      {/* Informations Entreprise */}
      {formData.type === 'entreprise' && (
        <div>
          <h4 className="text-md font-medium text-gray-900 mb-4">Informations de l'entreprise</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Raison sociale <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                required={formData.type === 'entreprise'}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
                placeholder="Ex: SARL Exemple"
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
        </div>
      )}

      {/* Informations Particulier */}
      {formData.type === 'particulier' && (
        <div>
          <h4 className="text-md font-medium text-gray-900 mb-4">Informations personnelles</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Prénom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                required={formData.type === 'particulier'}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
                placeholder="Jean"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                required={formData.type === 'particulier'}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
                placeholder="Dupont"
              />
            </div>
          </div>
        </div>
      )}

      {/* Contact */}
      <div>
        <h4 className="text-md font-medium text-gray-900 mb-4">Contact</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
              placeholder="contact@exemple.fr"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Téléphone
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
              placeholder="01 23 45 67 89"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">
              Adresse
            </label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
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
              placeholder="Paris"
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
              placeholder="75001"
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Notes
        </label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={3}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none"
          placeholder="Informations complémentaires"
        />
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
