import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sciAPI, immeublesAPI, lotsAPI, locatairesAPI, bauxAPI, exportAPI } from '../services/api'
import { useSci } from '../context/SciContext'
import SCIForm from '../components/SCIForm'
import SCIList from '../components/SCIList'
import ImmeubleForm from '../components/ImmeubleForm'
import ImmeubleList from '../components/ImmeubleList'
import LotForm from '../components/LotForm'
import LotList from '../components/LotList'
import LocataireForm from '../components/LocataireForm'
import LocataireList from '../components/LocataireList'
import BailForm from '../components/BailForm'
import BailList from '../components/BailList'
import ImportBaux from '../components/ImportBaux'
import SortieLocataireModal from '../components/SortieLocataireModal'

type TabType = 'sci' | 'immeubles' | 'lots' | 'locataires' | 'baux'

const tabs: { key: TabType; label: string; emoji: string }[] = [
  { key: 'sci', label: 'SCI', emoji: '🏛️' },
  { key: 'immeubles', label: 'Immeubles', emoji: '🏢' },
  { key: 'lots', label: 'Lots', emoji: '🔑' },
  { key: 'locataires', label: 'Locataires', emoji: '👤' },
  { key: 'baux', label: 'Baux', emoji: '📋' },
]

export default function EtatLocatif() {
  const [activeTab, setActiveTab] = useState<TabType>('sci')
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [editingBailId, setEditingBailId] = useState<number | null>(null)
  const [sortieModal, setSortieModal] = useState<number | null>(null)
  const [exportDate, setExportDate] = useState(() => new Date().toISOString().split('T')[0])
  const [exporting, setExporting] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const queryClient = useQueryClient()
  const { selectedSciId } = useSci()
  const sciFilter = selectedSciId ? { sci_id: selectedSciId } : undefined

  // Fetch données fraîches du bail à modifier (évite les données périmées du cache liste)
  const { data: freshBailData, isLoading: loadingBailEdit } = useQuery({
    queryKey: ['bail-edit', editingBailId],
    queryFn: async () => (await bauxAPI.getById(editingBailId!)).data,
    enabled: !!editingBailId,
    staleTime: 0,
  })

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportAPI.etatLocatif(exportDate)
    } catch (e) {
      alert('Erreur lors de l\'export Excel')
    } finally {
      setExporting(false)
    }
  }

  const { data: sciListAll = [], isLoading: loadingSCI, refetch: refetchSCI } = useQuery({
    queryKey: ['sci'],
    queryFn: async () => (await sciAPI.getAll()).data
  })
  // Quand une SCI est sélectionnée, filtrer la liste SCI aussi
  const sciList = selectedSciId
    ? sciListAll.filter((s: any) => s.id === selectedSciId)
    : sciListAll
  const { data: immeubleList = [], isLoading: loadingImmeubles, refetch: refetchImmeubles } = useQuery({
    queryKey: ['immeubles', selectedSciId],
    queryFn: async () => (await immeublesAPI.getAll(sciFilter)).data
  })
  const { data: lotList = [], isLoading: loadingLots, refetch: refetchLots } = useQuery({
    queryKey: ['lots', selectedSciId],
    queryFn: async () => (await lotsAPI.getAll(sciFilter)).data
  })
  const { data: locataireList = [], isLoading: loadingLocataires, refetch: refetchLocataires } = useQuery({
    queryKey: ['locataires', selectedSciId],
    queryFn: async () => (await locatairesAPI.getAll(sciFilter)).data
  })
  const { data: bailList = [], isLoading: loadingBaux, refetch: refetchBaux } = useQuery({
    queryKey: ['baux', selectedSciId],
    queryFn: async () => (await bauxAPI.getAll(sciFilter)).data
  })

  const createSCI = useMutation({ mutationFn: (data: any) => sciAPI.create(data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sci'] }); setShowForm(false) } })
  const updateSCI = useMutation({ mutationFn: ({ id, data }: any) => sciAPI.update(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sci'] }); setShowForm(false); setEditingItem(null) } })
  const deleteSCI = useMutation({ mutationFn: (id: number) => sciAPI.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sci'] }) })

  const createImmeuble = useMutation({ mutationFn: (data: any) => immeublesAPI.create(data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['immeubles'] }); setShowForm(false) } })
  const updateImmeuble = useMutation({ mutationFn: ({ id, data }: any) => immeublesAPI.update(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['immeubles'] }); setShowForm(false); setEditingItem(null) } })
  const deleteImmeuble = useMutation({ mutationFn: (id: number) => immeublesAPI.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['immeubles'] }) })

  const createLot = useMutation({ mutationFn: (data: any) => lotsAPI.create(data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lots'] }); setShowForm(false) } })
  const updateLot = useMutation({ mutationFn: ({ id, data }: any) => lotsAPI.update(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lots'] }); setShowForm(false); setEditingItem(null) } })
  const deleteLot = useMutation({ mutationFn: (id: number) => lotsAPI.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lots'] }) })

  const createLocataire = useMutation({ mutationFn: (data: any) => locatairesAPI.create(data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['locataires'] }); setShowForm(false) } })
  const updateLocataire = useMutation({ mutationFn: ({ id, data }: any) => locatairesAPI.update(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['locataires'] }); setShowForm(false); setEditingItem(null) } })
  const deleteLocataire = useMutation({ mutationFn: (id: number) => locatairesAPI.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['locataires'] }) })

  const createBail = useMutation({ mutationFn: (data: any) => bauxAPI.create(data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['baux'] }); queryClient.invalidateQueries({ queryKey: ['lots'] }); setShowForm(false) } })
  const updateBail = useMutation({ mutationFn: ({ id, data }: any) => bauxAPI.update(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['baux'] }); queryClient.invalidateQueries({ queryKey: ['bail-edit'] }); setShowForm(false); setEditingItem(null); setEditingBailId(null) } })
  const deleteBail = useMutation({ mutationFn: (id: number) => bauxAPI.delete(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['baux'] }); queryClient.invalidateQueries({ queryKey: ['lots'] }) } })

  const handleSubmit = async (data: any) => {
    if (activeTab === 'sci') editingItem ? await updateSCI.mutateAsync({ id: editingItem.id, data }) : await createSCI.mutateAsync(data)
    else if (activeTab === 'immeubles') editingItem ? await updateImmeuble.mutateAsync({ id: editingItem.id, data }) : await createImmeuble.mutateAsync(data)
    else if (activeTab === 'lots') editingItem ? await updateLot.mutateAsync({ id: editingItem.id, data }) : await createLot.mutateAsync(data)
    else if (activeTab === 'locataires') editingItem ? await updateLocataire.mutateAsync({ id: editingItem.id, data }) : await createLocataire.mutateAsync(data)
    else editingItem ? await updateBail.mutateAsync({ id: editingItem.id, data }) : await createBail.mutateAsync(data)
  }

  const handleEdit = (item: any) => {
    setEditingItem(item)
    setShowForm(true)
    if (activeTab === 'baux') setEditingBailId(item.id)
  }
  const handleCancel = () => { setShowForm(false); setEditingItem(null); setEditingBailId(null) }
  const handleDelete = async (id: number) => {
    if (activeTab === 'sci') await deleteSCI.mutateAsync(id)
    else if (activeTab === 'immeubles') await deleteImmeuble.mutateAsync(id)
    else if (activeTab === 'lots') await deleteLot.mutateAsync(id)
    else if (activeTab === 'locataires') await deleteLocataire.mutateAsync(id)
    else await deleteBail.mutateAsync(id)
  }
  const handleTabChange = (tab: TabType) => { setActiveTab(tab); setShowForm(false); setEditingItem(null); setEditingBailId(null) }

  const isLoading = activeTab === 'sci' ? loadingSCI : activeTab === 'immeubles' ? loadingImmeubles : activeTab === 'lots' ? loadingLots : activeTab === 'locataires' ? loadingLocataires : loadingBaux
  const bailsActifs = bailList.filter((b: any) => b.status === 'actif').length

  const addLabel = activeTab === 'sci' ? '+ Nouvelle SCI' : activeTab === 'immeubles' ? '+ Nouvel Immeuble' : activeTab === 'lots' ? '+ Nouveau Lot' : activeTab === 'locataires' ? '+ Nouveau Locataire' : '+ Nouveau Bail'

  const formTitle = editingItem
    ? (activeTab === 'sci' ? 'Modifier la SCI' : activeTab === 'immeubles' ? "Modifier l'immeuble" : activeTab === 'lots' ? 'Modifier le lot' : activeTab === 'locataires' ? 'Modifier le locataire' : 'Modifier le bail')
    : (activeTab === 'sci' ? 'Créer une nouvelle SCI' : activeTab === 'immeubles' ? 'Créer un nouvel immeuble' : activeTab === 'lots' ? 'Créer un nouveau lot' : activeTab === 'locataires' ? 'Créer un nouveau locataire' : 'Créer un nouveau bail')

  const statCards = [
    { label: 'SCI', value: sciList.length, emoji: '🏛️' },
    { label: 'Immeubles', value: immeubleList.length, emoji: '🏢' },
    { label: 'Lots', value: lotList.length, emoji: '🔑' },
    { label: 'Locataires', value: locataireList.length, emoji: '👤' },
    { label: 'Baux actifs', value: bailsActifs, emoji: '📋' },
  ]

  const CARD_THEMES = [
    { card: 'metric-card-1', value: 'metric-value-1', icon: 'metric-icon-1' },
    { card: 'metric-card-2', value: 'metric-value-2', icon: 'metric-icon-2' },
    { card: 'metric-card-4', value: 'metric-value-4', icon: 'metric-icon-4' },
    { card: 'metric-card-1', value: 'metric-value-1', icon: 'metric-icon-1' },
    { card: 'metric-card-2', value: 'metric-value-2', icon: 'metric-icon-2' },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24" fill="none" style={{ color: '#978A47' }}>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <p className="text-sm" style={{ color: '#6b7280' }}>Chargement...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* En-tête */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-5">
        <div>
          <h2 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>État Locatif</h2>
          <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>Gestion de vos SCI, immeubles, lots, locataires et baux</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Export Excel */}
          <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-1.5" style={{ borderColor: '#e5e1d5' }}>
            <span className="text-xs" style={{ color: '#9ca3af' }}>📅</span>
            <input
              type="date"
              value={exportDate}
              onChange={e => setExportDate(e.target.value)}
              className="text-sm border-0 outline-none bg-transparent"
              style={{ color: '#1a1a1a', width: '120px' }}
            />
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn-secondary text-xs px-2.5 py-1"
              style={{ opacity: exporting ? 0.6 : 1 }}
            >
              {exporting ? '⏳ Export...' : '📊 Excel'}
            </button>
          </div>
          <button
            onClick={() => { if (showForm) { handleCancel() } else { setShowForm(true) } }}
            className="btn-primary text-sm"
          >
            {showForm ? '✕ Annuler' : addLabel}
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {statCards.map((s, idx) => {
          const t = CARD_THEMES[idx]
          return (
            <div
              key={s.label}
              className={`rounded-xl p-3.5 border flex items-center gap-3 cursor-pointer transition-all duration-150 hover:opacity-90 ${t.card}`}
              onClick={() => handleTabChange(s.label.toLowerCase().replace('baux actifs', 'baux').replace('é', 'e') as TabType)}
            >
              <div className={`rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${t.icon}`}
                style={{ width: '34px', height: '34px' }}>
                {s.emoji}
              </div>
              <div>
                <div className={`text-lg font-bold ${t.value}`}>{s.value}</div>
                <div className="text-xs" style={{ color: '#9ca3af' }}>{s.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Onglets */}
      <div className="border-b mb-4 overflow-x-auto" style={{ borderColor: '#e5e1d5' }}>
        <nav className="flex gap-0 min-w-max">
          {tabs.map((tab) => {
            const count = tab.key === 'sci' ? sciList.length : tab.key === 'immeubles' ? immeubleList.length : tab.key === 'lots' ? lotList.length : tab.key === 'locataires' ? locataireList.length : bailList.length
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-medium border-b-2 transition-all duration-150 whitespace-nowrap"
                style={{
                  borderColor: isActive ? '#978A47' : 'transparent',
                  color: isActive ? '#978A47' : '#64748b',
                }}
              >
                <span style={{ fontSize: '12px' }}>{tab.emoji}</span>
                {tab.label}
                <span
                  className="text-xs px-1 sm:px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: isActive ? '#F5F0DC' : '#f1f5f9',
                    color: isActive ? '#978A47' : '#94a3b8',
                    fontSize: '10px',
                  }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="card p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>{formTitle}</h3>
            <button
              onClick={handleCancel}
              className="text-sm px-3 py-1.5 rounded-md transition-colors"
              style={{ color: '#6b7280', backgroundColor: '#f3f4f6' }}
            >
              ✕
            </button>
          </div>
          {activeTab === 'sci' ? <SCIForm onSubmit={handleSubmit} onCancel={handleCancel} initialData={editingItem} isEdit={!!editingItem} />
            : activeTab === 'immeubles' ? <ImmeubleForm onSubmit={handleSubmit} onCancel={handleCancel} initialData={editingItem} isEdit={!!editingItem} />
            : activeTab === 'lots' ? <LotForm onSubmit={handleSubmit} onCancel={handleCancel} initialData={editingItem} isEdit={!!editingItem} />
            : activeTab === 'locataires' ? <LocataireForm onSubmit={handleSubmit} onCancel={handleCancel} initialData={editingItem} isEdit={!!editingItem} />
            : loadingBailEdit
              ? <div className="flex items-center gap-2 py-4 text-sm" style={{ color: '#9ca3af' }}>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  Chargement du bail…
                </div>
              : <BailForm
                  key={freshBailData ? `bail-${editingBailId}-loaded` : `bail-${editingBailId}`}
                  onSubmit={handleSubmit}
                  onCancel={handleCancel}
                  initialData={freshBailData || editingItem}
                  isEdit={!!editingItem}
                />}
        </div>
      )}

      {/* Liste */}
      <div className="card">
        <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: '#e5e1d5' }}>
          <h3 className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>
            {activeTab === 'sci' ? 'Liste des SCI' : activeTab === 'immeubles' ? 'Liste des immeubles' : activeTab === 'lots' ? 'Liste des lots' : activeTab === 'locataires' ? 'Liste des locataires' : 'Liste des baux'}
          </h3>
          {activeTab === 'baux' && (
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: '#9ca3af' }}>
                {bailsActifs} actif{bailsActifs > 1 ? 's' : ''} · {bailList.length} total
              </span>
              <button
                onClick={() => setShowImport(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors"
                style={{ borderColor: '#978A47', color: '#978A47' }}>
                📥 Import Excel
              </button>
            </div>
          )}
        </div>
        <div>
          {activeTab === 'sci' ? <SCIList sciList={sciList} onEdit={handleEdit} onDelete={handleDelete} onRefresh={refetchSCI} />
            : activeTab === 'immeubles' ? <ImmeubleList immeubleList={immeubleList} onEdit={handleEdit} onDelete={handleDelete} onRefresh={refetchImmeubles} />
            : activeTab === 'lots' ? <LotList lotList={lotList} onEdit={handleEdit} onDelete={handleDelete} onRefresh={refetchLots} />
            : activeTab === 'locataires' ? <LocataireList locataireList={locataireList} onEdit={handleEdit} onDelete={handleDelete} onRefresh={refetchLocataires} />
            : <BailList bailList={bailList} onEdit={handleEdit} onDelete={handleDelete} onRefresh={refetchBaux} onSortie={(bailId) => setSortieModal(bailId)} />}
        </div>
      </div>

      {/* Modal sortie locataire */}
      {sortieModal !== null && (
        <SortieLocataireModal
          bailId={sortieModal}
          onClose={() => setSortieModal(null)}
          onSuccess={() => {
            setSortieModal(null)
            refetchBaux()
            queryClient.invalidateQueries({ queryKey: ['lots', selectedSciId] })
          }}
        />
      )}

      {/* Import Excel modal */}
      {showImport && (
        <ImportBaux
          onClose={() => setShowImport(false)}
          onImported={() => { queryClient.invalidateQueries({ queryKey: ['baux'] }); setShowImport(false) }}
        />
      )}

      {/* Message prérequis */}
      {activeTab === 'baux' && (lotList.length === 0 || locataireList.length === 0) && (
        <div className="mt-4 p-4 rounded-xl flex items-start gap-3" style={{ backgroundColor: '#fef3c7', border: '1px solid #fde68a' }}>
          <span style={{ fontSize: '16px' }}>⚠️</span>
          <div>
            <p className="text-sm font-medium" style={{ color: '#92400e' }}>Prérequis manquants</p>
            <p className="text-sm mt-0.5" style={{ color: '#b45309' }}>
              Vous devez d'abord créer au moins un lot et un locataire avant de pouvoir créer des baux.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
