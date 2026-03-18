import { useState } from 'react'
import toast from 'react-hot-toast'
import Protect from './Protect'
import Pagination, { usePagination } from './Pagination'

const PAGE_SIZE = 20

interface ImmeubleListProps {
  immeubleList: any[]
  onEdit: (immeuble: any) => void
  onDelete: (id: number) => Promise<void>
  onRefresh: () => void
}

export default function ImmeubleList({ immeubleList, onEdit, onDelete, onRefresh }: ImmeubleListProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const { paged, page, setPage, total, pageSize } = usePagination(immeubleList, PAGE_SIZE)

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Supprimer l'immeuble "${name}" ?`)) return
    setDeletingId(id)
    try {
      await onDelete(id)
      toast.success('Immeuble supprimé')
      onRefresh()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erreur lors de la suppression')
    } finally {
      setDeletingId(null)
    }
  }

  if (immeubleList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <span style={{ fontSize: '40px' }}>🏢</span>
        <p className="text-sm font-medium mt-3" style={{ color: '#1a1a1a' }}>Aucun immeuble</p>
        <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>Commencez par créer votre premier immeuble.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr style={{ backgroundColor: '#fdf8f6', borderBottom: '1px solid #ede9e6' }}>
            {['Code', 'Nom', 'Adresse', 'Surface', 'SCI Propriétaires', ''].map((h) => (
              <th key={h} className={`px-4 py-3 text-xs font-medium uppercase tracking-wider ${h === '' ? 'text-right' : 'text-left'}`} style={{ color: '#9ca3af' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paged.map((immeuble) => (
            <tr key={immeuble.id} className="table-row-hover" style={{ borderBottom: '1px solid #ede9e6' }}>
              <td className="px-4 py-3 text-sm font-medium whitespace-nowrap" style={{ color: '#1a1a1a' }}>{immeuble.code}</td>
              <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: '#1a1a1a' }}>{immeuble.name}</td>
              <td className="px-4 py-3 text-sm max-w-xs truncate" style={{ color: '#6b7280' }}>
                {immeuble.city ? `${immeuble.city} ${immeuble.postal_code}` : immeuble.address || '–'}
              </td>
              <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: '#6b7280' }}>
                {immeuble.total_surface ? `${immeuble.total_surface} m²` : '–'}
              </td>
              <td className="px-4 py-3 text-sm" style={{ color: '#6b7280' }}>
                {immeuble.sci_links?.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {immeuble.sci_links.map((link: any, idx: number) => (
                      <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: '#F5F0DC', color: '#978A47' }}>
                        {link.sci_code}{link.ownership_percentage ? ` ${link.ownership_percentage}%` : ''}
                      </span>
                    ))}
                  </div>
                ) : <span style={{ color: '#d6bcb2' }}>–</span>}
              </td>
              <td className="px-4 py-3 text-sm whitespace-nowrap text-right space-x-3">
                <Protect minRole="editor">
                  <button onClick={() => onEdit(immeuble)} className="text-sm font-medium transition-colors" style={{ color: '#978A47' }}>Modifier</button>
                </Protect>
                <Protect minRole="admin">
                  <button onClick={() => handleDelete(immeuble.id, immeuble.name)} disabled={deletingId === immeuble.id} className="text-sm font-medium disabled:opacity-40 transition-colors" style={{ color: '#dc2626' }}>
                    {deletingId === immeuble.id ? '...' : 'Supprimer'}
                  </button>
                </Protect>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4">
        <Pagination total={total} page={page} pageSize={pageSize} onPage={setPage} />
      </div>
    </div>
  )
}
