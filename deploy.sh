#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  AKILI Property — Script de déploiement v2 (git-based)
#  Usage : ./deploy.sh
#
#  ✅ TOUJOURS dans ce sens : Local → git push → GitHub → Serveur
#  ❌ Ne JAMAIS copier des fichiers du serveur vers le Mac local
# ═══════════════════════════════════════════════════════════════

set -e  # Arrêt immédiat si une erreur survient

SERVER="root@46.62.160.11"
SSH_KEY="$HOME/.ssh/akili_hetzner"
REMOTE_DIR="/var/www/akili-property"
BRANCH="main"

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "🚀 AKILI Property — Déploiement"
echo "════════════════════════════════"

# ─── Étape 1 : Vérifier les changements locaux non commités ───
echo ""
echo "🔍 Vérification des changements locaux..."
cd "$SCRIPT_DIR"

if ! git diff --quiet HEAD 2>/dev/null; then
  echo -e "${RED}⚠️  ATTENTION : Des changements locaux ne sont pas commités !${NC}"
  echo "   Exécutez d'abord :"
  echo "   git add . && git commit -m 'votre message' && git push"
  echo ""
  read -p "Continuer quand même (déploie la dernière version GitHub) ? [o/N] " confirm
  if [ "$confirm" != "o" ] && [ "$confirm" != "O" ]; then
    echo "Déploiement annulé."
    exit 1
  fi
fi

# ─── Étape 2 : Vérifier que le push est fait ──────────────────
LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
REMOTE_COMMIT=$(git ls-remote origin "refs/heads/$BRANCH" 2>/dev/null | cut -f1 || echo "")

if [ -n "$REMOTE_COMMIT" ] && [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
  echo -e "${YELLOW}⚠️  Votre code local n'est pas pushé sur GitHub.${NC}"
  echo "   Commit local  : ${LOCAL_COMMIT:0:8}"
  echo "   Commit GitHub : ${REMOTE_COMMIT:0:8}"
  echo "   Le serveur recevra la version GitHub (ancienne)."
  echo ""
  read -p "Pousser sur GitHub maintenant ? [O/n] " push_confirm
  if [ "$push_confirm" != "n" ] && [ "$push_confirm" != "N" ]; then
    echo "📤 Push vers GitHub..."
    git push origin "$BRANCH"
    echo -e "${GREEN}✅ Push effectué.${NC}"
  fi
fi

echo -e "${GREEN}✅ Code vérifié (commit: ${LOCAL_COMMIT:0:8})${NC}"

# ─── Étape 3 : Déploiement sur le serveur via git pull ────────
echo ""
echo "📡 Connexion au serveur et déploiement..."
ssh -i "$SSH_KEY" "$SERVER" "bash -s" << ENDSSH
  set -e
  cd "$REMOTE_DIR"

  echo ""
  echo "📥 Git pull depuis GitHub..."
  git pull origin $BRANCH

  echo ""
  echo "📦 Dépendances backend..."
  npm --prefix backend install --production 2>&1 | tail -3

  echo ""
  echo "📦 Dépendances frontend..."
  npm --prefix frontend install 2>&1 | tail -3

  echo ""
  echo "🔨 Build frontend..."
  npm --prefix frontend run build 2>&1 | tail -5

  echo ""
  echo "🔨 Build backend (TypeScript)..."
  npm --prefix backend run build 2>&1 | tail -5

  echo ""
  echo "♻️  Redémarrage PM2..."
  pm2 restart akili-backend 2>/dev/null || pm2 start backend/dist/server.js --name akili-backend

  echo ""
  echo "🌐 Rechargement Nginx..."
  systemctl reload nginx

  COMMIT=\$(git rev-parse --short HEAD)
  echo ""
  echo "✅ Serveur mis à jour — commit: \$COMMIT"
ENDSSH

echo ""
echo -e "${GREEN}🎉 Déploiement terminé !${NC}"
echo "   Site : https://akiliproperty.fr"
echo ""
