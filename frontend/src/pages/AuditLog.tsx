import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminAPI } from '../services/api'
import { useAuth } from '../hooks/useAuth'

// ─── Labels lisibles ──────────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  login:              { label: 'Connexion',           color: '#16a34a', bg: '#f0fdf4' },
  login_microsoft:    { label: 'Connexion Microsoft', color: '#2563eb', bg: '#eff6ff' },
  logout:             { label: 'Déconnexion',         color: '#6b7280', bg: '#f9fafb' },
  create:             { label: 'Création',            color: '#0891b2', bg: '#ecfeff' },
  update:             { label: 'Modification',        color: '#d97706', bg: '#fffbeb' },
  delete:             { label: 'Suppression',         color: '#dc2626', bg: '#fef2f2' },
  generate_pdf:       { label: 'PDF généré',          color: '#7c3aed', bg: '#f5f3ff' },
  send_email:         { label: 'Email envoyé',        color: '#059669', bg: '#ecfdf5' },
  encaissement:       { label: 'Encaissement',        color: '#16a34a', bg: '#f0fdf4' },
  lettrage:           { label: 'Lettrage',            color: '#0891b2', bg: '#ecfeff' },
  indexation:         { label: 'Indexation',          color: '#d97706', bg: '#fffbeb' },
}

const ENTITY_LABELS: Record<string, string> = {
  user:          'Utilisateur',
  bail:          'Bail',
  lot:           'Lot',
  immeuble:      'Immeuble',
  locataire:     'Locataire',
  quittance:     'Quittance',
  encaissement:  'Encaissement',
  sci:           'SCI',
  indexation:    'Indexation',
  relance:       'Relance',
}

const fmtDate = (d: string) => new Date(d).toLocaleString('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
})

export default function AuditLog() {
  const { user } = useAuth()
  const [page, setPage]         = useState(1)
  const [filterUser, setFilterUser]   = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterEntity, setFilterEntity] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  const limit = 50

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, filterUser, filterAction, filterEntity, dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page), limit: String(limit) }
      if (filterUser)   params.user_id     = filterUser
      if (filterAction) params.action      = filterAction
      if (filterEntity) params.entity_type = filterEntity
      if (dateFrom)     params.date_from   = dateFrom
      if (dateTo)       params.date_to     = dateTo
      const res = await adminAPI.getAuditLogs(params)
      return res.data
    },
  })

  if (user?.role !== 'superadmin') {
    return <div className="p-8 text-center text-red-500">Accès réservé au superadmin.</div>
  }

  const logs  = data?.logs  || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / limit)

  const resetFilters = () => {
    setFilterUser(''); setFilterAction(''); setFilterEntity('')
    setDateFrom(''); setDateTo(''); setPage(1)
  }

  return (
    <div className="p-6 max-w-full">
      {/* En-tête */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>Journal d'audit</h1>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
          Toutes les actions effectuées par les utilisateurs — {total.toLocaleString('fr-FR')} entrées
        </p>
      </div>

      {/* Filtres */}
      <div className="rounded-xl border p-4 mb-5 flex flex-wrap gap-3 items-end" style={{ borderColor: '#e5e7eb', backgroundColor: '#fafaf9' }}>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: '#6b7280' }}>Action</label>
          <select
            value={filterAction}
            onChange={e => { setFilterAction(e.target.value); setPage(1) }}
            className="text-sm border rounded-lg px-3 py-1.5"
            style={{ borderColor: '#d1d5db' }}
          >
            <option value="">Toutes</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: '#6b7280' }}>Type d'objet</label>
          <select
            value={filterEntity}
            onChange={e => { setFilterEntity(e.target.value); setPage(1) }}
            className="text-sm border rounded-lg px-3 py-1.5"
            style={{ borderColor: '#d1d5db' }}
          >
            <option value="">Tous</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: '#6b7280' }}>Du</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            className="text-sm border rounded-lg px-3 py-1.5" style={{ borderColor: '#d1d5db' }} />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: '#6b7280' }}>Au</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
            className="text-sm border rounded-lg px-3 py-1.5" style={{ borderColor: '#d1d5db' }} />
        </div>

        <button
          onClick={resetFilters}
          className="text-sm px-3 py-1.5 rounded-lg border"
          style={{ borderColor: '#d1d5db', color: '#6b7280' }}
        >
          Réinitialiser
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#e5e7eb' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: '#f8f7f4', borderBottom: '1px solid #e5e7eb' }}>
                {['Date & heure', 'Utilisateur', 'Action', 'Objet', 'ID', 'IP', 'Détails'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                    style={{ color: '#9ca3af' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: '#9ca3af' }}>
                    Chargement…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm italic" style={{ color: '#9ca3af' }}>
                    Aucune entrée trouvée.
                  </td>
                </tr>
              ) : logs.map((log: any) => {
                const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: '#6b7280', bg: '#f9fafb' }
                const entityLabel = ENTITY_LABELS[log.entity_type] || log.entity_type
                const userName = log.user_email
                  ? `${log.user_first_name || ''} ${log.user_last_name || ''}`.trim() || log.user_email
                  : '—'

                return (
                  <tr key={log.id} className="border-b hover:bg-gray-50 transition-colors"
                    style={{ borderColor: '#f3f4f6' }}>
                    {/* Date */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: '#6b7280' }}>
                      {fmtDate(log.created_at)}
                    </td>
                    {/* Utilisateur */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-xs" style={{ color: '#1a1a1a' }}>{userName}</div>
                      {log.user_email && (
                        <div className="text-xs" style={{ color: '#9ca3af' }}>{log.user_email}</div>
                      )}
                    </td>
                    {/* Action */}
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                        style={{ backgroundColor: actionInfo.bg, color: actionInfo.color }}>
                        {actionInfo.label}
                      </span>
                    </td>
                    {/* Objet */}
                    <td className="px-4 py-3 text-xs" style={{ color: '#374151' }}>
                      {entityLabel}
                    </td>
                    {/* ID */}
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: '#9ca3af' }}>
                      {log.entity_id || '—'}
                    </td>
                    {/* IP */}
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: '#9ca3af' }}>
                      {log.ip_address?.replace('::ffff:', '') || '—'}
                    </td>
                    {/* Détails */}
                    <td className="px-4 py-3 text-xs" style={{ color: '#6b7280', maxWidth: '200px' }}>
                      {log.details
                        ? <span className="truncate block" title={JSON.stringify(log.details)}>
                            {Object.entries(log.details as Record<string, any>)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(', ')
                              .substring(0, 60)}
                            {JSON.stringify(log.details).length > 60 ? '…' : ''}
                          </span>
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: '#e5e7eb', backgroundColor: '#fafaf9' }}>
            <span className="text-xs" style={{ color: '#6b7280' }}>
              Page {page} / {totalPages} — {total.toLocaleString('fr-FR')} entrées
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-40"
                style={{ borderColor: '#d1d5db', color: '#374151' }}
              >← Préc.</button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-40"
                style={{ borderColor: '#d1d5db', color: '#374151' }}
              >Suiv. →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
