/**
 * AKILI Property — Monitoring automatique
 * ─────────────────────────────────────────
 * Vérifie toutes les 5 minutes :
 *   1. Site web accessible (HTTP 200)
 *   2. API backend répond correctement
 *   3. Mémoire RAM disponible (> 10%)
 *   4. Espace disque disponible (> 10%)
 *   5. Processus PM2 en cours d'exécution
 *
 * En cas d'anomalie → email à support@increase360.fr
 * Cooldown : 1 seul email par type d'erreur par heure
 */

import nodemailer from 'nodemailer'
import https from 'https'
import http from 'http'
import { execSync } from 'child_process'
import * as fs from 'fs'

// ─── Configuration ─────────────────────────────────────────────────────────
const CONFIG = {
  checkIntervalMs:  5 * 60 * 1000,      // Vérification toutes les 5 minutes
  cooldownMs:       60 * 60 * 1000,     // 1 alerte max par heure par type
  alertEmail:       'support@increase360.fr',
  siteUrl:          'https://akiliproperty.fr',
  apiUrl:           'https://akiliproperty.fr/api/bails?limit=1',
  appName:          'AKILI Property',
  stateFile:        '/tmp/akili_monitor_state.json',
}

// ─── Transport email ────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
})

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'monitor@akili-property.fr'

// ─── État des alertes (cooldown) ────────────────────────────────────────────
interface AlertState {
  [key: string]: number  // clé → timestamp dernier envoi
}

function loadState(): AlertState {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf-8'))
  } catch {
    return {}
  }
}

function saveState(state: AlertState): void {
  fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state))
}

function canAlert(state: AlertState, key: string): boolean {
  const last = state[key] || 0
  return Date.now() - last > CONFIG.cooldownMs
}

// ─── Envoi d'email d'alerte ─────────────────────────────────────────────────
async function sendAlert(subject: string, details: string, alertKey: string): Promise<void> {
  const state = loadState()
  if (!canAlert(state, alertKey)) {
    console.log(`[MONITOR] Alerte "${alertKey}" ignorée (cooldown actif)`)
    return
  }

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
        .alert-box pre { margin:8px 0 0; font-size:13px; color:#7f1d1d; white-space:pre-wrap; word-break:break-all; }
        .meta { font-size:12px; color:#9ca3af; margin-top:20px; padding-top:16px; border-top:1px solid #e5e7eb; }
        .tag { display:inline-block; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; border-radius:4px; padding:2px 8px; font-size:11px; font-weight:700; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>🚨 Alerte — ${CONFIG.appName}</h1>
          <p>${subject}</p>
        </div>
        <div class="body">
          <p><span class="tag">INCIDENT</span> Une anomalie a été détectée automatiquement sur votre application.</p>
          <div class="alert-box">
            <strong>Détails :</strong>
            <pre>${details}</pre>
          </div>
          <p><strong>Action recommandée :</strong> Vérifiez l'état du serveur et des processus PM2.</p>
          <p>
            Site : <a href="${CONFIG.siteUrl}">${CONFIG.siteUrl}</a><br/>
            Serveur : 46.62.160.11
          </p>
          <div class="meta">
            Détecté le ${now} · Monitoring automatique ${CONFIG.appName}<br/>
            <em>Un seul email d'alerte est envoyé par heure pour ce type d'incident.</em>
          </div>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    await transporter.sendMail({
      from:    `"${CONFIG.appName} Monitor" <${FROM}>`,
      to:      CONFIG.alertEmail,
      subject: `🚨 [${CONFIG.appName}] ${subject}`,
      html,
    })
    console.log(`[MONITOR] ✅ Alerte envoyée : ${subject}`)
    state[alertKey] = Date.now()
    saveState(state)
  } catch (err: any) {
    console.error(`[MONITOR] ❌ Impossible d'envoyer l'email :`, err.message)
  }
}

// ─── Envoi d'email de rétablissement ────────────────────────────────────────
async function sendRecovery(subject: string, alertKey: string): Promise<void> {
  const state = loadState()
  const recoveryKey = `${alertKey}_recovery`
  if (!canAlert(state, recoveryKey)) return

  const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })
  const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8"/>
      <style>
        body { margin:0; padding:0; background:#f8fafc; font-family:Arial,sans-serif; }
        .wrapper { max-width:600px; margin:32px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.1); }
        .header { background:#16a34a; padding:20px 28px; }
        .header h1 { color:#fff; font-size:18px; margin:0; }
        .body { padding:28px; color:#374151; font-size:14px; }
        .ok-box { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:16px; }
        .meta { font-size:12px; color:#9ca3af; margin-top:20px; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header"><h1>✅ Rétabli — ${CONFIG.appName}</h1></div>
        <div class="body">
          <div class="ok-box"><strong>✅ ${subject}</strong><br/>Le service fonctionne à nouveau normalement.</div>
          <div class="meta">Rétabli le ${now}</div>
        </div>
      </div>
    </body>
    </html>
  `

  try {
    await transporter.sendMail({
      from:    `"${CONFIG.appName} Monitor" <${FROM}>`,
      to:      CONFIG.alertEmail,
      subject: `✅ [${CONFIG.appName}] Rétabli — ${subject}`,
      html,
    })
    state[recoveryKey] = Date.now()
    // Réinitialiser le cooldown de l'alerte pour permettre de nouvelles alertes
    delete state[alertKey]
    saveState(state)
  } catch (err: any) {
    console.error(`[MONITOR] ❌ Impossible d'envoyer l'email de rétablissement :`, err.message)
  }
}

// ─── Vérifications ──────────────────────────────────────────────────────────

/** Vérifier qu'une URL répond avec le code HTTP attendu */
function checkHttp(url: string, expectedCode = 200, timeoutMs = 10000): Promise<{ ok: boolean; code: number; ms: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now()
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      const ms = Date.now() - start
      resolve({ ok: res.statusCode === expectedCode, code: res.statusCode || 0, ms })
      res.resume()
    })
    req.on('error', (err) => resolve({ ok: false, code: 0, ms: Date.now() - start, error: err.message }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, code: 0, ms: timeoutMs, error: 'timeout' }) })
  })
}

/** Vérifier la mémoire RAM disponible */
function checkMemory(): { ok: boolean; usedPct: number; details: string } {
  try {
    const out = execSync('free -m').toString()
    const lines = out.split('\n')
    const mem = lines[1].trim().split(/\s+/)
    const total = parseInt(mem[1])
    const used  = parseInt(mem[2])
    const usedPct = Math.round((used / total) * 100)
    return {
      ok:       usedPct < 90,
      usedPct,
      details: `RAM utilisée : ${usedPct}% (${used}Mo / ${total}Mo)`,
    }
  } catch {
    return { ok: true, usedPct: 0, details: 'RAM : impossible à lire' }
  }
}

/** Vérifier l'espace disque */
function checkDisk(): { ok: boolean; usedPct: number; details: string } {
  try {
    const out = execSync("df -h / | tail -1").toString().trim().split(/\s+/)
    const usedPct = parseInt(out[4])
    return {
      ok:       usedPct < 90,
      usedPct,
      details: `Disque utilisé : ${usedPct}% (utilisé: ${out[2]}, libre: ${out[3]})`,
    }
  } catch {
    return { ok: true, usedPct: 0, details: 'Disque : impossible à lire' }
  }
}

/** Vérifier que PM2 akili-backend est en ligne */
function checkPM2(): { ok: boolean; details: string } {
  try {
    const out = execSync('pm2 jlist 2>/dev/null').toString()
    const list = JSON.parse(out) as any[]
    const proc = list.find((p: any) => p.name === 'akili-backend')
    if (!proc) return { ok: false, details: 'Processus akili-backend introuvable dans PM2' }
    const status  = proc.pm2_env?.status
    const restarts = proc.pm2_env?.restart_time || 0
    const ok = status === 'online'
    return {
      ok,
      details: `PM2 akili-backend : status=${status}, redémarrages=${restarts}`,
    }
  } catch {
    return { ok: false, details: 'PM2 : impossible d\'accéder à la liste des processus' }
  }
}

/** Vérifier les erreurs récentes dans les logs PM2 */
function checkRecentErrors(): { hasErrors: boolean; count: number; sample: string } {
  try {
    const logPath = execSync("pm2 jlist 2>/dev/null | node -e \"const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')); const p=d.find(x=>x.name==='akili-backend'); console.log(p?.pm2_env?.pm_err_log_path||'')\"").toString().trim()
    if (!logPath || !fs.existsSync(logPath)) return { hasErrors: false, count: 0, sample: '' }

    // Lire les 100 dernières lignes des logs d'erreur
    const lines = execSync(`tail -100 "${logPath}" 2>/dev/null`).toString().split('\n')
    // Filtrer les erreurs des 5 dernières minutes
    const fiveMinAgo = Date.now() - 5 * 60 * 1000
    const recentErrors = lines.filter(l => {
      const m = l.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/)
      if (!m) return false
      return new Date(m[1]).getTime() > fiveMinAgo && l.toLowerCase().includes('error')
    })
    return {
      hasErrors: recentErrors.length > 5,
      count: recentErrors.length,
      sample: recentErrors.slice(-3).join('\n'),
    }
  } catch {
    return { hasErrors: false, count: 0, sample: '' }
  }
}

// ─── Boucle principale ───────────────────────────────────────────────────────
async function runCheck(): Promise<void> {
  const ts = new Date().toLocaleTimeString('fr-FR')
  console.log(`\n[MONITOR ${ts}] Démarrage de la vérification...`)

  // 1. Site web
  const site = await checkHttp(CONFIG.siteUrl)
  if (!site.ok) {
    await sendAlert(
      `Site inaccessible (HTTP ${site.code || 'timeout'})`,
      `URL : ${CONFIG.siteUrl}\nCode retourné : ${site.code || 'pas de réponse'}\nErreur : ${site.error || '-'}\nDurée : ${site.ms}ms`,
      'site_down'
    )
  } else {
    console.log(`[MONITOR] ✅ Site OK (HTTP ${site.code}, ${site.ms}ms)`)
    await sendRecovery('Site akiliproperty.fr accessible', 'site_down')
  }

  // 2. API backend
  const api = await checkHttp(CONFIG.apiUrl, 200)
  if (!api.ok) {
    await sendAlert(
      `API backend ne répond pas (HTTP ${api.code || 'timeout'})`,
      `URL : ${CONFIG.apiUrl}\nCode retourné : ${api.code || 'pas de réponse'}\nErreur : ${api.error || '-'}\nDurée : ${api.ms}ms`,
      'api_down'
    )
  } else {
    console.log(`[MONITOR] ✅ API OK (HTTP ${api.code}, ${api.ms}ms)`)
    await sendRecovery('API backend répond correctement', 'api_down')
  }

  // 3. PM2 process
  const pm2 = checkPM2()
  console.log(`[MONITOR] ${pm2.ok ? '✅' : '❌'} ${pm2.details}`)
  if (!pm2.ok) {
    await sendAlert('Processus backend arrêté (PM2)', pm2.details, 'pm2_down')
  } else {
    await sendRecovery('Processus PM2 akili-backend en ligne', 'pm2_down')
  }

  // 4. Mémoire RAM
  const mem = checkMemory()
  console.log(`[MONITOR] ${mem.ok ? '✅' : '⚠️ '} ${mem.details}`)
  if (!mem.ok) {
    await sendAlert('Mémoire RAM critique (> 90%)', mem.details, 'memory_high')
  }

  // 5. Disque
  const disk = checkDisk()
  console.log(`[MONITOR] ${disk.ok ? '✅' : '⚠️ '} ${disk.details}`)
  if (!disk.ok) {
    await sendAlert('Espace disque critique (> 90%)', disk.details, 'disk_full')
  }

  // 6. Erreurs récentes dans les logs
  const errors = checkRecentErrors()
  if (errors.hasErrors) {
    await sendAlert(
      `Pic d'erreurs backend (${errors.count} erreurs en 5min)`,
      `Nombre d'erreurs : ${errors.count}\n\nExtrait des logs :\n${errors.sample}`,
      'error_spike'
    )
  }

  console.log(`[MONITOR ${ts}] ✅ Vérification terminée`)
}

// ─── Démarrage ───────────────────────────────────────────────────────────────
console.log(`
╔══════════════════════════════════════════════════╗
║       AKILI Property — Monitoring actif          ║
║  Vérification toutes les ${CONFIG.checkIntervalMs / 60000} minutes              ║
║  Alertes → ${CONFIG.alertEmail}  ║
╚══════════════════════════════════════════════════╝
`)

// Première vérification immédiate
runCheck().catch(console.error)

// Puis toutes les 5 minutes
setInterval(() => runCheck().catch(console.error), CONFIG.checkIntervalMs)
