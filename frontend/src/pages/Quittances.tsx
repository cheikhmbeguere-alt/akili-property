import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { quittancesAPI } from '../services/api'
import Protect from '../components/Protect'
import toast from 'react-hot-toast'
import Pagination, { usePagination } from '../components/Pagination'

const PAGE_SIZE = 25

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MOIS_FR = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

const TYPE_DOC_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  facture:     { label: 'Facture',      color: '#1d4ed8', bg: '#dbeafe' },
  appel_loyer: { label: 'Appel loyer',  color: '#92400e', bg: '#fef3c7' },
  quittance:   { label: 'Quittance',    color: '#065f46', bg: '#d1fae5' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  emis:   { label: 'Émis',    color: '#92400e', bg: '#fef3c7' },
  paye:   { label: 'Payé',    color: '#065f46', bg: '#d1fae5' },
  annule: { label: 'Annulé',  color: '#991b1b', bg: '#fee2e2' },
}

function fmt(n: any) {
  return parseFloat(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'
}

function TypeBadge({ type }: { type: string }) {
  const cfg = TYPE_DOC_CONFIG[type] || { label: type, color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ color: cfg.color, backgroundColor: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ color: cfg.color, backgroundColor: cfg.bg }}>
      {cfg.label}
    </span>
  )
}

// ─── Modal génération ─────────────────────────────────────────────────────────
function GenerateModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const now = new Date()
  const [mois, setMois]           = useState(now.getMonth() + 1)
  const [annee, setAnnee]         = useState(now.getFullYear())
  const [touteAnnee, setTouteAnnee] = useState(false)
  const [loading, setLoading]     = useState(false)

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const payload = touteAnnee
        ? { annee, toute_annee: true }
        : { mois, annee }
      const res = await quittancesAPI.generate(payload)
      const { created_count, skipped_count } = res.data
      toast.success(`${created_count} document(s) généré(s) — ${skipped_count} ignoré(s)`)
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur lors de la génération')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold mb-1" style={{ color: '#1a1a1a' }}>
          Générer les documents
        </h2>
        <p className="text-sm mb-5" style={{ color: '#6b7280' }}>
          Génère quittances, appels de loyer et factures pour tous les baux actifs de la période.
        </p>

        {/* Toggle mois / toute l'année */}
        <div className="flex rounded-lg overflow-hidden border mb-5" style={{ borderColor: '#e2e8f0' }}>
          <button
            onClick={() => setTouteAnnee(false)}
            className="flex-1 py-2 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: !touteAnnee ? '#1a1a1a' : 'white',
              color: !touteAnnee ? 'white' : '#6b7280',
            }}>
            Par mois
          </button>
          <button
            onClick={() => setTouteAnnee(true)}
            className="flex-1 py-2 text-xs font-semibold transition-colors"
            style={{
              backgroundColor: touteAnnee ? '#1a1a1a' : 'white',
              color: touteAnnee ? 'white' : '#6b7280',
            }}>
            Toute l'année
          </button>
        </div>

        <div className={`grid gap-4 mb-6 ${touteAnnee ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {!touteAnnee && (
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Mois</label>
              <select value={mois} onChange={e => setMois(parseInt(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: '#e2e8f0' }}>
                {MOIS_FR.slice(1).map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Année</label>
            <input type="number" value={annee} onChange={e => setAnnee(parseInt(e.target.value))}
              min={2020} max={2035}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
              style={{ borderColor: '#e2e8f0' }} />
          </div>
        </div>

        <div className="rounded-lg p-3 mb-5 text-xs" style={{ backgroundColor: '#F5F0DC', color: '#78621e' }}>
          <strong>Type de document généré automatiquement :</strong><br />
          Bail habitation → Quittance · Commercial/Pro sans TVA → Appel de loyer · Avec TVA → Facture
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border"
            style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>
            Annuler
          </button>
          <button onClick={handleGenerate} disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: '#1a1a1a' }}>
            {loading ? 'Génération…' : touteAnnee ? `Générer ${annee} (12 mois)` : `Générer ${MOIS_FR[mois]} ${annee}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function Quittances() {
  const qc = useQueryClient()
  const now = new Date()

  const [filterMois,   setFilterMois]   = useState(now.getMonth() + 1)
  const [filterAnnee,  setFilterAnnee]  = useState(now.getFullYear())
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType,   setFilterType]   = useState('')
  const [showGenModal, setShowGenModal] = useState(false)

  const { data: quittancesAll = [], isLoading } = useQuery({
    queryKey: ['quittances', filterMois, filterAnnee, filterStatus, filterType],
    queryFn: async () => {
      const params: any = { mois: filterMois, annee: filterAnnee }
      if (filterStatus) params.status = filterStatus
      if (filterType)   params.type_document = filterType
      const res = await quittancesAPI.getAll(params)
      return res.data
    },
  })

  const markPaidMutation = useMutation({
    mutationFn: (id: number) => quittancesAPI.markPaid(id),
    onSuccess: () => {
      toast.success('Marqué comme payé')
      qc.invalidateQueries({ queryKey: ['quittances'] })
    },
    onError: () => toast.error('Erreur'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => quittancesAPI.cancel(id),
    onSuccess: () => {
      toast.success('Document annulé')
      qc.invalidateQueries({ queryKey: ['quittances'] })
    },
    onError: () => toast.error('Erreur'),
  })

  const downloadPDF = async (id: number, code: string) => {
    try {
      const res = await quittancesAPI.getPDF(id)
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url; a.download = `${code}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erreur lors du téléchargement PDF')
    }
  }

  // ── KPIs ── (les annulés sont exclus des montants)
  const quittances = quittancesAll
  const actifs   = quittancesAll.filter((q: any) => q.status !== 'annule')
  const annules  = quittancesAll.filter((q: any) => q.status === 'annule').length
  const { paged: quittancesPaged, page: qPage, setPage: setQPage, total: qTotal, pageSize: qPageSize } = usePagination(quittancesAll, PAGE_SIZE)
  const total    = actifs.length
  const emis     = actifs.filter((q: any) => q.status === 'emis').length
  const payes    = actifs.filter((q: any) => q.status === 'paye').length
  const montantTotal = actifs.reduce((s: number, q: any) => s + parseFloat(q.total_ttc || 0), 0)
  const montantEncaisse = actifs
    .filter((q: any) => q.status === 'paye')
    .reduce((s: number, q: any) => s + parseFloat(q.total_ttc || 0), 0)

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>Quittances & Factures</h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
            Génération et suivi des documents locatifs
          </p>
        </div>
        <Protect minRole="editor">
          <button onClick={() => setShowGenModal(true)}
            className="btn-primary flex items-center gap-2 whitespace-nowrap">
            ⚡ Générer la période
          </button>
        </Protect>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Documents actifs', value: total,           sub: annules ? `${annules} annulé${annules > 1 ? 's' : ''} exclu${annules > 1 ? 's' : ''}` : `${MOIS_FR[filterMois]} ${filterAnnee}`, color: '#1d4ed8', bg: '#dbeafe' },
          { label: 'En attente',       value: emis,            sub: 'à encaisser',                               color: '#92400e', bg: '#fef3c7' },
          { label: 'Payés',            value: payes,           sub: `${total ? Math.round(payes/total*100) : 0}% du total`, color: '#065f46', bg: '#d1fae5' },
          { label: 'Montant TTC',      value: fmt(montantTotal), sub: `${fmt(montantEncaisse)} encaissé`,        color: '#6d28d9', bg: '#ede9fe' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl p-4 border"
            style={{ borderColor: '#e2e8f0' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: '#6b7280' }}>{kpi.label}</p>
            <p className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
            <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Filtres ── */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end"
        style={{ borderColor: '#e2e8f0' }}>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Mois</label>
          <select value={filterMois} onChange={e => setFilterMois(parseInt(e.target.value))}
            className="border rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: '#e2e8f0' }}>
            {MOIS_FR.slice(1).map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Année</label>
          <input type="number" value={filterAnnee}
            onChange={e => setFilterAnnee(parseInt(e.target.value))}
            min={2020} max={2035}
            className="border rounded-lg px-3 py-1.5 text-sm outline-none w-24"
            style={{ borderColor: '#e2e8f0' }} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Statut</label>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: '#e2e8f0' }}>
            <option value="">Tous</option>
            <option value="emis">Émis</option>
            <option value="paye">Payé</option>
            <option value="annule">Annulé</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: '#374151' }}>Type</label>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: '#e2e8f0' }}>
            <option value="">Tous</option>
            <option value="facture">Factures</option>
            <option value="appel_loyer">Appels de loyer</option>
            <option value="quittance">Quittances</option>
          </select>
        </div>
      </div>

      {/* ── Liste ── */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-sm" style={{ color: '#9ca3af' }}>Chargement…</div>
          </div>
        ) : quittances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <span style={{ fontSize: 40 }}>📄</span>
            <p className="text-sm font-medium" style={{ color: '#6b7280' }}>
              Aucun document pour {MOIS_FR[filterMois]} {filterAnnee}
            </p>
            <Protect minRole="editor">
              <button onClick={() => setShowGenModal(true)}
                className="btn-primary text-sm mt-1">
                ⚡ Générer maintenant
              </button>
            </Protect>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                  {['N° Document', 'Locataire / Lot', 'Type', 'Montant TTC', 'Échéance', 'Statut', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold"
                      style={{ color: '#6b7280' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quittancesPaged.map((q: any) => {
                  const locName = q.locataire_type === 'entreprise'
                    ? q.company_name
                    : `${q.first_name} ${q.last_name}`
                  const isProrata = q.is_prorata

                  return (
                    <tr key={q.id} style={{ borderBottom: '1px solid #f0f0f0' }}
                      className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>{q.code}</div>
                        <div className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                          Émis le {new Date(q.emission_date).toLocaleDateString('fr-FR')}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium" style={{ color: '#1a1a1a' }}>{locName}</div>
                        <div className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                          {q.immeuble_code} · Lot {q.lot_code}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <TypeBadge type={q.type_document} />
                        {isProrata && (
                          <div className="text-xs mt-1" style={{ color: '#af9500' }}>
                            ⚡ Prorata {q.prorata_jours}j/{q.prorata_total}j
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-bold" style={{ color: '#1a1a1a' }}>
                          {fmt(q.total_ttc)}
                        </div>
                        {parseFloat(q.tva_loyer) + parseFloat(q.tva_charges || 0) > 0 && (
                          <div className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                            dont TVA {fmt(parseFloat(q.tva_loyer) + parseFloat(q.tva_charges || 0))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm" style={{ color: '#374151' }}>
                          {new Date(q.due_date).toLocaleDateString('fr-FR')}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={q.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {/* PDF */}
                          <button
                            onClick={() => downloadPDF(q.id, q.code)}
                            title="Télécharger PDF"
                            className="text-xs px-2.5 py-1 rounded-lg border transition-colors hover:bg-gray-50"
                            style={{ borderColor: '#e2e8f0', color: '#374151' }}>
                            📄 PDF
                          </button>

                          {/* Marquer payé */}
                          <Protect minRole="editor">
                            {q.status === 'emis' && (
                              <button
                                onClick={() => {
                                  if (confirm('Marquer ce document comme payé ?'))
                                    markPaidMutation.mutate(q.id)
                                }}
                                className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                                style={{ backgroundColor: '#d1fae5', color: '#065f46' }}>
                                ✓ Payé
                              </button>
                            )}
                          </Protect>

                          {/* Annuler / Avoir */}
                          <Protect minRole="editor">
                            {q.status !== 'annule' && (
                              <button
                                onClick={() => {
                                  if (confirm('Annuler ce document et émettre un avoir ? Un avoir sera généré pour contrebalancer cette facture.'))
                                    cancelMutation.mutate(q.id)
                                }}
                                title="Annuler / Émettre un avoir"
                                className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                                style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>
                                Annuler
                              </button>
                            )}
                          </Protect>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4">
              <Pagination total={qTotal} page={qPage} pageSize={qPageSize} onPage={setQPage} />
            </div>
          </div>
        )}
      </div>

      {/* ── Modal génération ── */}
      {showGenModal && (
        <GenerateModal
          onClose={() => setShowGenModal(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['quittances'] })}
        />
      )}
    </div>
  )
}
