import { useState } from 'react'
import toast from 'react-hot-toast'
import Protect from './Protect'

interface SCIListProps {
  sciList: any[]
  onEdit: (sci: any) => void
  onDelete: (id: number) => Promise<void>
  onRefresh: () => void
}

export default function SCIList({ sciList, onEdit, onDelete, onRefresh }: SCIListProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Supprimer la SCI "${name}" ?`)) return
    setDeletingId(id)
    try {
      await onDelete(id)
      toast.success('SCI supprimée')
      onRefresh()
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erreur lors de la suppression')
    } finally {
      setDeletingId(null)
    }
  }

  if (sciList.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <span style={{ fontSize: '40px' }}>🏛️</span>
        <p className="text-sm font-medium mt-3" style={{ color: '#1a1a1a' }}>Aucune SCI</p>
        <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>Commencez par créer votre première SCI.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr style={{ backgroundColor: '#fdf8f6', borderBottom: '1px solid #ede9e6' }}>
            {['Code', 'Nom', 'SIRET', 'Adresse', 'N° TVA', ''].map((h) => (
              <th key={h} className={`px-4 py-3 text-xs font-medium uppercase tracking-wider ${h === '' ? 'text-right' : 'text-left'}`} style={{ color: '#9ca3af' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sciList.map((sci) => (
            <tr key={sci.id} className="table-row-hover" style={{ borderBottom: '1px solid #ede9e6' }}>
              <td className="px-4 py-3 text-sm font-medium whitespace-nowrap" style={{ color: '#1a1a1a' }}>{sci.code}</td>
              <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: '#1a1a1a' }}>{sci.name}</td>
              <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: '#6b7280' }}>{sci.siret || '–'}</td>
              <td className="px-4 py-3 text-sm max-w-xs truncate" style={{ color: '#6b7280' }}>{sci.address || '–'}</td>
              <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: '#6b7280' }}>{sci.tva_number || '–'}</td>
              <td className="px-4 py-3 text-sm whitespace-nowrap text-right space-x-3">
                <Protect minRole="editor">
                  <button onClick={() => onEdit(sci)} className="text-sm font-medium transition-colors" style={{ color: '#978A47' }}>Modifier</button>
                </Protect>
                <Protect minRole="admin">
                  <button onClick={() => handleDelete(sci.id, sci.name)} disabled={deletingId === sci.id} className="text-sm font-medium disabled:opacity-40 transition-colors" style={{ color: '#dc2626' }}>
                    {deletingId === sci.id ? '...' : 'Supprimer'}
                  </button>
                </Protect>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
