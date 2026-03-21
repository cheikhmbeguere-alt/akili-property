/**
 * AKILI Property — Service d'envoi d'emails
 * ──────────────────────────────────────────
 * Utilise l'API Microsoft Graph avec les credentials Azure (client credentials flow)
 * → Aucune licence utilisateur requise — fonctionne avec une boîte partagée
 *
 * Variables d'environnement requises (.env) :
 *   AZURE_TENANT_ID       → ID du tenant Microsoft 365
 *   AZURE_CLIENT_ID       → ID de l'app Azure (API permission Mail.Send requise)
 *   AZURE_CLIENT_SECRET   → Secret de l'app Azure
 *   MAIL_FROM             → Adresse expéditrice (ex: akiliproperty@akili-so.fr)
 *
 * Permissions Azure à configurer (portal.azure.com) :
 *   App Registration → API Permissions → Microsoft Graph → Application → Mail.Send → Grant admin consent
 */

import https from 'https'

const APP_NAME = 'AKILI PROPERTY'

// ─── Config ────────────────────────────────────────────────────────────────
const TENANT_ID     = process.env.AZURE_TENANT_ID     || ''
const CLIENT_ID     = process.env.AZURE_CLIENT_ID     || ''
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || ''
const MAIL_FROM     = process.env.MAIL_FROM           || 'akiliproperty@akili-so.fr'

// ─── Cache du token OAuth2 ─────────────────────────────────────────────────
let cachedToken: string | null = null
let tokenExpiry: number = 0

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 60_000) return cachedToken

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope:         'https://graph.microsoft.com/.default',
  }).toString()

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'login.microsoftonline.com',
      path:     `/${TENANT_ID}/oauth2/v2.0/token`,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (!json.access_token) {
            reject(new Error(`Token Azure KO : ${json.error_description || JSON.stringify(json)}`))
            return
          }
          cachedToken = json.access_token
          tokenExpiry = Date.now() + (json.expires_in || 3600) * 1000
          resolve(cachedToken!)
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ─── Envoi via Graph API ───────────────────────────────────────────────────
async function sendGraphMail(to: string | string[], subject: string, html: string): Promise<void> {
  const token = await getAccessToken()

  const toArray = Array.isArray(to) ? to : [to]
  const payload = JSON.stringify({
    message: {
      subject,
      body:          { contentType: 'HTML', content: html },
      toRecipients:  toArray.map(addr => ({ emailAddress: { address: addr } })),
      from:          { emailAddress: { address: MAIL_FROM, name: APP_NAME } },
    },
    saveToSentItems: false,
  })

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.microsoft.com',
      path:     `/v1.0/users/${encodeURIComponent(MAIL_FROM)}/sendMail`,
      method:   'POST',
      headers:  {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        if (res.statusCode === 202) {
          resolve()
        } else {
          reject(new Error(`Graph API ${res.statusCode} : ${data}`))
        }
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

// ─── Vérification config ───────────────────────────────────────────────────
export const isMailConfigured = (): boolean =>
  !!(TENANT_ID && CLIENT_ID && CLIENT_SECRET && MAIL_FROM)

// ─── Template HTML de base ─────────────────────────────────────────────────
const fmt     = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'
const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR')

const baseHtml = (title: string, body: string) => `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    body { margin:0; padding:0; background:#f8fafc; font-family: 'Helvetica Neue', Arial, sans-serif; }
    .wrapper { max-width:600px; margin:32px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.08); }
    .header { background:#0f172a; padding:24px 32px; }
    .header-logo { color:#AF9500; font-size:13px; font-weight:700; letter-spacing:2px; text-transform:uppercase; }
    .header h1 { color:#fff; font-size:20px; margin:8px 0 0; font-weight:600; }
    .body { padding:32px; color:#374151; font-size:14px; line-height:1.6; }
    .kpi-row { display:flex; gap:16px; margin:20px 0; }
    .kpi { flex:1; background:#f8fafc; border-radius:8px; padding:14px 16px; border-left:4px solid #AF9500; }
    .kpi-label { font-size:11px; color:#9ca3af; font-weight:600; text-transform:uppercase; letter-spacing:.5px; }
    .kpi-value { font-size:18px; font-weight:700; color:#0f172a; margin-top:4px; }
    .btn { display:inline-block; background:#0f172a; color:#fff!important; text-decoration:none; padding:12px 24px; border-radius:8px; font-size:14px; font-weight:600; margin:20px 0; }
    .footer { background:#f8fafc; padding:16px 32px; font-size:11px; color:#9ca3af; border-top:1px solid #e5e7eb; }
    table.details { width:100%; border-collapse:collapse; margin:16px 0; font-size:13px; }
    table.details th { background:#f8fafc; padding:8px 12px; text-align:left; color:#6b7280; font-size:11px; font-weight:600; text-transform:uppercase; }
    table.details td { padding:8px 12px; border-bottom:1px solid #f3f4f6; color:#374151; }
    .warning { background:#fff5f5; border:1px solid #fecaca; border-radius:8px; padding:14px 16px; margin:16px 0; color:#dc2626; font-size:13px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="header-logo">${APP_NAME}</div>
      <h1>${title}</h1>
    </div>
    <div class="body">
      ${body}
    </div>
    <div class="footer">
      Cet email a été envoyé automatiquement par ${APP_NAME} · <a href="mailto:${MAIL_FROM}" style="color:#9ca3af">${MAIL_FROM}</a>
    </div>
  </div>
</body>
</html>`

// ═══════════════════════════════════════════════════════════════════════════
//  EMAILS MÉTIER
// ═══════════════════════════════════════════════════════════════════════════

// ─── Relance impayé ────────────────────────────────────────────────────────
export interface RelanceData {
  locataire_nom:   string
  locataire_email: string
  bail_code:       string
  lot_code:        string
  immeuble_name:   string
  montant_impaye:  number
  nb_quittances:   number
  type:            'premier_rappel' | 'deuxieme_rappel' | 'mise_en_demeure'
}

export const sendRelance = async (data: RelanceData): Promise<void> => {
  const typeLabels = {
    premier_rappel:  'Premier rappel de paiement',
    deuxieme_rappel: 'Deuxième rappel de paiement',
    mise_en_demeure: 'Mise en demeure',
  }
  const subject = `[${APP_NAME}] ${typeLabels[data.type]} — ${data.bail_code}`

  const urgenceHtml = data.type === 'mise_en_demeure'
    ? `<div class="warning">⚠️ <strong>Mise en demeure :</strong> Sans régularisation sous 8 jours, nous serons contraints d'engager les procédures légales.</div>`
    : ''

  const body = `
    <p>Bonjour <strong>${data.locataire_nom}</strong>,</p>
    <p>Sauf erreur de notre part, nous constatons un impayé sur votre bail <strong>${data.bail_code}</strong>.</p>
    <div class="kpi-row">
      <div class="kpi">
        <div class="kpi-label">Montant dû</div>
        <div class="kpi-value">${fmt(data.montant_impaye)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Quittances impayées</div>
        <div class="kpi-value">${data.nb_quittances}</div>
      </div>
    </div>
    <table class="details">
      <tr><th>Bien</th><td>${data.immeuble_name} — Lot ${data.lot_code}</td></tr>
      <tr><th>Bail</th><td>${data.bail_code}</td></tr>
    </table>
    ${urgenceHtml}
    <p>Nous vous remercions de bien vouloir régulariser cette situation dans les meilleurs délais.</p>
    <p>Pour tout renseignement, n'hésitez pas à nous contacter.</p>
    <p>Cordialement,<br/><strong>L'équipe ${APP_NAME}</strong></p>
  `
  await sendGraphMail(data.locataire_email, subject, baseHtml(typeLabels[data.type], body))
}

// ─── Alerte échéance bail ──────────────────────────────────────────────────
export interface AlerteEcheanceData {
  locataire_nom:   string
  locataire_email: string
  bail_code:       string
  lot_code:        string
  immeuble_name:   string
  end_date:        string
  jours_restants:  number
}

export const sendAlerteEcheance = async (data: AlerteEcheanceData): Promise<void> => {
  const subject = `[${APP_NAME}] Échéance de bail dans ${data.jours_restants} jour(s) — ${data.bail_code}`
  const body = `
    <p>Bonjour <strong>${data.locataire_nom}</strong>,</p>
    <p>Nous vous informons que votre bail arrive à échéance dans <strong>${data.jours_restants} jour(s)</strong>.</p>
    <div class="kpi-row">
      <div class="kpi">
        <div class="kpi-label">Date de fin</div>
        <div class="kpi-value">${fmtDate(data.end_date)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Jours restants</div>
        <div class="kpi-value">${data.jours_restants} j</div>
      </div>
    </div>
    <table class="details">
      <tr><th>Bien</th><td>${data.immeuble_name} — Lot ${data.lot_code}</td></tr>
      <tr><th>Référence bail</th><td>${data.bail_code}</td></tr>
    </table>
    <p>Afin d'éviter toute interruption, merci de nous contacter rapidement pour renouveler votre bail ou organiser votre sortie.</p>
    <p>Cordialement,<br/><strong>L'équipe ${APP_NAME}</strong></p>
  `
  await sendGraphMail(data.locataire_email, subject, baseHtml(`Échéance dans ${data.jours_restants} jour(s)`, body))
}

// ─── Résumé mensuel gestionnaire ──────────────────────────────────────────
export interface ResumeMensuelData {
  gestionnaire_email:  string
  gestionnaire_nom:    string
  mois_label:          string
  total_encaisse:      number
  nb_impayes:          number
  montant_impayes:     number
  nb_baux_actifs:      number
  nb_alertes_echeance: number
}

export const sendResumeMensuel = async (data: ResumeMensuelData): Promise<void> => {
  const subject = `[${APP_NAME}] Résumé mensuel — ${data.mois_label}`
  const body = `
    <p>Bonjour <strong>${data.gestionnaire_nom}</strong>,</p>
    <p>Voici le résumé de l'activité pour <strong>${data.mois_label}</strong> :</p>
    <div class="kpi-row">
      <div class="kpi">
        <div class="kpi-label">Encaissé</div>
        <div class="kpi-value">${fmt(data.total_encaisse)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Impayés</div>
        <div class="kpi-value" style="color:${data.nb_impayes > 0 ? '#dc2626' : '#16a34a'}">${fmt(data.montant_impayes)}</div>
      </div>
    </div>
    <table class="details">
      <tr><th>Baux actifs</th><td>${data.nb_baux_actifs}</td></tr>
      <tr><th>Locataires en retard</th><td>${data.nb_impayes}</td></tr>
      <tr><th>Baux à renouveler (90j)</th><td>${data.nb_alertes_echeance}</td></tr>
    </table>
    <p>Cordialement,<br/><strong>L'équipe ${APP_NAME}</strong></p>
  `
  await sendGraphMail(data.gestionnaire_email, subject, baseHtml(`Résumé — ${data.mois_label}`, body))
}

// ═══════════════════════════════════════════════════════════════════════════
//  EMAIL MONITORING SERVEUR (utilisé par backend/src/monitoring/monitor.ts)
// ═══════════════════════════════════════════════════════════════════════════

export const sendMonitorAlert = async (
  to: string,
  subject: string,
  details: string,
): Promise<void> => {
  const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8"/>
      <style>
        body { margin:0; padding:0; background:#f8fafc; font-family:Arial,sans-serif; }
        .wrapper { max-width:600px; margin:32px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.1); }
        .header { background:#dc2626; padding:20px 28px; }
        .header h1 { color:#fff; font-size:18px; margin:0; }
        .header p  { color:#fecaca; font-size:12px; margin:4px 0 0; }
        .body { padding:28px; color:#374151; font-size:14px; line-height:1.6; }
        .alert-box { background:#fff5f5; border:1px solid #fecaca; border-radius:8px; padding:16px; margin:16px 0; }
        .alert-box pre { margin:8px 0 0; font-size:12px; color:#7f1d1d; white-space:pre-wrap; word-break:break-all; background:#fef2f2; padding:10px; border-radius:4px; }
        .meta { font-size:12px; color:#9ca3af; margin-top:20px; padding-top:16px; border-top:1px solid #e5e7eb; }
        .tag { display:inline-block; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; border-radius:4px; padding:2px 8px; font-size:11px; font-weight:700; }
        a { color:#0f172a; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>🚨 Alerte — ${APP_NAME}</h1>
          <p>${subject}</p>
        </div>
        <div class="body">
          <p><span class="tag">INCIDENT</span> Une anomalie a été détectée automatiquement.</p>
          <div class="alert-box">
            <strong>Détails :</strong>
            <pre>${details}</pre>
          </div>
          <p><strong>Action :</strong> Connectez-vous au serveur <code>ssh root@46.62.160.11</code> et vérifiez <code>pm2 status</code>.</p>
          <p>Site : <a href="https://akiliproperty.fr">akiliproperty.fr</a></p>
          <div class="meta">
            Détecté le ${now} · Monitoring automatique ${APP_NAME}<br/>
            <em>Un seul email d'alerte est envoyé par heure pour ce type d'incident.</em>
          </div>
        </div>
      </div>
    </body>
    </html>
  `
  await sendGraphMail(to, `🚨 [${APP_NAME}] ${subject}`, html)
}

export const sendMonitorRecovery = async (
  to: string,
  subject: string,
): Promise<void> => {
  const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8"/>
      <style>
        body { margin:0; padding:0; background:#f8fafc; font-family:Arial,sans-serif; }
        .wrapper { max-width:600px; margin:32px auto; background:#fff; border-radius:12px; overflow:hidden; }
        .header { background:#16a34a; padding:20px 28px; }
        .header h1 { color:#fff; font-size:18px; margin:0; }
        .body { padding:28px; color:#374151; font-size:14px; }
        .ok-box { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:16px; }
        .meta { font-size:12px; color:#9ca3af; margin-top:20px; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header"><h1>✅ Rétabli — ${APP_NAME}</h1></div>
        <div class="body">
          <div class="ok-box"><strong>✅ ${subject}</strong><br/>Le service fonctionne à nouveau normalement.</div>
          <div class="meta">Rétabli le ${now}</div>
        </div>
      </div>
    </body>
    </html>
  `
  await sendGraphMail(to, `✅ [${APP_NAME}] Rétabli — ${subject}`, html)
}
