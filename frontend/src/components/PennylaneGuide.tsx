// Guide de connexion Pennylane — affiché dans un panneau latéral
// Pour ajouter de vraies captures d'écran : remplacez les blocs <ScreenshotPlaceholder> par des <img src="..." />

interface Step {
  num: number
  title: string
  description: string
  detail?: string
  screenshot?: string // chemin vers l'image, ex: '/guides/pennylane-step1.png'
}

const steps: Step[] = [
  {
    num: 1,
    title: 'Accéder à Pennylane',
    description: 'Rendez-vous sur app.pennylane.com et connectez-vous avec votre compte.',
    detail: 'Assurez-vous d\'être dans le bon espace de travail (la bonne société).',
  },
  {
    num: 2,
    title: 'Ouvrir les Paramètres',
    description: 'Dans la barre de navigation à gauche, cliquez sur l\'icône ⚙️ Paramètres (en bas à gauche de l\'écran).',
  },
  {
    num: 3,
    title: 'Aller dans la section API',
    description: 'Dans le menu Paramètres, cherchez et cliquez sur l\'onglet « API » ou « Intégrations ».',
    detail: 'Cette section est réservée aux administrateurs du compte Pennylane.',
  },
  {
    num: 4,
    title: 'Créer une nouvelle clé API',
    description: 'Cliquez sur « Créer une clé API » ou « Générer un token ».',
    detail: 'Donnez un nom explicite à la clé, par exemple : PropManager ou Suivi loyers.',
  },
  {
    num: 5,
    title: 'Sélectionner les permissions',
    description: 'Cochez uniquement la permission « transactions:read » (lecture des transactions bancaires).',
    detail: 'Inutile de donner d\'autres droits — l\'app n\'a besoin que de lire vos transactions.',
  },
  {
    num: 6,
    title: 'Copier le token',
    description: 'Pennylane affiche le token une seule fois. Copiez-le immédiatement et conservez-le.',
    detail: '⚠️ Si vous fermez la fenêtre sans le copier, vous devrez en générer un nouveau.',
  },
  {
    num: 7,
    title: 'Coller dans l\'app',
    description: 'Dans PropManager, sélectionnez votre SCI, collez le token dans le champ prévu et cliquez sur « Connecter Pennylane ».',
    detail: 'La connexion est vérifiée en temps réel. Si elle échoue, vérifiez que vous êtes dans le bon workspace Pennylane.',
  },
]

function ScreenshotPlaceholder({ step }: { step: number }) {
  return (
    <div
      className="w-full rounded-lg flex flex-col items-center justify-center gap-2 border-2 border-dashed"
      style={{ height: '160px', backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}>
      <span style={{ fontSize: '28px' }}>🖼️</span>
      <p className="text-xs font-medium" style={{ color: '#9ca3af' }}>Capture d'écran — étape {step}</p>
      <p className="text-xs" style={{ color: '#d1d5db' }}>Remplacez ce bloc par une vraie image</p>
    </div>
  )
}

interface PennylaneGuideProps {
  onClose: () => void
}

export default function PennylaneGuide({ onClose }: PennylaneGuideProps) {
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />

      {/* Panneau latéral */}
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col shadow-2xl"
        style={{ width: '480px', backgroundColor: 'white', maxWidth: '95vw' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#e2e8f0' }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: '#1a1a1a' }}>
              🏦 Guide de connexion Pennylane
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
              Suivez ces étapes pour générer et connecter votre token API
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-lg"
            style={{ color: '#6b7280' }}>
            ×
          </button>
        </div>

        {/* Avertissement workspace */}
        <div className="mx-6 mt-4 rounded-lg px-4 py-3" style={{ backgroundColor: '#fef9c3', borderLeft: '3px solid #a16207' }}>
          <p className="text-xs font-semibold" style={{ color: '#a16207' }}>⚠️ Important — un token par société</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
            Chaque société (SCI) possède son propre espace Pennylane. Assurez-vous d'être connecté au bon espace avant de générer le token.
          </p>
        </div>

        {/* Étapes */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {steps.map((step) => (
            <div key={step.num} className="flex gap-4">
              {/* Numéro */}
              <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: '#978A47', marginTop: '2px' }}>
                {step.num}
              </div>

              {/* Contenu */}
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>{step.title}</p>
                <p className="text-xs leading-relaxed" style={{ color: '#374151' }}>{step.description}</p>
                {step.detail && (
                  <p className="text-xs leading-relaxed px-3 py-2 rounded-lg"
                    style={{ color: '#6b7280', backgroundColor: '#f8fafc' }}>
                    💡 {step.detail}
                  </p>
                )}
                {/* Capture d'écran — réelle ou placeholder */}
                {step.screenshot
                  ? <img src={step.screenshot} alt={`Étape ${step.num}`} className="w-full rounded-lg border" style={{ borderColor: '#e2e8f0' }} />
                  : <ScreenshotPlaceholder step={step.num} />
                }
              </div>
            </div>
          ))}

          {/* Section aide */}
          <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: '#e2e8f0', backgroundColor: '#f8fafc' }}>
            <p className="text-xs font-semibold" style={{ color: '#1a1a1a' }}>🆘 En cas de problème</p>
            <ul className="text-xs space-y-1.5" style={{ color: '#6b7280' }}>
              <li>• <strong>Token invalide</strong> : vérifiez que vous êtes dans le bon workspace Pennylane</li>
              <li>• <strong>Pas de transactions</strong> : vérifiez que le compte bancaire est bien connecté dans Pennylane</li>
              <li>• <strong>Erreur de permission</strong> : régénérez le token avec le scope <code className="px-1 rounded" style={{ backgroundColor: '#e2e8f0' }}>transactions:read</code></li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t" style={{ borderColor: '#e2e8f0' }}>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: '#978A47' }}>
            J'ai compris — retour à la connexion
          </button>
        </div>
      </div>
    </>
  )
}
