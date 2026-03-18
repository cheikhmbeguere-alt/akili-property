import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sciAPI } from '../services/api'

interface SciItem {
  id: number
  name: string
  code: string
}

interface SciContextType {
  sciList: SciItem[]
  selectedSciId: number | null  // null = toutes les SCI
  setSelectedSciId: (id: number | null) => void
  isLoading: boolean
}

const SciContext = createContext<SciContextType>({
  sciList: [],
  selectedSciId: null,
  setSelectedSciId: () => {},
  isLoading: false,
})

export const useSci = () => useContext(SciContext)

const STORAGE_KEY = 'akili_selected_sci'

export function SciProvider({ children }: { children: ReactNode }) {
  const [selectedSciId, setSelectedSciIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? parseInt(stored) : null
  })

  const { data: sciList = [], isLoading } = useQuery<SciItem[]>({
    queryKey: ['sci-list-global'],
    queryFn: () => sciAPI.getAll().then(r => r.data),
    staleTime: 5 * 60_000,
  })

  // Si l'utilisateur n'a accès qu'à une seule SCI → la sélectionner automatiquement
  useEffect(() => {
    if (sciList.length === 1 && selectedSciId === null) {
      setSelectedSciIdState(sciList[0].id)
      localStorage.setItem(STORAGE_KEY, String(sciList[0].id))
    }
    // Si la SCI sélectionnée n'est plus accessible → reset
    if (selectedSciId !== null && sciList.length > 0) {
      const stillAllowed = sciList.some((s: SciItem) => s.id === selectedSciId)
      if (!stillAllowed) {
        setSelectedSciIdState(null)
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [sciList])

  const setSelectedSciId = (id: number | null) => {
    setSelectedSciIdState(id)
    if (id === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(id))
  }

  return (
    <SciContext.Provider value={{ sciList, selectedSciId, setSelectedSciId, isLoading }}>
      {children}
    </SciContext.Provider>
  )
}
