import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { SciProvider } from './context/SciContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import EtatLocatif from './pages/EtatLocatif'
import CompteRenduGestion from './pages/CompteRenduGestion'
import Indexations from './pages/Indexations'
import Encaissements from './pages/Encaissements'
import Impayes from './pages/Impayes'
import Quittances from './pages/Quittances'
import AdminUsers from './pages/AdminUsers'
import AdminTenants from './pages/AdminTenants'
import Alertes from './pages/Alertes'
import DepotGarantie from './pages/DepotGarantie'
import RegularisationCharges from './pages/RegularisationCharges'
import ImportGlobal from './pages/ImportGlobal'
import Layout from './components/Layout'
import AuthCallback from './pages/AuthCallback'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Chargement...</div>
      </div>
    )
  }

  if (!user) {
    // La page /auth-callback doit être accessible même sans être connecté
    if (window.location.pathname === '/auth-callback') {
      return <AuthCallback />
    }
    return <Login />
  }

  return (
    <SciProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/etat-locatif" element={<EtatLocatif />} />
          <Route path="/compte-rendu-gestion" element={<CompteRenduGestion />} />
          <Route path="/encaissements" element={<Encaissements />} />
          <Route path="/depot-garantie" element={<DepotGarantie />} />
          <Route path="/regularisation-charges" element={<RegularisationCharges />} />
          <Route path="/impayes" element={<Impayes />} />
          <Route path="/indexations" element={<Indexations />} />
          <Route path="/quittances" element={<Quittances />} />
          <Route path="/alertes" element={<Alertes />} />
          <Route path="/import-global" element={<ImportGlobal />} />
          <Route path="/admin/utilisateurs" element={<AdminUsers />} />
          <Route path="/admin/cabinets" element={<AdminTenants />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </SciProvider>
  )
}

export default App
