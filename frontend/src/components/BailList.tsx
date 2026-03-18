import { useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import Protect from './Protect'
import Pagination, { usePagination } from './Pagination'

const PAGE_SIZE = 20

interface BailListProps {
  bailList: any[]
  onEdit: (bail: any) => void
  onDelete: (id: number) => Promise<void>
  onRefresh: () => void
  onSortie?: (bailId: number) => void
}

export default function BailList({ bailList, onEdit, onDelete, onRefresh, onSortie }: BailListProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const { paged, page, setPage, total, pageSize } = usePagination(bailList, PAGE_SIZE)

  const handleDelete = async (id: number, code: string) => {
    if (!confirm(`Supprimer le bail "${code}" ?`)) return
    setDeletingId(id)
    try {
      await onDelete(id)
      toast.success('Bail supprimé')
      onRefresh()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erreur lors de la suppression')
    } finally {
      setDeletingId(null)
    }
  }

  if (bailList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <span style={{ fontSize: '40px' }}>📋</span>
        <p className="text-sm font-medium mt-3" style={{ color: '#1a1a1a' }}>Aucun bail</p>
        <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>Commencez par créer votre premier bail.</p>
      </div>
    )
  }

  const frequencyLabel: Record<string, string> = {
    mensuel: 'Mens.',
    trimestriel: 'Trim.',
    annuel: 'Ann.',
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr style={{ backgroundColor: '#fdf8f6', borderBottom: '1px solid #ede9e6' }}>
            {['Code', 'Lot', 'Locataire', 'Loyer HT', 'Fréq.', 'Début', 'Fin', 'Statut', ''].map((h) => (
              <th key={h} className={`px-4 py-3 text-xs font-medium uppercase tracking-wider ${h === '' ? 'text-right' : 'text-left'}`} style={{ color: '#9ca3af' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paged.map((bail) => (
            <tr key={bail.id} className="table-row-hover" style={{ borderBottom: '1px solid #ede9e6' }}>
              <td className="px-4 py-3 text-sm font-medium whitespace-nowrap" style={{ color: '#1a1a1a' }}>{bail.code}</td>
              <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: '#1a1a1a' }}>
                <span className="font-medium">{bail.lot_code}</span>
                <span className="ml-1 text-xs" style={{ color: '#9ca3af' }}>{bail.immeuble_code}</span>
              </td>
              <td className="px-4 py-3 text-sm" style={{ color: '#1a1a1a' }}>
                {bail.locataire_type === 'entreprise' ? bail.locataire_company_name : `${bail.locataire_first_name} ${bail.locataire_last_name}`}
              </td>
              <td className="px-4 py-3 text-sm whitespace-nowrap font-medium" style={{ color: '#1a1a1a' }}>
                {parseFloat(bail.loyer_ht).toLocaleString('fr-FR')} €
              </td>
              <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: '#6b7280' }}>
                {frequencyLabel[bail.quittancement_frequency] || bail.quittancement_frequency}
              </td>
              <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: '#6b7280' }}>
                {format(new Date(bail.start_date), 'dd/MM/yyyy')}
              </td>
              <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: '#6b7280' }}>
                {bail.end_date ? format(new Date(bail.end_date), 'dd/MM/yyyy') : '–'}
              </td>
              <td className="px-4 py-3 text-sm whitespace-nowrap">
                {bail.status === 'actif'
                  ? <span className="badge-actif">Actif</span>
                  : bail.status === 'terminé'
                  ? <span className="badge-termine">Terminé</span>
                  : <span className="badge-vacant">{bail.status}</span>}
              </td>
              <td className="px-4 py-3 text-sm whitespace-nowrap text-right space-x-3">
                <Protect minRole="editor">
                  <button onClick={() => onEdit(bail)} className="text-sm font-medium transition-colors" style={{ color: '#978A47' }}>Modifier</button>
                </Protect>
                {onSortie && bail.status === 'actif' && (
                  <Protect minRole="editor">
                    <button
                      onClick={() => onSortie(bail.id)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg text-white"
                      style={{ backgroundColor: '#0f172a' }}>
                      🚪 Sortir
                    </button>
                  </Protect>
                )}
                <Protect minRole="admin">
                  <button onClick={() => handleDelete(bail.id, bail.code)} disabled={deletingId === bail.id} className="text-sm font-medium disabled:opacity-40 transition-colors" style={{ color: '#dc2626' }}>
                    {deletingId === bail.id ? '...' : 'Supprimer'}
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
