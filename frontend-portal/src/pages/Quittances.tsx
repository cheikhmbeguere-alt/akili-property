import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { getQuittances, getPdfUrl } from '../services/api'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

function formatEur(v: number) {
  return v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

export default function Quittances() {
  const [quittances, setQuittances] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getQuittances()
      .then(setQuittances)
      .catch((err: any) => {
        if (err.response?.status === 401) {
          localStorage.removeItem('portal_token')
          navigate('/')
        } else {
          setError(err.response?.data?.error || 'Erreur de chargement')
        }
      })
      .finally(() => setLoading(false))
  }, [navigate])

  const handleDownload = (id: number) => {
    const token = localStorage.getItem('portal_token')
    const url = getPdfUrl(id)
    // Fetch PDF with auth header then open blob URL
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error('Erreur PDF')
        return r.blob()
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob)
        window.open(blobUrl, '_blank')
      })
      .catch(() => alert('Impossible de télécharger le PDF. Réessayez.'))
  }

  const statusLabel = (status: string) => {
    if (status === 'payé') return <span className="badge-paid">Payé</span>
    return <span className="badge-pending">En attente</span>
  }

  const typeLabel: Record<string, string> = {
    quittance: 'Quittance',
    appel: 'Appel de loyer',
    avoir: 'Avoir',
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <header className="sticky top-0 z-10 px-4 py-4 border-b"
        style={{ backgroundColor: 'white', borderColor: '#e2e8f0' }}>
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link to="/dashboard"
            className="flex items-center justify-center w-9 h-9 rounded-xl border transition-colors"
            style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>
            ←
          </Link>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#0f172a' }}>Mes quittances</p>
            <p className="text-xs" style={{ color: '#9ca3af' }}>Historique & téléchargements</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {loading && (
          <p className="text-center text-sm py-12" style={{ color: '#9ca3af' }}>Chargement…</p>
        )}

        {error && (
          <p className="text-center text-sm py-12" style={{ color: '#be123c' }}>{error}</p>
        )}

        {!loading && !error && quittances.length === 0 && (
          <div className="text-center py-16">
            <span className="text-4xl">📋</span>
            <p className="text-sm font-medium mt-3" style={{ color: '#1a1a1a' }}>Aucune quittance</p>
            <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
              Vos quittances apparaîtront ici dès leur émission.
            </p>
          </div>
        )}

        {!loading && !error && quittances.length > 0 && (
          <div className="space-y-3">
            {quittances.map((q) => (
              <div key={q.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold" style={{ color: '#0f172a' }}>
                        {format(new Date(q.period_start), 'MMMM yyyy', { locale: fr })}
                      </p>
                      {statusLabel(q.status)}
                      {q.type_document && q.type_document !== 'quittance' && (
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}>
                          {typeLabel[q.type_document] || q.type_document}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <p className="text-base font-bold" style={{ color: '#0f172a' }}>
                        {formatEur(q.total_ttc)}
                      </p>
                      {q.due_date && (
                        <p className="text-xs" style={{ color: '#9ca3af' }}>
                          Éch. {format(new Date(q.due_date), 'd MMM yyyy', { locale: fr })}
                        </p>
                      )}
                    </div>
                    {q.is_prorata && (
                      <p className="text-xs mt-1" style={{ color: '#978A47' }}>
                        Au prorata ({q.prorata_jours} j.)
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDownload(q.id)}
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors"
                    style={{ borderColor: '#e2e8f0', color: '#0f172a', backgroundColor: '#f8fafc' }}>
                    📄 PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
