import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authAPI } from '../services/api'
import { queryClient } from '../main'

interface User {
  id: number
  email: string
  firstName: string
  lastName: string
  role: 'superadmin' | 'admin' | 'editor' | 'viewer'
  tenantId: number | null
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      authAPI.getMe()
        .then((res) => setUser(res.data))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const res = await authAPI.login(email, password)
    localStorage.setItem('token', res.data.token)
    setUser(res.data.user)
  }

  const logout = async () => {
    try { await authAPI.logout() } catch (_) {}
    localStorage.removeItem('token')
    localStorage.removeItem('akili_selected_sci')
    queryClient.clear()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
