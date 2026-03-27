import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { sciAPI, immeublesAPI, lotsAPI, locatairesAPI, bauxAPI, impayesAPI, pennylaneAPI } from '../services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { differenceInDays, addMonths } from 'date-fns'

const METRIC_THEMES = {
  1: { card: 'metric-card-1', value: 'metric-value-1', label: 'metric-label-1', icon: 'metric-icon-1' },
  2: { card: 'metric-card-2', value: 'metric-value-2', label: 'metric-label-2', icon: 'metric-icon-2' },
  3: { card: 'metric-card-3', value: 'metric-value-3', label: 'metric-label-3', icon: 'metric-icon-3' },
  4: { card: 'metric-card-4', value: 'metric-value-4', label: 'metric-label-4', icon: 'metric-icon-4' },
} as const

function MetricCard({ label, value, sub, emoji, theme }: { label: string; value: string; sub?: string; emoji: string; theme: 1|2|3|4 }) {
  const t = METRIC_THEMES[theme]
  return (
    <div className={`rounded-2xl border p-5 ${t.card}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${t.label}`}>{label}</p>
          <p className={`text-2xl font-bold ${t.value}`}>{value}</p>
          {sub && <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>{sub}</p>}
        </div>
        <div className={`rounded-xl flex items-center justify-center text-lg ${t.icon}`} style={{ width: '40px', height: '40px', flexShrink: 0 }}>
          {emoji}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { data: sciList = [] } = useQuery({ queryKey: ['sci'], queryFn: async () => (await sciAPI.getAll()).data })
  const { data: immeubleList = [] } = useQuery({ queryKey: ['immeubles'], queryFn: async () => (await immeublesAPI.getAll()).data })
  const { data: lotList = [] } = useQuery({ queryKey: ['lots'], queryFn: async () => (await lotsAPI.getAll()).data })
  const { data: locataireList = [] } = useQuery({ queryKey: ['locataires'], queryFn: async () => (await locatairesAPI.getAll()).data })
  const { data: bailList = [] } = useQuery({ queryKey: ['baux'], queryFn: async () => (await bauxAPI.getAll()).data })
  const { data: impayesData } = useQuery({
    queryKey: ['impayes-report'],
    queryFn: async () => (await impayesAPI.getReport()).data,
    staleTime: 60_000,
  })
  const { data: treasuryData, isLoading: treasuryLoading, error: treasuryError } = useQuery({
    queryKey: ['treasury'],
    queryFn: async () => (await pennylaneAPI.getTreasury()).data,
    staleTime: 5 * 60_000, // rafraîchi toutes les 5 min
    retry: false,
  })

  const bailsActifs = bailList.filter((b: any) => b.status === 'actif')

  // Surface de référence = somme des total_surface des immeubles (surface bâtie réelle)
  const surfaceImmeuble = immeubleList.reduce((sum: number, imm: any) => sum + parseFloat(imm.total_surface || 0), 0)
  // Surface allouée en lots = somme des surfaces individuelles des lots
  const surfaceLots = lotList.reduce((sum: number, lot: any) => sum + parseFloat(lot.surface || 0), 0)
  // Surface occupée = surface des lots avec bail actif
  const surfaceLouee = bailsActifs.reduce((sum: number, bail: any) => {
    const lot = lotList.find((l: any) => l.id === bail.lot_id)
    return sum + parseFloat(lot?.surface || 0)
  }, 0)
  // Base de calcul : surface immeuble si renseignée, sinon fallback sur lots
  const surfaceBase = surfaceImmeuble > 0 ? surfaceImmeuble : surfaceLots
  const surfaceVacante = surfaceBase - surfaceLouee

  const tauxOccupation = surfaceBase > 0 ? (surfaceLouee / surfaceBase) * 100 : 0

  const loyerAnnuelTotal = bailsActifs.reduce((sum: number, bail: any) => {
    const loyer = parseFloat(bail.loyer_ht || 0)
    switch (bail.quittancement_frequency) {
      case 'mensuel': return sum + loyer * 12
      case 'trimestriel': return sum + loyer * 4
      case 'annuel': return sum + loyer
      default: return sum + loyer * 12
    }
  }, 0)

  // Revenu mensuel HT = loyer HT + charges HT (ramené au mois)
  const gainMensuelHT = bailsActifs.reduce((sum: number, bail: any) => {
    const loyer    = parseFloat(bail.loyer_ht  || 0)
    const charges  = parseFloat(bail.charges_ht || 0)
    const total    = loyer + charges
    switch (bail.quittancement_frequency) {
      case 'mensuel':     return sum + total
      case 'trimestriel': return sum + total / 3
      case 'annuel':      return sum + total / 12
      default:            return sum + total
    }
  }, 0)

  const loyerParImmeuble = immeubleList.map((immeuble: any) => {
    const bailsImm = bailsActifs.filter((bail: any) => {
      const lot = lotList.find((l: any) => l.id === bail.lot_id)
      return lot?.immeuble_id === immeuble.id
    })
    const loyer = bailsImm.reduce((sum: number, bail: any) => {
      const m = bail.quittancement_frequency === 'mensuel' ? parseFloat(bail.loyer_ht || 0)
              : bail.quittancement_frequency === 'trimestriel' ? parseFloat(bail.loyer_ht || 0) / 3
              : parseFloat(bail.loyer_ht || 0) / 12
      return sum + m
    }, 0)
    return { name: immeuble.code, loyer: Math.round(loyer) }
  }).filter((item: any) => item.loyer > 0)

  // Graphique surface par immeuble : bâti vs lots vs loué
  const surfaceParImmeuble = immeubleList
    .filter((imm: any) => parseFloat(imm.total_surface || 0) > 0 || lotList.some((l: any) => l.immeuble_id === imm.id))
    .map((immeuble: any) => {
      const lotsImm = lotList.filter((l: any) => l.immeuble_id === immeuble.id)
      const surfBati = parseFloat(immeuble.total_surface || 0)
      const surfLots = lotsImm.reduce((s: number, l: any) => s + parseFloat(l.surface || 0), 0)
      const surfLouee = bailsActifs.reduce((s: number, bail: any) => {
        const lot = lotsImm.find((l: any) => l.id === bail.lot_id)
        return s + parseFloat(lot?.surface || 0)
      }, 0)
      const base = surfBati > 0 ? surfBati : surfLots
      return {
        name: immeuble.code || immeuble.name,
        'Surface bâtie': Math.round(surfBati) || undefined,
        'Surface en lots': Math.round(surfLots),
        'Surface louée': Math.round(surfLouee),
        tauxOcc: base > 0 ? Math.round((surfLouee / base) * 100) : 0,
      }
    })
    .filter((item: any) => item['Surface en lots'] > 0 || item['Surface bâtie'])

  const locataireTypeData = [
    { name: 'Entreprises', value: locataireList.filter((l: any) => l.type === 'entreprise').length },
    { name: 'Particuliers', value: locataireList.filter((l: any) => l.type === 'particulier').length },
  ].filter(item => item.value > 0)

  const today = new Date()
  const bailsExpiringSoon = bailsActifs.filter((bail: any) => {
    if (!bail.end_date) return false
    const endDate = new Date(bail.end_date)
    return endDate >= today && endDate <= addMonths(today, 3)
  })

  const derniersBaux = [...bailList]
    .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 5)

  const PIE_COLORS = ['#978A47', '#BCAA58']

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: '#0f172a' }}>Tableau de bord</h1>
        <p className="text-sm mt-1" style={{ color: '#64748b' }}>Vue d'ensemble de votre patrimoine immobilier</p>
      </div>

      {/* KPI Cards — style AKILI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Revenu mensuel HT"
          value={`${Math.round(gainMensuelHT).toLocaleString('fr-FR')} €`}
          sub={`Annuel : ${Math.round(loyerAnnuelTotal).toLocaleString('fr-FR')} € HT`}
          emoji="💰"
          theme={1}
        />
        <MetricCard
          label="Taux d'occupation"
          value={`${tauxOccupation.toFixed(1)} %`}
          sub={`${surfaceLouee.toFixed(0)} m² loués · ${surfaceVacante.toFixed(0)} m² vacants`}
          emoji="📊"
          theme={2}
        />
        <MetricCard
          label="Baux actifs"
          value={String(bailsActifs.length)}
          sub={`sur ${lotList.length} lot${lotList.length > 1 ? 's' : ''}`}
          emoji="📋"
          theme={3}
        />
        <MetricCard
          label="Locataires"
          value={String(locataireList.length)}
          sub={`${sciList.length} SCI · ${immeubleList.length} immeuble${immeubleList.length > 1 ? 's' : ''}`}
          emoji="👥"
          theme={4}
        />
      </div>

      {/* Impayés quick stats */}
      {(impayesData?.kpis?.total_impayes > 0 || impayesData?.kpis?.nb_en_retard > 0) && (
        <Link to="/impayes" className="block mb-6 no-underline">
          <div className="rounded-2xl border p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 transition-all hover:shadow-sm"
            style={{ backgroundColor: '#fff5f5', borderColor: '#fecaca' }}>
            <span style={{ fontSize: '28px', flexShrink: 0 }}>⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: '#dc2626' }}>
                {impayesData.kpis.nb_en_retard} locataire{impayesData.kpis.nb_en_retard > 1 ? 's' : ''} en retard de paiement
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#ef4444' }}>
                Total impayé :{' '}
                {parseFloat(impayesData.kpis.total_impayes).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: '#dc2626', color: '#fff', flexShrink: 0 }}>
              Voir les impayés →
            </span>
          </div>
        </Link>
      )}

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="lg:col-span-2 card p-6">
          <h3 className="text-sm font-semibold mb-5" style={{ color: '#0f172a' }}>Loyers mensuels par immeuble</h3>
          {loyerParImmeuble.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={loyerParImmeuble} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => [`${v.toLocaleString('fr-FR')} €`, 'Loyer mensuel']}
                  contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                />
                <Bar dataKey="loyer" fill="#978A47" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-44">
              <span style={{ fontSize: '32px' }}>📭</span>
              <p className="text-sm mt-2" style={{ color: '#94a3b8' }}>Aucun bail actif</p>
            </div>
          )}
        </div>

        <div className="card p-6">
          <h3 className="text-sm font-semibold mb-5" style={{ color: '#0f172a' }}>Répartition des locataires</h3>
          {locataireTypeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={locataireTypeData} cx="50%" cy="45%" outerRadius={65} dataKey="value" strokeWidth={2} stroke="#fff">
                  {locataireTypeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-44">
              <span style={{ fontSize: '32px' }}>👥</span>
              <p className="text-sm mt-2" style={{ color: '#94a3b8' }}>Aucun locataire</p>
            </div>
          )}
        </div>
      </div>

      {/* Graphique vacance par immeuble */}
      {surfaceParImmeuble.length > 0 && (
        <div className="card p-6 mb-8">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold" style={{ color: '#0f172a' }}>Occupation par immeuble — surface (m²)</h3>
            <div className="flex items-center gap-4 text-xs" style={{ color: '#64748b' }}>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#e2e8f0' }}></span>
                Surface bâtie
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#cbd5e1' }}></span>
                Surface en lots
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#978A47' }}></span>
                Surface louée
              </span>
            </div>
          </div>
          <p className="text-xs mb-4" style={{ color: '#94a3b8' }}>
            Base de calcul : surface bâtie immeuble · écart = espaces non alloués en lots
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={surfaceParImmeuble} barCategoryGap="30%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => `${v} m²`} />
              <Tooltip
                formatter={(v: number, name: string) => [`${v.toLocaleString('fr-FR')} m²`, name]}
                contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                labelFormatter={(label, payload) => {
                  const taux = payload?.[0]?.payload?.tauxOcc
                  return `${label}${taux !== undefined ? ` — ${taux}% occupé` : ''}`
                }}
              />
              <Bar dataKey="Surface bâtie" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Surface en lots" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Surface louée" fill="#978A47" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Alertes + Derniers baux */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* Alertes */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: '#0f172a' }}>Alertes</h3>
            {bailsExpiringSoon.length > 0 && (
              <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: '#fed7aa', color: '#c2410c' }}>
                {bailsExpiringSoon.length} bail{bailsExpiringSoon.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {bailsExpiringSoon.length > 0 ? (
            <div className="space-y-2">
              {bailsExpiringSoon.map((bail: any) => (
                <div key={bail.id} className="flex items-start p-3 rounded-xl" style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa' }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#0f172a' }}>
                      {bail.code} · {differenceInDays(new Date(bail.end_date), today)}j restants
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                      {bail.locataire_type === 'entreprise' ? bail.locataire_company_name : `${bail.locataire_first_name} ${bail.locataire_last_name}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <span style={{ fontSize: '32px' }}>✅</span>
              <p className="text-sm mt-2" style={{ color: '#94a3b8' }}>Aucune alerte</p>
            </div>
          )}
        </div>

        {/* Derniers baux */}
        <div className="card p-6">
          <h3 className="text-sm font-semibold mb-4" style={{ color: '#0f172a' }}>Derniers baux</h3>
          {derniersBaux.length > 0 ? (
            <div className="space-y-2">
              {derniersBaux.map((bail: any) => (
                <div key={bail.id} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: '#f8fafc' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#0f172a' }}>{bail.code}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                      {bail.lot_code} · {bail.locataire_type === 'entreprise' ? bail.locataire_company_name : `${bail.locataire_first_name} ${bail.locataire_last_name}`}
                    </p>
                  </div>
                  {bail.status === 'actif'
                    ? <span className="badge-actif">Actif</span>
                    : <span className="badge-termine">{bail.status}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <span style={{ fontSize: '32px' }}>📭</span>
              <p className="text-sm mt-2" style={{ color: '#94a3b8' }}>Aucun bail créé</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Trésorerie Pennylane ── */}
      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '18px' }}>🏦</span>
            <h3 className="text-sm font-semibold" style={{ color: '#0f172a' }}>Trésorerie en direct</h3>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>Pennylane</span>
          </div>
          {!treasuryLoading && !treasuryError && (
            <div className="text-right">
              <div className="text-xs font-medium" style={{ color: '#9ca3af' }}>Total consolidé</div>
              <div className="text-xl font-bold" style={{ color: (treasuryData?.grand_total || 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                {(treasuryData?.grand_total || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
              </div>
            </div>
          )}
        </div>

        {treasuryLoading && (
          <div className="flex items-center gap-2 py-4" style={{ color: '#9ca3af' }}>
            <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
            <span className="text-sm">Connexion à Pennylane…</span>
          </div>
        )}

        {treasuryError && (
          <div className="text-sm rounded-lg p-3" style={{ backgroundColor: '#fff5f5', color: '#dc2626' }}>
            Impossible de récupérer les données Pennylane. Vérifiez les tokens dans les paramètres.
          </div>
        )}

        {!treasuryLoading && !treasuryError && treasuryData && (
          <div className="space-y-3">
            {(treasuryData.scis || []).map((sci: any) => (
              <div key={sci.sci_id}>
                {/* Ligne SCI */}
                <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: '#f3f4f6' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: '#F5F0DC', color: '#978A47' }}>
                      {sci.sci_name}
                    </span>
                    {sci.error && (
                      <span className="text-xs" style={{ color: '#f59e0b' }}>
                        ⚠️ {sci.error === 'Scope manquant (HTTP 403)' ? 'Token à renouveler (scope bank_accounts manquant)' : sci.error}
                      </span>
                    )}
                  </div>
                  {!sci.error && (
                    <span className="text-sm font-bold" style={{ color: sci.total_balance >= 0 ? '#16a34a' : '#dc2626' }}>
                      {(sci.total_balance || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                    </span>
                  )}
                </div>

                {/* Comptes de la SCI */}
                {(sci.accounts || []).map((acc: any) => (
                  <div key={acc.id} className="flex items-center justify-between px-3 py-1.5" style={{ backgroundColor: '#fafaf9' }}>
                    <div className="text-xs" style={{ color: '#6b7280' }}>
                      {acc.name}
                      {acc.iban && <span className="ml-2 font-mono" style={{ color: '#9ca3af' }}>{acc.iban.slice(-4).padStart(acc.iban.length, '•').slice(-12)}</span>}
                    </div>
                    <span className="text-xs font-semibold" style={{ color: acc.balance >= 0 ? '#374151' : '#dc2626' }}>
                      {acc.balance.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                    </span>
                  </div>
                ))}

                {/* Mini graphe flux mensuel */}
                {(sci.monthly_flow || []).length > 0 && (
                  <div className="mt-2 mb-3" style={{ height: '60px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sci.monthly_flow} barGap={2} barCategoryGap="20%">
                        <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                        <Tooltip
                          formatter={(val: any, name: string) => [
                            `${parseFloat(val).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`,
                            name === 'income' ? 'Encaissements' : 'Dépenses',
                          ]}
                          contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                        />
                        <Bar dataKey="income"   fill="#86efac" radius={[2,2,0,0]} />
                        <Bar dataKey="expenses" fill="#fca5a5" radius={[2,2,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Accès rapides */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold mb-4" style={{ color: '#0f172a' }}>Accès rapides</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'État locatif',    path: '/etat-locatif',         emoji: '🏢', color: '#F5F0DC' },
            { label: 'Encaissements',   path: '/encaissements',         emoji: '💳', color: '#F5F0DC' },
            { label: 'Impayés',         path: '/impayes',               emoji: '⚠️', color: '#fff5f5' },
            { label: 'Compte rendu',    path: '/compte-rendu-gestion',  emoji: '🧾', color: '#F5F0DC' },
          ].map((a) => (
            <Link
              key={a.label}
              to={a.path}
              className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed transition-all duration-150 hover:border-solid"
              style={{ borderColor: '#e2e8f0', backgroundColor: a.color }}
            >
              <span style={{ fontSize: '22px', marginBottom: '6px' }}>{a.emoji}</span>
              <span className="text-xs font-medium text-center" style={{ color: '#334155' }}>{a.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
