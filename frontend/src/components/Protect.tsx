import { useRole } from '../hooks/useRole'

interface ProtectProps {
  /** Rôle minimum requis pour afficher le contenu */
  minRole: 'editor' | 'admin'
  children: React.ReactNode
  /** Ce qui s'affiche si l'utilisateur n'a pas les droits (null par défaut) */
  fallback?: React.ReactNode
}

/**
 * Affiche `children` uniquement si l'utilisateur a le rôle requis.
 * Utilisation :
 *   <Protect minRole="editor"><button>Modifier</button></Protect>
 *   <Protect minRole="admin"><button>Supprimer</button></Protect>
 */
export default function Protect({ minRole, children, fallback = null }: ProtectProps) {
  const { canEdit, isAdmin } = useRole()
  const allowed = minRole === 'editor' ? canEdit : isAdmin
  return allowed ? <>{children}</> : <>{fallback}</>
}
