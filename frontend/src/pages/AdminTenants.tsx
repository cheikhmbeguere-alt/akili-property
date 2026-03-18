import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { tenantsAPI, adminAPI } from '../services/api'
import { useRole } from '../hooks/useRole'

// ─── Types ───────────────────────────────────────────────────────────────────
interface Tenant {
  id: number
  name: string
  slug: string
  is_active: boolean
  nb_users: number
  nb_sci: number
  created_at: string
}

interface TenantForm {
  name: string
  slug: string
}

interface AdminForm {
  first_name: string
  last_name: string
  email: string
  password: string
}

const emptyTenantForm: TenantForm = { name: '', slug: '' }
const emptyAdminForm: AdminForm   = { first_name: '', last_name: '', email: '', password: '' }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function slugify(str: string) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{
        backgroundColor: active ? '#dcfce7' : '#fee2e2',
        color: active ? '#16a34a' : '#dc2626',
      }}>
      {active ? '● Actif' : '● Inactif'}
    </span>
  )
}

// ─── Page principale ─────────────────────────────────────────────────────────
export default function AdminTenants() {
  const { isSuperAdmin } = useRole()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [showForm, setShowForm]         = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [form, setForm]                 = useState<TenantForm>(emptyTenantForm)
  const [adminForm, setAdminForm]       = useState<AdminForm>(emptyAdminForm)
  const [withAdmin, setWithAdmin]       = useState(true)
  const [loading, setLoading]           = useState(false)

  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ['tenants'],
    queryFn:  async () => (await tenantsAPI.getAll()).data,
    enabled:  isSuperAdmin,
  })

  if (!isSuperAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3 py-20">
        <span style={{ fontSize: '40px' }}>🔒</span>
        <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>
          Accès réservé au Super Admin
        </p>
      </div>
    )
  }

  const setF = (field: keyof TenantForm, val: string) =>
    setForm(prev => ({ ...prev, [field]: val }))

  const setA = (field: keyof AdminForm, val: string) =>
    setAdminForm(prev => ({ ...prev, [field]: val }))

  const openCreate = () => {
    setEditingTenant(null)
    setForm(emptyTenantForm)
    setAdminForm(emptyAdminForm)
    setWithAdmin(true)
    setShowForm(true)
  }

  const openEdit = (t: Tenant) => {
    setEditingTenant(t)
    setForm({ name: t.name, slug: t.slug })
    setWithAdmin(false)
    setShowForm(true)
  }

  const handleNameChange = (val: string) => {
    setForm(prev => ({
      name: val,
      slug: editingTenant ? prev.slug : slugify(val),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Nom et identifiant requis')
      return
    }
    setLoading(true)
    try {
      if (editingTenant) {
        await tenantsAPI.update(editingTenant.id, { name: form.name, is_active: editingTenant.is_active })
        toast.success('Client mis à jour')
      } else {
        // 1. Créer le tenant
        const tenantRes = await tenantsAPI.create({ name: form.name, slug: form.slug })
        const newTenantId = tenantRes.data.id
        toast.success(`Client "${form.name}" créé`)

        // 2. Optionnel : créer l'admin du tenant
        if (withAdmin && adminForm.email && adminForm.password) {
          await adminAPI.createUser({
            ...adminForm,
            role: 'admin',
            tenant_id: newTenantId,
          })
          toast.success(`Admin ${adminForm.email} créé`)
        }
      }
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      setShowForm(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (t: Tenant) => {
    try {
      await tenantsAPI.update(t.id, { is_active: !t.is_active })
      toast.success(t.is_active ? 'Client désactivé' : 'Client activé')
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
    } catch {
      toast.error('Erreur')
    }
  }

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400 transition-colors'
  const labelCls = 'block text-xs font-semibold mb-1'

  const totalUsers = tenants.reduce((s, t) => s + Number(t.nb_users), 0)
  const totalScis  = tenants.reduce((s, t) => s + Number(t.nb_sci), 0)

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>Gestion des clients</h1>
          <p className="text-sm mt-0.5" style={{ color: '#9ca3af' }}>
            {tenants.length} client(s) — isolation multi-client
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: '#978A47' }}>
          + Nouveau client
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Clients', value: tenants.length,                    emoji: '🏛️' },
          { label: 'Utilisateurs', value: totalUsers,                    emoji: '👥' },
          { label: 'Sociétés (SCI)', value: totalScis,                   emoji: '🏢' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border p-4 flex items-center gap-3"
            style={{ borderColor: '#e2e8f0' }}>
            <span style={{ fontSize: '24px' }}>{k.emoji}</span>
            <div>
              <p className="text-xl font-bold" style={{ color: '#1a1a1a' }}>{k.value}</p>
              <p className="text-xs" style={{ color: '#9ca3af' }}>{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent"
              style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
          </div>
        ) : tenants.length === 0 ? (
          <div className="py-16 text-center">
            <p style={{ fontSize: '40px' }}>🏛️</p>
            <p className="text-sm mt-2" style={{ color: '#9ca3af' }}>Aucun client — cliquez sur "Nouveau client"</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#faf9f7', borderBottom: '1px solid #ede9e6' }}>
                  {['Client', 'Identifiant', 'Utilisateurs', 'Sociétés', 'Statut', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: '#9ca3af' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id} className="border-b" style={{ borderColor: '#f5f3f0' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: '#978A47' }}>
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold" style={{ color: '#1a1a1a' }}>{t.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                        {t.slug}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate('/admin/utilisateurs', { state: { filterTenant: t.id } })}
                        className="text-sm font-semibold hover:underline"
                        style={{ color: '#978A47' }}>
                        {t.nb_users} utilisateur{Number(t.nb_users) !== 1 ? 's' : ''}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm" style={{ color: '#6b7280' }}>
                      {t.nb_sci} société{Number(t.nb_sci) !== 1 ? 's' : ''}
                    </td>
                    <td className="px-4 py-3"><StatusBadge active={t.is_active} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button onClick={() => openEdit(t)}
                          className="text-sm font-medium" style={{ color: '#978A47' }}>
                          Modifier
                        </button>
                        <button onClick={() => toggleActive(t)}
                          className="text-sm font-medium"
                          style={{ color: t.is_active ? '#ef4444' : '#16a34a' }}>
                          {t.is_active ? 'Désactiver' : 'Activer'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal create / edit */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            <h2 className="text-base font-bold mb-5" style={{ color: '#1a1a1a' }}>
              {editingTenant ? `Modifier "${editingTenant.name}"` : 'Nouveau client'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nom */}
              <div>
                <label className={labelCls} style={{ color: '#374151' }}>Nom du client *</label>
                <input
                  required
                  value={form.name}
                  onChange={e => handleNameChange(e.target.value)}
                  className={inputCls} style={{ borderColor: '#e2e8f0' }}
                  placeholder="Société de Gestion XYZ" />
              </div>

              {/* Slug (uniquement à la création) */}
              {!editingTenant && (
                <div>
                  <label className={labelCls} style={{ color: '#374151' }}>Identifiant unique *</label>
                  <input
                    required
                    value={form.slug}
                    onChange={e => setF('slug', slugify(e.target.value))}
                    className={inputCls} style={{ borderColor: '#e2e8f0' }}
                    placeholder="client-xyz" />
                  <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                    Généré automatiquement — ne peut pas être modifié après création
                  </p>
                </div>
              )}

              {/* Compte admin (création uniquement) */}
              {!editingTenant && (
                <div className="rounded-xl border p-4" style={{ borderColor: '#e2e8f0', backgroundColor: '#faf9f7' }}>
                  <label className="flex items-center gap-2 cursor-pointer mb-3">
                    <input type="checkbox" checked={withAdmin} onChange={e => setWithAdmin(e.target.checked)}
                      style={{ accentColor: '#978A47' }} />
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6b7280' }}>
                      👤 Créer un administrateur pour ce client
                    </span>
                  </label>

                  {withAdmin && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls} style={{ color: '#374151' }}>Prénom</label>
                          <input value={adminForm.first_name} onChange={e => setA('first_name', e.target.value)}
                            className={inputCls} style={{ borderColor: '#e2e8f0' }} placeholder="Marie" />
                        </div>
                        <div>
                          <label className={labelCls} style={{ color: '#374151' }}>Nom</label>
                          <input value={adminForm.last_name} onChange={e => setA('last_name', e.target.value)}
                            className={inputCls} style={{ borderColor: '#e2e8f0' }} placeholder="Martin" />
                        </div>
                      </div>
                      <div>
                        <label className={labelCls} style={{ color: '#374151' }}>Email admin</label>
                        <input type="email" value={adminForm.email} onChange={e => setA('email', e.target.value)}
                          className={inputCls} style={{ borderColor: '#e2e8f0' }} placeholder="admin@client.fr" />
                      </div>
                      <div>
                        <label className={labelCls} style={{ color: '#374151' }}>Mot de passe (min. 8 car.)</label>
                        <input type="password" value={adminForm.password} onChange={e => setA('password', e.target.value)}
                          className={inputCls} style={{ borderColor: '#e2e8f0' }} placeholder="••••••••" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border"
                  style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>
                  Annuler
                </button>
                <button type="submit" disabled={loading}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: '#978A47' }}>
                  {loading ? '…' : editingTenant ? 'Mettre à jour' : 'Créer le client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
