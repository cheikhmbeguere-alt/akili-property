import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { adminAPI, sciAPI, tenantsAPI } from '../services/api'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../hooks/useAuth'

type Role = 'viewer' | 'editor' | 'admin' | 'superadmin'

const ROLE_CONFIG: Record<Role, { label: string; color: string; bg: string; desc: string }> = {
  viewer:     { label: 'Lecteur',        color: '#6b7280', bg: '#f1f5f9', desc: 'Lecture seule — aucune action' },
  editor:     { label: 'Éditeur',        color: '#978A47', bg: '#F5F0DC', desc: 'Créer et modifier — pas de suppression' },
  admin:      { label: 'Administrateur', color: '#1a1a1a', bg: '#e2e8f0', desc: 'Accès complet + gestion des utilisateurs' },
  superadmin: { label: 'Super Admin',    color: '#7c3aed', bg: '#ede9fe', desc: 'Accès cross-tenant — AKILI uniquement' },
}

function RoleBadge({ role }: { role: Role }) {
  const c = ROLE_CONFIG[role] ?? ROLE_CONFIG.viewer
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
      style={{ backgroundColor: c.bg, color: c.color }}>
      {c.label}
    </span>
  )
}

interface UserFormData {
  first_name: string; last_name: string; email: string
  password: string; role: Role; tenant_id: number | ''
}

const emptyForm: UserFormData = {
  first_name: '', last_name: '', email: '', password: '', role: 'viewer', tenant_id: ''
}

export default function AdminUsers() {
  const { isAdmin, isSuperAdmin } = useRole()
  const { user: me } = useAuth()
  const queryClient = useQueryClient()

  const [showForm, setShowForm]         = useState(false)
  const [editingUser, setEditingUser]   = useState<any>(null)
  const [form, setForm]                 = useState<UserFormData>(emptyForm)
  const [loading, setLoading]           = useState(false)
  const [sciPerms, setSciPerms]         = useState<number[]>([])
  const [sciPermsLoading, setSciPermsLoading] = useState(false)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => (await adminAPI.getUsers()).data,
    enabled: isAdmin,
  })

  const { data: allScis = [] } = useQuery({
    queryKey: ['all-scis-admin'],
    queryFn: async () => (await sciAPI.getAll()).data,
    enabled: isAdmin,
  })

  const { data: allTenants = [] } = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => (await tenantsAPI.getAll()).data,
    enabled: isSuperAdmin,
  })

  if (!isAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3 py-20">
        <span style={{ fontSize: '40px' }}>🔒</span>
        <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>Accès réservé aux administrateurs</p>
      </div>
    )
  }

  const set = (field: keyof UserFormData, val: string) =>
    setForm(prev => ({ ...prev, [field]: val }))

  const openCreate = () => {
    setEditingUser(null)
    setForm(emptyForm)
    setSciPerms([])
    setShowForm(true)
  }

  const openEdit = async (u: any) => {
    setEditingUser(u)
    setForm({ first_name: u.first_name, last_name: u.last_name, email: u.email, password: '', role: u.role, tenant_id: '' })
    setSciPerms([])
    setSciPermsLoading(true)
    setShowForm(true)
    try {
      const res = await adminAPI.getSciPermissions(u.id)
      setSciPerms(res.data.sci_ids ?? [])
    } catch {
      // ignore
    } finally {
      setSciPermsLoading(false)
    }
  }

  const toggleSciPerm = (sciId: number) => {
    setSciPerms(prev =>
      prev.includes(sciId) ? prev.filter(id => id !== sciId) : [...prev, sciId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (editingUser) {
        const payload: any = { first_name: form.first_name, last_name: form.last_name, role: form.role }
        if (form.password) payload.password = form.password
        await adminAPI.updateUser(editingUser.id, payload)
        // Sauvegarder les permissions SCI (sauf pour les admins — ils ont tout par défaut)
        if (form.role !== 'admin') {
          await adminAPI.setSciPermissions(editingUser.id, sciPerms)
        }
        toast.success('Utilisateur mis à jour')
      } else {
        const res = await adminAPI.createUser(form)
        // Pour un nouvel utilisateur non-admin, sauvegarder les permissions SCI
        if (form.role !== 'admin' && res.data?.id) {
          await adminAPI.setSciPermissions(res.data.id, sciPerms)
        }
        toast.success('Utilisateur créé')
      }
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setShowForm(false)
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (u: any) => {
    if (u.id === me?.id) {
      toast.error('Vous ne pouvez pas désactiver votre propre compte')
      return
    }
    try {
      await adminAPI.updateUser(u.id, { is_active: !u.is_active })
      toast.success(u.is_active ? 'Compte désactivé' : 'Compte activé')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    } catch {
      toast.error('Erreur')
    }
  }

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-stone-400 transition-colors'
  const labelCls = 'block text-xs font-semibold mb-1'

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>Gestion des utilisateurs</h1>
          <p className="text-sm mt-0.5" style={{ color: '#9ca3af' }}>
            {users.length} compte(s) — accès et rôles
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: '#1a1a1a' }}
        >
          + Nouvel utilisateur
        </button>
      </div>

      {/* Légende des rôles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {(['viewer', 'editor', 'admin'] as Role[]).map(role => {
          const c = ROLE_CONFIG[role]
          return (
            <div key={role} className="rounded-xl border p-3 flex items-start gap-3"
              style={{ borderColor: '#e2e8f0' }}>
              <RoleBadge role={role} />
              <p className="text-xs leading-relaxed" style={{ color: '#6b7280' }}>{c.desc}</p>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent"
              style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#faf9f7', borderBottom: '1px solid #ede9e6' }}>
                  {['Utilisateur', 'Email', ...(isSuperAdmin ? ['Client'] : []), 'Rôle', 'Statut', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: '#9ca3af' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id} className="border-b" style={{ borderColor: '#f5f3f0' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: '#978A47', width: '28px', height: '28px' }}>
                          {u.first_name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <span className="font-medium" style={{ color: '#1a1a1a' }}>
                          {u.first_name} {u.last_name}
                          {u.id === me?.id && (
                            <span className="ml-1 text-xs" style={{ color: '#9ca3af' }}>(vous)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: '#6b7280' }}>{u.email}</td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: '#F5F0DC', color: '#978A47' }}>
                          {u.tenant_name ?? '—'}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: u.is_active ? '#dcfce7' : '#fee2e2',
                          color: u.is_active ? '#16a34a' : '#dc2626',
                        }}>
                        {u.is_active ? '● Actif' : '● Inactif'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button onClick={() => openEdit(u)}
                          className="text-sm font-medium" style={{ color: '#978A47' }}>
                          Modifier
                        </button>
                        {u.id !== me?.id && (
                          <button onClick={() => toggleActive(u)}
                            className="text-sm font-medium" style={{ color: u.is_active ? '#ef4444' : '#16a34a' }}>
                            {u.is_active ? 'Désactiver' : 'Activer'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-5" style={{ color: '#1a1a1a' }}>
              {editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} style={{ color: '#374151' }}>Prénom *</label>
                  <input required value={form.first_name} onChange={e => set('first_name', e.target.value)}
                    className={inputCls} style={{ borderColor: '#e2e8f0' }} placeholder="Jean" />
                </div>
                <div>
                  <label className={labelCls} style={{ color: '#374151' }}>Nom *</label>
                  <input required value={form.last_name} onChange={e => set('last_name', e.target.value)}
                    className={inputCls} style={{ borderColor: '#e2e8f0' }} placeholder="Dupont" />
                </div>
              </div>
              {!editingUser && (
                <div>
                  <label className={labelCls} style={{ color: '#374151' }}>Email *</label>
                  <input required type="email" value={form.email} onChange={e => set('email', e.target.value)}
                    className={inputCls} style={{ borderColor: '#e2e8f0' }} placeholder="jean@exemple.com" />
                </div>
              )}
              {!editingUser && isSuperAdmin && (
                <div>
                  <label className={labelCls} style={{ color: '#374151' }}>Client *</label>
                  <select
                    required
                    value={form.tenant_id}
                    onChange={e => set('tenant_id', e.target.value)}
                    className={inputCls} style={{ borderColor: '#e2e8f0', backgroundColor: '#fff' }}>
                    <option value="">— Choisir un client —</option>
                    {allTenants.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls} style={{ color: '#374151' }}>
                  Mot de passe {editingUser ? '(laisser vide = inchangé)' : '*'}
                </label>
                <input type="password" required={!editingUser} value={form.password}
                  onChange={e => set('password', e.target.value)}
                  className={inputCls} style={{ borderColor: '#e2e8f0' }}
                  placeholder={editingUser ? '••••••••' : 'Min. 8 caractères'} />
              </div>
              <div>
                <label className={labelCls} style={{ color: '#374151' }}>Rôle *</label>
                <select value={form.role} onChange={e => set('role', e.target.value as Role)}
                  disabled={editingUser?.id === me?.id}
                  className={inputCls} style={{ borderColor: '#e2e8f0', backgroundColor: '#fff' }}>
                  {(['viewer', 'editor', 'admin'] as Role[]).map(role => {
                    const c = ROLE_CONFIG[role]
                    return <option key={role} value={role}>{c.label} — {c.desc}</option>
                  })}
                </select>
                {editingUser?.id === me?.id && (
                  <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                    Vous ne pouvez pas modifier votre propre rôle
                  </p>
                )}
              </div>

              {/* SCI Permissions */}
              <div className="rounded-xl border p-4" style={{ borderColor: '#e2e8f0', backgroundColor: '#faf9f7' }}>
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ fontSize: '16px' }}>🏢</span>
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#6b7280' }}>
                    Accès aux sociétés
                  </span>
                </div>
                {form.role === 'admin' ? (
                  <p className="text-xs" style={{ color: '#6b7280' }}>
                    Les administrateurs ont accès à toutes les sociétés par défaut.
                  </p>
                ) : sciPermsLoading ? (
                  <div className="flex items-center gap-2 py-1">
                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-t-transparent"
                      style={{ borderColor: '#978A47', borderTopColor: 'transparent' }} />
                    <span className="text-xs" style={{ color: '#9ca3af' }}>Chargement…</span>
                  </div>
                ) : allScis.length === 0 ? (
                  <p className="text-xs" style={{ color: '#9ca3af' }}>Aucune société créée.</p>
                ) : (
                  <div className="space-y-2">
                    {allScis.map((sci: any) => (
                      <label key={sci.id} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={sciPerms.includes(sci.id)}
                          onChange={() => toggleSciPerm(sci.id)}
                          className="rounded"
                          style={{ accentColor: '#978A47' }}
                        />
                        <span className="text-sm" style={{ color: '#374151' }}>
                          {sci.name}
                        </span>
                        {sci.siret && (
                          <span className="text-xs" style={{ color: '#9ca3af' }}>
                            {sci.siret}
                          </span>
                        )}
                      </label>
                    ))}
                    <p className="text-xs mt-2" style={{ color: '#9ca3af' }}>
                      {sciPerms.length === 0
                        ? '⚠️ Aucun accès — cet utilisateur ne verra aucune donnée'
                        : `✓ ${sciPerms.length} société(s) autorisée(s)`}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border"
                  style={{ borderColor: '#e2e8f0', color: '#6b7280' }}>
                  Annuler
                </button>
                <button type="submit" disabled={loading}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: '#1a1a1a' }}>
                  {loading ? '…' : editingUser ? 'Mettre à jour' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
