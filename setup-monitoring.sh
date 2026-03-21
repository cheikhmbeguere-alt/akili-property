#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  AKILI Property — Activation du monitoring
#  À exécuter UNE FOIS après avoir configuré le SMTP dans .env
#  Usage : ./setup-monitoring.sh
# ═══════════════════════════════════════════════════════════════

SERVER="root@46.62.160.11"
SSH_KEY="$HOME/.ssh/akili_hetzner"
REMOTE_DIR="/var/www/akili-property"

echo ""
echo "🔧 AKILI Monitoring — Installation"
echo "===================================="

# Vérifier que le SMTP est configuré
echo ""
echo "Vérification de la config SMTP sur le serveur..."
SMTP_CHECK=$(ssh -i "$SSH_KEY" "$SERVER" "grep -c 'SMTP_HOST' $REMOTE_DIR/backend/.env 2>/dev/null || echo 0")
if [ "$SMTP_CHECK" = "0" ]; then
  echo "❌ SMTP non configuré ! Ajoutez ces lignes dans /var/www/akili-property/backend/.env :"
  echo ""
  echo "   SMTP_HOST=smtp.office365.com"
  echo "   SMTP_PORT=587"
  echo "   SMTP_USER=votre@email.fr"
  echo "   SMTP_PASS=votre_mot_de_passe"
  echo "   SMTP_FROM=noreply@increase360.fr"
  echo ""
  echo "Puis relancez ce script."
  exit 1
fi

echo "✅ SMTP configuré"

# Compiler le TypeScript (inclut le monitoring)
echo ""
echo "🔨 Compilation TypeScript..."
ssh -i "$SSH_KEY" "$SERVER" "cd $REMOTE_DIR/backend && npm run build 2>&1 | tail -5"

# Démarrer le monitoring avec PM2
echo ""
echo "🚀 Démarrage du monitoring PM2..."
ssh -i "$SSH_KEY" "$SERVER" "
  cd $REMOTE_DIR/backend
  # Arrêter l'ancien monitoring s'il tourne
  pm2 delete akili-monitor 2>/dev/null || true
  # Démarrer le nouveau
  pm2 start dist/monitoring/monitor.js \
    --name akili-monitor \
    --env-file .env \
    --max-memory-restart 100M \
    --restart-delay 10000 \
    --log /var/log/pm2/akili-monitor.log
  pm2 save
"

echo ""
echo "✅ Monitoring démarré !"
echo ""
echo "📊 Statut :"
ssh -i "$SSH_KEY" "$SERVER" "pm2 status akili-monitor"
echo ""
echo "📋 Pour voir les logs en direct :"
echo "   ssh -i ~/.ssh/akili_hetzner root@46.62.160.11 'pm2 logs akili-monitor --lines 20'"
