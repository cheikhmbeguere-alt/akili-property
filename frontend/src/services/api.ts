import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Intercepteur pour ajouter le token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Intercepteur pour gérer les erreurs
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  changePassword: (current_password: string, new_password: string) =>
    api.put('/auth/password', { current_password, new_password }),
}

export const sciAPI = {
  getAll: () => api.get('/sci'),
  getById: (id: number) => api.get(`/sci/${id}`),
  create: (data: any) => api.post('/sci', data),
  update: (id: number, data: any) => api.put(`/sci/${id}`, data),
  delete: (id: number) => api.delete(`/sci/${id}`),
}

export const immeublesAPI = {
  getAll: (params?: { sci_id?: number }) => api.get('/immeubles', { params }),
  getById: (id: number) => api.get(`/immeubles/${id}`),
  create: (data: any) => api.post('/immeubles', data),
  update: (id: number, data: any) => api.put(`/immeubles/${id}`, data),
  delete: (id: number) => api.delete(`/immeubles/${id}`),
}

export const lotsAPI = {
  getAll: (params?: { sci_id?: number }) => api.get('/lots', { params }),
  getById: (id: number) => api.get(`/lots/${id}`),
  getByImmeuble: (immeubleId: number) => api.get(`/lots/immeuble/${immeubleId}`),
  create: (data: any) => api.post('/lots', data),
  update: (id: number, data: any) => api.put(`/lots/${id}`, data),
  delete: (id: number) => api.delete(`/lots/${id}`),
}

export const locatairesAPI = {
  getAll: (params?: { sci_id?: number; search?: string }) => api.get('/locataires', { params }),
  getById: (id: number) => api.get(`/locataires/${id}`),
  create: (data: any) => api.post('/locataires', data),
  update: (id: number, data: any) => api.put(`/locataires/${id}`, data),
  delete: (id: number) => api.delete(`/locataires/${id}`),
}

export const bauxAPI = {
  getAll: (params?: { sci_id?: number; status?: string }) => api.get('/baux', { params }),
  getById: (id: number) => api.get(`/baux/${id}`),
  create: (data: any) => api.post('/baux', data),
  update: (id: number, data: any) => api.put(`/baux/${id}`, data),
  delete: (id: number) => api.delete(`/baux/${id}`),
  importTemplate: () => api.get('/baux/import/template', { responseType: 'blob' }),
  importPreview: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/baux/import/preview', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  importConfirm: (rows: any[]) => api.post('/baux/import/confirm', { rows }),
}

export const quittancesAPI = {
  getAll: (params?: any)                      => api.get('/quittances', { params }),
  getById: (id: number)                       => api.get(`/quittances/${id}`),
  generate: (data: { mois: number; annee: number; bail_ids?: number[] }) =>
                                                 api.post('/quittances/generate', data),
  getPDF: (id: number)                        => api.get(`/quittances/${id}/pdf`, { responseType: 'blob' }),
  markPaid: (id: number, date?: string)       => api.post(`/quittances/${id}/paid`, { date_paiement: date }),
  cancel: (id: number)                        => api.delete(`/quittances/${id}`),
}

export const exportAPI = {
  etatLocatif: async (date: string) => {
    const token = localStorage.getItem('token')
    const baseURL = import.meta.env.VITE_API_URL ?? '/api'
    const response = await fetch(`${baseURL}/export/etat-locatif?date=${date}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!response.ok) throw new Error('Erreur export Excel')
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `etat-locatif-${date}.xlsx`
    a.click()
    window.URL.revokeObjectURL(url)
  },
  fec: async (annee: number, sciId?: number) => {
    const token = localStorage.getItem('token')
    const baseURL = import.meta.env.VITE_API_URL ?? '/api'
    const params = new URLSearchParams({ annee: String(annee) })
    if (sciId) params.append('sci_id', String(sciId))
    const response = await fetch(`${baseURL}/export/fec?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!response.ok) throw new Error('Erreur export FEC')
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `FEC-${annee}${sciId ? `-sci${sciId}` : ''}.txt`
    a.click()
    window.URL.revokeObjectURL(url)
  }
}

export const encaissementsAPI = {
  getAll: (params?: any) => api.get('/encaissements', { params }),
  getById: (id: number) => api.get(`/encaissements/${id}`),
  create: (data: any) => api.post('/encaissements', data),
  update: (id: number, data: any) => api.put(`/encaissements/${id}`, data),
  delete: (id: number) => api.delete(`/encaissements/${id}`),
  importCSV: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/encaissements/import/csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  // Lettrage
  getLettrage:              (id: number) => api.get(`/encaissements/${id}/lettrage`),
  getQuittancesDisponibles: (id: number) => api.get(`/encaissements/${id}/quittances-disponibles`),
  lettrer:    (id: number, quittance_ids: number[]) => api.post(`/encaissements/${id}/lettrer`, { quittance_ids }),
  deleteLettrage: (encId: number, lettrageId: number) => api.delete(`/encaissements/${encId}/lettrer/${lettrageId}`),
}

export const impayesAPI = {
  getReport: () => api.get('/impayes/report'),
  createRelance: (bailId: number, data: any) => api.post(`/impayes/${bailId}/relance`, data),
  getRelances: (bailId: number) => api.get(`/impayes/${bailId}/relances`),
}

export const notificationsAPI = {
  getConfig:           () => api.get('/notifications/config'),
  envoyerRelance:      (bailId: number, type: string) => api.post(`/notifications/relance/${bailId}`, { type }),
  envoyerAlertesEcheance: (jours?: number)            => api.post('/notifications/alertes-echeance', { jours: jours ?? 90 }),
  envoyerResumeMensuel:   (email: string, nom: string) => api.post('/notifications/resume-mensuel', { email, nom }),
}

export const indexationAPI = {
  getAFaire:        ()                                    => api.get('/indexations/a-faire'),
  apply:            (bailId: number, data: any)           => api.post(`/indexations/apply/${bailId}`, data),
  applyBatch:       (items: any[])                        => api.post('/indexations/apply-batch', { items }),
  getHistorique:    ()                                    => api.get('/indexations/historique'),
  getIndices:       ()                                    => api.get('/indexations/indices'),
  getIndiceValues:  (indiceId: number)                    => api.get(`/indexations/indices/${indiceId}/values`),
  addIndiceValue:   (indiceId: number, data: any)         => api.post(`/indexations/indices/${indiceId}/values`, data),
  syncInsee:        ()                                    => api.post('/indexations/sync-insee'),
  getRattrapage:    (bailId: number)                      => api.get(`/indexations/rattrapage/${bailId}`),
}

export const pennylaneAPI = {
  getStatus:        (sciId: number)                        => api.get('/pennylane/token', { params: { sci_id: sciId } }),
  saveToken:        (sciId: number, token: string)         => api.post('/pennylane/token', { sci_id: sciId, token }),
  deleteToken:      (sciId: number)                        => api.delete('/pennylane/token', { params: { sci_id: sciId } }),
  getTransactions:  (sciId: number, params?: any)          => api.get('/pennylane/transactions', { params: { sci_id: sciId, ...params } }),
  importOne:        (data: any)                            => api.post('/pennylane/import', data),
  importBatch:      (items: any[])                         => api.post('/pennylane/import-batch', { items }),
}

export const adminAPI = {
  getUsers: ()                        => api.get('/admin/users'),
  createUser: (data: any)             => api.post('/admin/users', data),
  updateUser: (id: number, data: any) => api.put(`/admin/users/${id}`, data),
  getSciPermissions: (userId: number) => api.get(`/admin/users/${userId}/sci-permissions`),
  setSciPermissions: (userId: number, sci_ids: number[]) =>
    api.put(`/admin/users/${userId}/sci-permissions`, { sci_ids }),
}

export const tenantsAPI = {
  getAll:    ()                        => api.get('/tenants'),
  create:    (data: { name: string; slug: string }) => api.post('/tenants', data),
  update:    (id: number, data: any)   => api.put(`/tenants/${id}`, data),
}

export const depotGarantieAPI = {
  getAll:            ()               => api.get('/depot-garantie'),
  getCalculSortie:   (bailId: number) => api.get(`/depot-garantie/baux/${bailId}/calcul-sortie`),
  enregistrerSortie: (bailId: number, data: any) =>
    api.post(`/depot-garantie/baux/${bailId}/sortie`, data),
  getMouvements:     (bailId: number) => api.get(`/depot-garantie/mouvements/${bailId}`),
}

export const chargesReellesAPI = {
  getAll:           (params?: any)           => api.get('/charges-reelles', { params }),
  create:           (data: any)              => api.post('/charges-reelles', data),
  update:           (id: number, data: any)  => api.put(`/charges-reelles/${id}`, data),
  delete:           (id: number)             => api.delete(`/charges-reelles/${id}`),
  importBatch:      (items: any[])           => api.post('/charges-reelles/import-batch', { items }),
  getRegularisation:(params?: any)           => api.get('/charges-reelles/regularisation', { params }),
}

export const reportsAPI = {
  getEtatLocatif: () => api.get('/reports/etat-locatif'),
  getCompteRenduGestion: (params?: any) => api.get('/reports/compte-rendu-gestion', { params }),
  getVacance: () => api.get('/reports/vacance'),
  exportCRG: async (params: {
    mode?: 'mois' | 'trimestre' | 'annee' | 'date'
    annee?: number
    mois?: number
    trimestre?: number
    date_ref?: string
    immeuble_id?: number
  }) => {
    const token   = localStorage.getItem('token')
    const baseURL = import.meta.env.VITE_API_URL ?? '/api'
    const query   = new URLSearchParams()
    if (params.mode)         query.set('mode',         params.mode)
    if (params.annee)        query.set('annee',        String(params.annee))
    if (params.mois)         query.set('mois',         String(params.mois))
    if (params.trimestre)    query.set('trimestre',    String(params.trimestre))
    if (params.date_ref)     query.set('date_ref',     params.date_ref)
    if (params.immeuble_id)  query.set('immeuble_id',  String(params.immeuble_id))
    const response = await fetch(`${baseURL}/reports/compte-rendu-gestion/export?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw new Error('Erreur export CRG')
    return response.blob()
  },
}

export default api
