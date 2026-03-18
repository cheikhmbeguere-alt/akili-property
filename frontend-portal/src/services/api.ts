import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const api = axios.create({
  baseURL: `${BASE_URL}/api/portail`,
})

// Inject Bearer token on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('portal_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ─── Auth ────────────────────────────────────────────────────────────────────
export const loginPortail = (email: string) =>
  api.post('/login', { email }).then((r) => r.data)

// ─── Me ──────────────────────────────────────────────────────────────────────
export const getMe = () => api.get('/me').then((r) => r.data)

// ─── Quittances ──────────────────────────────────────────────────────────────
export const getQuittances = () => api.get('/quittances').then((r) => r.data)

export const getPdfUrl = (id: number) =>
  `${BASE_URL}/api/portail/quittances/${id}/pdf`
