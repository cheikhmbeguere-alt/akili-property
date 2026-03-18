import { useState } from 'react'
import toast from 'react-hot-toast'
import Protect from './Protect'
import Pagination, { usePagination } from './Pagination'

const PAGE_SIZE = 20

interface LocataireListProps {
  locataireList: any[]
  onEdit: (locataire: any) => void
  onDelete: (id: number) => Promise<void>
  onRefresh: () => void
}

export default function LocataireList({ locataireList, onEdit, onDelete, onRefresh }: LocataireListProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Supprimer le locataire "${name}" ?`)) return
    setDeletingId(id)
    try {
      await onDelete(id)
      toast.success('Locataire supprimé')
      onRefresh()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erreur lors de la suppression')
    } finally {
      setDeletingId(null)
    }
  }

  const filteredList = locataireList.filter((loc) => {
    if (!searchTerm) return true
    const s = searchTerm.toLowerCase()
    return (
      loc.code.toLowerCase().includes(s) ||
      (loc.company_name && loc.company_name.toLowerCase().includes(s)) ||
      (loc.first_name && loc.first_name.toLowerCase().includes(s)) ||
      (loc.last_name && loc.last_name.toLowerCase().includes(s)) ||
      (loc.email && loc.email.toLowerCase().includes(s))
    )
  })

  const { paged, page, setPage, total, pageSize } = usePagination(filteredList, PAGE_SIZE)

  if (locataireList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <span style={{ fontSize: '40px' }}>👤</span>
        <p className="text-sm font-medium mt-3" style={{ color: '#1a1a1a' }}>Aucun locataire</p>
        <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>Commencez par créer votre premier locataire.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Barre de recherche */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid #ede9e6' }}>
        <input
          type="text"
          placeholder="Rechercher par code, nom, email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input-field w-full md:w-80"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr style={{ backgroundColor: '#fdf8f6', borderBottom: '1px solid #ede9e6' }}>
              {['Code', 'Nom', 'Type', 'Contact', 'Ville', 'Baux', ''].map((h) => (
                <th key={h} className={`px-4 py-3 text-xs font-medium uppercase tracking-wider ${h === '' ? 'text-right' : 'text-left'}`} style={{ color: '#9ca3af' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((loc) => {
              const name = loc.type === 'entreprise' ? loc.company_name : `${loc.first_name} ${loc.last_name}`
              return (
                <tr key={loc.id} className="table-row-hover" style={{ borderBottom: '1px solid #ede9e6' }}>
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap" style={{ color: '#1a1a1a' }}>{loc.code}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: '#1a1a1a' }}>{name}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize"
                      style={{ backgroundColor: loc.type === 'entreprise' ? '#e0f2fe' : '#f0fdf4', color: loc.type === 'entreprise' ? '#0369a1' : '#15803d' }}>
                      {loc.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: '#6b7280' }}>{loc.email || loc.phone || '–'}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: '#6b7280' }}>{loc.city || '–'}</td>
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
                    {(loc.active_baux_count || 0) > 0
                      ? <span className="badge-actif">{loc.active_baux_count}</span>
                      : <span style={{ color: '#9ca3af' }}>0</span>}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap text-right space-x-3">
                    <Protect minRole="editor">
                      <button onClick={() => onEdit(loc)} className="text-sm font-medium transition-colors" style={{ color: '#978A47' }}>Modifier</button>
                    </Protect>
                    <Protect minRole="admin">
                      <button onClick={() => handleDelete(loc.id, name)} disabled={deletingId === loc.id} className="text-sm font-medium disabled:opacity-40 transition-colors" style={{ color: '#dc2626' }}>
                        {deletingId === loc.id ? '...' : 'Supprimer'}
                      </button>
                    </Protect>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filteredList.length === 0 && searchTerm && (
          <div className="py-8 text-center text-sm" style={{ color: '#9ca3af' }}>
            Aucun résultat pour « {searchTerm} »
          </div>
        )}
      </div>
      <div className="px-4">
        <Pagination total={total} page={page} pageSize={pageSize} onPage={setPage} />
      </div>
    </div>
  )
}
