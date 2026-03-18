import { useAuth } from './useAuth'

export type Role = 'viewer' | 'editor' | 'admin' | 'superadmin'

export function useRole() {
  const { user } = useAuth()
  const role = (user?.role ?? 'viewer') as Role

  return {
    role,
    isViewer:     role === 'viewer',
    canEdit:      role === 'editor' || role === 'admin' || role === 'superadmin',
    canDelete:    role === 'admin' || role === 'superadmin',
    isAdmin:      role === 'admin' || role === 'superadmin',
    isSuperAdmin: role === 'superadmin',
  }
}
