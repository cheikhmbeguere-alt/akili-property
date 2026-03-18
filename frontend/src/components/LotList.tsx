import { useState } from 'react'
import toast from 'react-hot-toast'
import Protect from './Protect'
import Pagination, { usePagination } from './Pagination'

const PAGE_SIZE = 25

interface LotListProps {
  lotList: any[]
  onEdit: (lot: any) => void
  onDelete: (id: number) => Promise<void>
  onRefresh: () => void
}

export default function LotList({ lotList, onEdit, onDelete, onRefresh }: LotListProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const { paged, page, setPage, total, pageSize } = usePagination(lotList, PAGE_SIZE)

  const handleDelete = async (id: number, code: string) => {
    if (!confirm(`Supprimer le lot "${code}" ?`)) return
    setDeletingId(id)
    try {
      await onDelete(id)
      toast.success('Lot supprimé')
      onRefresh()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erreur lors de la suppression')
    } finally {
      setDeletingId(null)
    }
  }

  const lotsByImmeuble = paged.reduce((acc: any, lot: any) => {
    const key = lot.immeuble_id
    if (!acc[key]) acc[key] = { immeuble_code: lot.immeuble_code, immeuble_name: lot.immeuble_name, lots: [] }
    acc[key].lots.push(lot)
    return acc
  }, {})

  if (lotList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <span style={{ fontSize: '40px' }}>🔑</span>
        <p className="text-sm font-medium mt-3" style={{ color: '#1a1a1a' }}>Aucun lot</p>
        <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>Commencez par créer votre premier lot.</p>
      </div>
    )
  }

  return (
    <div>
      {Object.entries(lotsByImmeuble).map(([immeubleId, data]: any) => (
        <div key={immeubleId}>
          {/* Sous-header immeuble */}
          <div className="px-4 py-2 flex items-center gap-2" style={{ backgroundColor: '#fdf8f6', borderBottom: '1px solid #ede9e6' }}>
            <span style={{ fontSize: '13px' }}>🏢</span>
            <span className="text-xs font-semibold" style={{ color: '#978A47' }}>{data.immeuble_code} · {data.immeuble_name}</span>
            <span className="text-xs" style={{ color: '#9ca3af' }}>— {data.lots.length} lot{data.lots.length > 1 ? 's' : ''}</span>
          </div>
          <table className="min-w-full">
            <thead>
              <tr style={{ backgroundColor: '#fdf8f6', borderBottom: '1px solid #ede9e6' }}>
                {['Code', 'Nom', 'Surface', 'Étage', 'Type', 'Statut', ''].map((h) => (
                  <th key={h} className={`px-4 py-3 text-xs font-medium uppercase tracking-wider ${h === '' ? 'text-right' : 'text-left'}`} style={{ color: '#9ca3af' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.lots.map((lot: any) => (
                <tr key={lot.id} className="table-row-hover" style={{ borderBottom: '1px solid #ede9e6' }}>
                  <td className="px-4 py-3 text-sm font-medium whitespace-nowrap" style={{ color: '#1a1a1a' }}>{lot.code}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: '#1a1a1a' }}>{lot.name || '–'}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: '#6b7280' }}>{lot.surface} m²</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: '#6b7280' }}>{lot.floor !== null ? `Ét. ${lot.floor}` : '–'}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap capitalize" style={{ color: '#6b7280' }}>{lot.type}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {lot.bail_status === 'actif'
                      ? <span className="badge-actif">Loué</span>
                      : <span className="badge-vacant">Vacant</span>}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap text-right space-x-3">
                    <Protect minRole="editor">
                      <button onClick={() => onEdit(lot)} className="text-sm font-medium transition-colors" style={{ color: '#978A47' }}>Modifier</button>
                    </Protect>
                    <Protect minRole="admin">
                      <button onClick={() => handleDelete(lot.id, lot.code)} disabled={deletingId === lot.id} className="text-sm font-medium disabled:opacity-40 transition-colors" style={{ color: '#dc2626' }}>
                        {deletingId === lot.id ? '...' : 'Supprimer'}
                      </button>
                    </Protect>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className="px-4">
        <Pagination total={total} page={page} pageSize={pageSize} onPage={setPage} />
      </div>
    </div>
  )
}
