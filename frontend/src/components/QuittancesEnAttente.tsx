import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { quittancesAPI } from '../services/api'

const TYPE_DOC_LABELS: Record<string, string> = {
  quittance:   'Quittance',
  facture:     'Facture',
  appel_loyer: 'Appel de loyer',
}

const TYPE_DOC_COLORS: Record<string, { bg: string; color: string }> = {
  quittance:   { bg: '#d1fae5', color: '#065f46' },
  facture:     { bg: '#dbeafe', color: '#1d4ed8' },
  appel_loyer: { bg: '#fef3c7', color: '#92400e' },
}

const formatEur = (val: any) =>
  parseFloat(val || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

interface Props {
  bailId: number
  colSpan?: number
}

export default function QuittancesEnAttente({ bailId, colSpan = 9 }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['quittances-emises', bailId],
    queryFn: async () => {
      const res = await quittancesAPI.getAll({ bail_id: bailId, status: 'emis' })
      return res.data?.quittances || res.data || []
    },
  })

  const handlePdf = async (id: number, code: string) => {
    try {
      const res = await quittancesAPI.getPDF(id)
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a   = document.createElement('a')
      a.href     = url
      a.download = `${code}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erreur lors du téléchargement du PDF')
    }
  }

  if (isLoading) return (
    <tr>
      <td colSpan={colSpan} className="px-8 py-3">
        <div className="flex items-center gap-2 text-xs" style={{ color: '#9ca3af' }}>
          <div className="animate-spin rounded-full h-3 w-3 border border-t-transparent"
            style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
          Chargement des factures…
        </div>
      </td>
    </tr>
  )

  const quittances: any[] = Array.isArray(data) ? data : []

  if (quittances.length === 0) return (
    <tr>
      <td colSpan={colSpan} className="px-8 py-3">
        <p className="text-xs italic" style={{ color: '#9ca3af' }}>Aucune facture en attente.</p>
      </td>
    </tr>
  )

  return (
    <tr>
      <td colSpan={colSpan} className="px-0 pt-0 pb-0">
        <div className="mx-4 mb-3 rounded-lg overflow-hidden border" style={{ borderColor: '#e2e8f0' }}>
          {/* Titre */}
          <div className="px-4 py-2" style={{ backgroundColor: '#f8f7f4' }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6b7280' }}>
              📄 Factures / Quittances en attente ({quittances.length})
            </p>
          </div>
          {/* Table */}
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: '#faf9f7', borderBottom: '1px solid #ede9e6' }}>
                {['N° Document', 'Type', 'Période', 'Échéance', 'Montant TTC', 'PDF'].map(h => (
                  <th key={h} className="px-4 py-2 text-left font-semibold uppercase tracking-wide whitespace-nowrap"
                    style={{ color: '#9ca3af' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quittances.map((q: any) => {
                const typeColors = TYPE_DOC_COLORS[q.type_document] || { bg: '#f3f4f6', color: '#6b7280' }
                const debut      = q.period_start
                  ? new Date(q.period_start).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
                  : '—'
                const echeance   = q.due_date
                  ? new Date(q.due_date).toLocaleDateString('fr-FR')
                  : '—'
                return (
                  <tr key={q.id} className="border-b" style={{ borderColor: '#f5f3f0' }}>
                    <td className="px-4 py-2 font-medium" style={{ color: '#1a1a1a' }}>
                      {q.code || `#${q.id}`}
                    </td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: typeColors.bg, color: typeColors.color }}>
                        {TYPE_DOC_LABELS[q.type_document] || q.type_document}
                      </span>
                    </td>
                    <td className="px-4 py-2" style={{ color: '#6b7280' }}>{debut}</td>
                    <td className="px-4 py-2" style={{ color: '#6b7280' }}>{echeance}</td>
                    <td className="px-4 py-2 font-semibold" style={{ color: '#dc2626' }}>
                      {formatEur(q.total_ttc)}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handlePdf(q.id, q.code || `quittance-${q.id}`)}
                        className="text-xs px-2 py-1 rounded border transition-colors hover:bg-gray-50"
                        style={{ color: '#978A47', borderColor: '#e2e8f0' }}
                        title="Télécharger le PDF"
                      >
                        ⬇ PDF
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  )
}
