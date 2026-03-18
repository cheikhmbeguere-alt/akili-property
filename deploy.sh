#!/bin/bash
# ─── Déploiement AKILI Property — Backend + Frontend ─────────────────────────
set -e

SERVER="root@46.62.160.11"
KEY="$HOME/.ssh/akili_hetzner"
LOCAL="/Users/cheikhmbeguere/Projects/property-management"
REMOTE="/var/www/akili-property"
DIST="$LOCAL/frontend/dist"

echo "🔨 Build du frontend..."
npm --prefix "$LOCAL/frontend" run build

echo "📂 Déploiement des fichiers backend..."
BACKEND_FILES=(
  # Config
  "backend/src/config/database.ts"
  # Middleware
  "backend/src/middleware/auth.middleware.ts"
  "backend/src/middleware/db-context.middleware.ts"
  # Controllers
  "backend/src/controllers/admin.controller.ts"
  "backend/src/controllers/alertes.controller.ts"
  "backend/src/controllers/auth.controller.ts"
  "backend/src/controllers/baux.controller.ts"
  "backend/src/controllers/crg.controller.ts"
  "backend/src/controllers/depot_garantie.controller.ts"
  "backend/src/controllers/encaissements.controller.ts"
  "backend/src/controllers/immeubles.controller.ts"
  "backend/src/controllers/impayes.controller.ts"
  "backend/src/controllers/locataires.controller.ts"
  "backend/src/controllers/lots.controller.ts"
  "backend/src/controllers/quittances.controller.ts"
  "backend/src/controllers/sci.controller.ts"
  "backend/src/controllers/tenants.controller.ts"
  "backend/src/controllers/charges_reelles.controller.ts"
  "backend/src/controllers/export.controller.ts"
  "backend/src/controllers/indexation.controller.ts"
  "backend/src/controllers/pennylane.controller.ts"
  "backend/src/controllers/sci.controller.ts"
  "backend/src/controllers/admin.controller.ts"
  "backend/src/controllers/import.controller.ts"
  "backend/src/controllers/notifications.controller.ts"
  "backend/src/controllers/portail.controller.ts"
  "backend/src/controllers/import_global.controller.ts"
  "backend/src/services/mail.service.ts"
  # Routes
  "backend/src/routes/auth.routes.ts"
  "backend/src/routes/admin.routes.ts"
  "backend/src/routes/alertes.routes.ts"
  "backend/src/routes/depot_garantie.routes.ts"
  "backend/src/routes/tenants.routes.ts"
  "backend/src/routes/charges_reelles.routes.ts"
  "backend/src/routes/export.routes.ts"
  "backend/src/routes/reports.routes.ts"
  "backend/src/routes/pennylane.routes.ts"
  "backend/src/routes/indexation.routes.ts"
  "backend/src/routes/indices.routes.ts"
  "backend/src/routes/immeubles.routes.ts"
  "backend/src/routes/lots.routes.ts"
  "backend/src/routes/baux.routes.ts"
  "backend/src/routes/locataires.routes.ts"
  "backend/src/routes/quittances.routes.ts"
  "backend/src/routes/encaissements.routes.ts"
  "backend/src/routes/impayes.routes.ts"
  "backend/src/routes/sci.routes.ts"
  "backend/src/routes/notifications.routes.ts"
  "backend/src/routes/portail.routes.ts"
  "backend/src/routes/import_global.routes.ts"
  # Entry point
  "backend/src/index.ts"
)
for f in "${BACKEND_FILES[@]}"; do
  scp -i "$KEY" "$LOCAL/$f" "$SERVER:$REMOTE/$f"
  echo "  ✓ $f"
done

echo "🔧 Compilation TypeScript sur le serveur..."
ssh -i "$KEY" "$SERVER" "cd $REMOTE/backend && npm run build"

echo "♻️  Redémarrage backend (PM2)..."
ssh -i "$KEY" "$SERVER" "pm2 restart akili-backend"

echo "📁 Création du dossier frontend distant..."
ssh -i "$KEY" "$SERVER" "mkdir -p $REMOTE/frontend/dist"

echo "📤 Envoi du frontend..."
scp -i "$KEY" -r "$DIST/"* "$SERVER:$REMOTE/frontend/dist/"

echo "✅ Déploiement terminé !"
ssh -i "$KEY" "$SERVER" "ls $REMOTE/frontend/dist | head -5"
