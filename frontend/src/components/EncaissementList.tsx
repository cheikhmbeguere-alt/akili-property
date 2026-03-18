import { useState, useEffect } from 'react'
import { encaissementsAPI } from '../services/api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import Protect from './Protect'
import Pagination, { usePagination } from './Pagination'

const PAGE_SIZE = 25

interface Props {
  list: any[]
  onEdit: (item: any) => void
  onRefresh: () => void
}

const METHODE_LABELS: Record<string, string> = {
  virement: 'Virement',
  cheque: 'Chèque',
  prelevement: 'Prélèvement',
  especes: 'Espèces',
  carte: 'Carte',
}

const MOIS_FR = ['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
const TYPE_LABELS: Record<string, string> = {
  quittance: 'Quittance', appel_loyer: 'Appel loyer', facture: 'Facture'
}

function fmtEur(n: any) {
  return parseFloat(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'
}

function SourceBadge({ source }: { source: string }) {
  if (source === 'pennylane' || source === 'import_csv') {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
        style={{ backgroundColor: '#F5F0DC', color: '#978A47' }}>
        📥 Import
      </span>
    )
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}>
      ✏️ Manuel
    </span>
  )
}

// ─── Modal Lettrage ───────────────────────────────────────────────────────────
function LettrageModal({ encaissement, onClose, onSuccess }: {
  encaissement: any
  onClose: () => void
  onSuccess: () => void
}) {
  const [quittances, setQuittances] = useState<any[]>([])
  const [lettrages, setLettrages]   = useState<any[]>([])
  const [selected, setSelected]     = useState<number[]>([])
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([
      encaissementsAPI.getQuittancesDisponibles(encaissement.id),
      encaissementsAPI.getLettrage(encaissement.id),
    ]).then(([q, l]) => {
      setQuittances(q.data || [])
      setLettrages(l.data || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [encaissement.id])

  const toggle = (id: number) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleLettrer = async () => {
    if (!selected.length) return
    setSubmitting(true)
    try {
      const res = await encaissementsAPI.lettrer(encaissement.id, selected)
      toast.success(`${res.data.nb_lettres} quittance(s) lettrée(s) et marquée(s) payées`)
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteLettrage = async (lettrageId: number) => {
    try {
      await encaissementsAPI.deleteLettrage(encaissement.id, lettrageId)
      toast.success('Lettrage annulé — quittance remise en émis')
      setLettrages(prev => prev.filter(l => l.id !== lettrageId))
      onSuccess()
    } catch {
      toast.error('Erreur')
    }
  }

  const encNom = encaissement.locataire_type === 'entreprise'
    ? encaissement.locataire_company
    : [encaissement.locataire_first_name, encaissement.locataire_last_name].filter(Boolean).join(' ')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="mb-5">
          <h2 className="text-base font-bold" style={{ color: '#1a1a1a' }}>Lettrage</h2>
          <p className="text-sm mt-0.5" style={{ color: '#6b7280' }}>
            {encNom} · <span className="font-semibold" style={{ color: '#978A47' }}>
              {fmtEur(encaissement.amount)}
            </span>
            {' '}du {format(new Date(encaissement.payment_date), 'd MMM yyyy', { locale: fr })}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-t-transparent"
              style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <>
            {/* Lettrages existants */}
            {lettrages.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#6b7280' }}>
                  ✅ Déjà lettrés
                </p>
                <div className="space-y-2">
                  {lettrages.map(l => {
                    const d = new Date(l.period_start)
                    return (
                      <div key={l.id} className="flex items-center justify-between rounded-lg px-3 py-2"
                        style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                        <div>
                          <span className="text-sm font-medium" style={{ color: '#166534' }}>
                            {l.quittance_code}
                          </span>
                          <span className="text-xs ml-2" style={{ color: '#6b7280' }}>
                            {MOIS_FR[d.getMonth() + 1]} {d.getFullYear()}
                          </span>
                        </div>
                        <Protect minRole="editor">
                          <button onClick={() => handleDeleteLettrage(l.id)}
                            className="text-xs font-medium" style={{ color: '#ef4444' }}>
                            Délettrer
                          </button>
                        </Protect>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Quittances disponibles */}
            {quittances.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm" style={{ color: '#9ca3af' }}>
                  {lettrages.length > 0
                    ? 'Toutes les quittances émises sont déjà lettrées.'
                    : 'Aucune quittance émise à lettrer pour ce bail.'}
                </p>
                <button onClick={onClose} className="mt-4 px-4 py-2 text-sm font-medium rounded-lg border"
                  style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>
                  Fermer
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#6b7280' }}>
                  Quittances à lettrer
                </p>
                <div className="space-y-2 mb-5">
                  {quittances.map(q => {
                    const d = new Date(q.period_start)
                    const checked = selected.includes(q.id)
                    return (
                      <label key={q.id}
                        className="flex items-center justify-between rounded-lg px-3 py-2.5 cursor-pointer transition-colors"
                        style={{
                          backgroundColor: checked ? '#F5F0DC' : '#faf9f7',
                          border: `1px solid ${checked ? '#978A47' : '#e2e8f0'}`,
                        }}>
                        <div className="flex items-center gap-3">
                          <input type="checkbox" checked={checked} onChange={() => toggle(q.id)}
                            style={{ accentColor: '#978A47' }} />
                          <div>
                            <span className="text-sm font-medium" style={{ color: '#1a1a1a' }}>
                              {TYPE_LABELS[q.type_document] || q.type_document}
                            </span>
                            <span className="text-xs ml-2" style={{ color: '#6b7280' }}>
                              {MOIS_FR[d.getMonth() + 1]} {d.getFullYear()}
                            </span>
                          </div>
                        </div>
                        <span className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>
                          {fmtEur(q.total_ttc)}
                        </span>
                      </label>
                    )
                  })}
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg border"
                    style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>
                    Annuler
                  </button>
                  <Protect minRole="editor">
                    <button onClick={handleLettrer} disabled={!selected.length || submitting}
                      className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-40"
                      style={{ backgroundColor: '#978A47' }}>
                      {submitting ? '…' : `Lettrer (${selected.length})`}
                    </button>
                  </Protect>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function EncaissementList({ list, onEdit, onRefresh }: Props) {
  const [deletingId, setDeletingId]   = useState<number | null>(null)
  const [lettrageEnc, setLettrageEnc] = useState<any | null>(null)
  const { paged, page, setPage, total, pageSize } = usePagination(list, PAGE_SIZE)

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer cet encaissement ?')) return
    setDeletingId(id)
    try {
      await encaissementsAPI.delete(id)
      toast.success('Encaissement supprimé')
      onRefresh()
    } catch {
      toast.error('Erreur lors de la suppression')
    } finally {
      setDeletingId(null)
    }
  }

  if (!list.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <span style={{ fontSize: '40px' }}>💸</span>
        <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>Aucun encaissement enregistré</p>
        <p className="text-xs" style={{ color: '#9ca3af' }}>Ajoutez un paiement manuellement ou importez via Pennylane</p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: '#faf9f7', borderBottom: '1px solid #ede9e6' }}>
              {['Date', 'Locataire', 'Bail / Lot', 'Montant', 'Méthode', 'Source', 'Lettrage', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                  style={{ color: '#9ca3af' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((e) => {
              const nom = e.locataire_type === 'entreprise'
                ? e.locataire_company || '—'
                : [e.locataire_first_name, e.locataire_last_name].filter(Boolean).join(' ') || '—'
              const dateStr = e.payment_date
                ? format(new Date(e.payment_date), 'd MMM yyyy', { locale: fr })
                : '—'
              const lettragesCount = Array.isArray(e.lettrages) ? e.lettrages.length : 0
              const isLettre = lettragesCount > 0

              return (
                <tr key={e.id} className="table-row-hover border-b" style={{ borderColor: '#f5f3f0' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: '#1a1a1a' }}>{dateStr}</td>
                  <td className="px-4 py-3" style={{ color: '#374151' }}>{nom}</td>
                  <td className="px-4 py-3">
                    {e.bail_code
                      ? <span className="text-xs font-medium" style={{ color: '#978A47' }}>{e.bail_code} · {e.lot_name || e.lot_code}</span>
                      : <span style={{ color: '#9ca3af' }}>—</span>
                    }
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: '#1a1a1a' }}>
                    {parseFloat(e.amount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                  </td>
                  <td className="px-4 py-3" style={{ color: '#6b7280' }}>
                    {METHODE_LABELS[e.payment_method] || e.payment_method || '—'}
                  </td>
                  <td className="px-4 py-3"><SourceBadge source={e.source || 'manuel'} /></td>
                  {/* Colonne lettrage */}
                  <td className="px-4 py-3">
                    {e.bail_id ? (
                      <button onClick={() => setLettrageEnc(e)}
                        className="text-xs px-2 py-0.5 rounded-full font-medium transition-colors"
                        style={{
                          backgroundColor: isLettre ? '#dcfce7' : '#fef3c7',
                          color: isLettre ? '#166534' : '#92400e',
                        }}>
                        {isLettre ? `✅ ${lettragesCount} lettrée(s)` : '🔗 Lettrer'}
                      </button>
                    ) : (
                      <span className="text-xs" style={{ color: '#d1d5db' }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Protect minRole="editor">
                        <button onClick={() => onEdit(e)} className="text-sm font-medium transition-colors"
                          style={{ color: '#978A47' }}>Modifier</button>
                      </Protect>
                      <Protect minRole="admin">
                        <button onClick={() => handleDelete(e.id)}
                          disabled={deletingId === e.id}
                          className="text-sm font-medium transition-colors disabled:opacity-40"
                          style={{ color: '#ef4444' }}>
                          {deletingId === e.id ? '…' : 'Supprimer'}
                        </button>
                      </Protect>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-4">
          <Pagination total={total} page={page} pageSize={pageSize} onPage={setPage} />
        </div>
      </div>

      {/* Modal lettrage */}
      {lettrageEnc && (
        <LettrageModal
          encaissement={lettrageEnc}
          onClose={() => setLettrageEnc(null)}
          onSuccess={onRefresh}
        />
      )}
    </>
  )
}
