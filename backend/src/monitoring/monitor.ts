/**
 * AKILI Property — Monitoring automatique
 * ─────────────────────────────────────────
 * Vérifie toutes les 5 minutes :
 *   1. Site web accessible (HTTP 200)
 *   2. API backend répond correctement
 *   3. Mémoire RAM (alerte > 90%)
 *   4. Espace disque (alerte > 90%)
 *   5. Processus PM2 en ligne
 *
 * Alertes → support@increase360.fr
 * Expéditeur → akiliproperty@akili-so.fr (boîte partagée, sans licence)
 * Cooldown → 1 email max par heure par type d'incident
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as https from 'https'
import * as http from 'http'
import { sendMonitorAlert, sendMonitorRecovery } from '../services/mail.service'

// ─── Configuration ─────────────────────────────────────────────────────────
const CONFIG = {
  checkIntervalMs: 5 * 60 * 1000,   // toutes les 5 minutes
  cooldownMs:      60 * 60 * 1000,  // 1 alerte max par heure par type
  alertEmail:      'support@increase360.fr',
  siteUrl:         'https://akiliproperty.fr',
  apiUrl:          'https://akiliproperty.fr/api/bails?limit=1',
  stateFile:       '/tmp/akili_monitor_state.json',
}

// ─── Cooldown ──────────────────────────────────────────────────────────────
interface AlertState { [key: string]: number }

function loadState(): AlertState {
  try { return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf-8')) } catch { return {} }
}
function saveState(s: AlertState) {
  fs.writeFileSync(CONFIG.stateFile, JSON.stringify(s))
}
function canAlert(s: AlertState, key: string): boolean {
  return Date.now() - (s[key] || 0) > CONFIG.cooldownMs
}

// ─── Alertes avec cooldown ─────────────────────────────────────────────────
async function alert(subject: string, details: string, key: string) {
  const s = loadState()
  if (!canAlert(s, key)) { console.log(`[MONITOR] cooldown actif → ${key}`); return }
  try {
    await sendMonitorAlert(CONFIG.alertEmail, subject, details)
    console.log(`[MONITOR] 🚨 Alerte envoyée : ${subject}`)
    s[key] = Date.now()
    saveState(s)
  } catch (e: any) {
    console.error(`[MONITOR] ❌ Échec envoi alerte : ${e.message}`)
  }
}

async function recovery(subject: string, key: string) {
  const s = loadState()
  const rKey = `${key}_ok`
  if (!canAlert(s, rKey)) return
  // N'envoyer le rétablissement que si une alerte avait été déclenchée
  if (!s[key]) return
  try {
    await sendMonitorRecovery(CONFIG.alertEmail, subject)
    console.log(`[MONITOR] ✅ Rétablissement envoyé : ${subject}`)
    delete s[key]
    s[rKey] = Date.now()
    saveState(s)
  } catch (e: any) {
    console.error(`[MONITOR] ❌ Échec envoi rétablissement : ${e.message}`)
  }
}

// ─── Checks ────────────────────────────────────────────────────────────────

function checkHttp(url: string, timeoutMs = 10_000): Promise<{ ok: boolean; code: number; ms: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now()
    const lib = url.startsWith('https') ? https : http
    const req = (lib as typeof https).get(url, { timeout: timeoutMs }, (res) => {
      const ms = Date.now() - start
      resolve({ ok: (res.statusCode ?? 0) < 400, code: res.statusCode ?? 0, ms })
      res.resume()
    })
    req.on('error', (e) => resolve({ ok: false, code: 0, ms: Date.now() - start, error: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, code: 0, ms: timeoutMs, error: 'timeout' }) })
  })
}

function checkMemory(): { ok: boolean; pct: number; details: string } {
  try {
    const lines = execSync('free -m').toString().split('\n')
    const parts = lines[1].trim().split(/\s+/)
    const total = parseInt(parts[1]), used = parseInt(parts[2])
    const pct = Math.round((used / total) * 100)
    return { ok: pct < 90, pct, details: `RAM : ${pct}% utilisée (${used}Mo / ${total}Mo)` }
  } catch { return { ok: true, pct: 0, details: 'RAM non lisible' } }
}

function checkDisk(): { ok: boolean; pct: number; details: string } {
  try {
    const parts = execSync('df -h / | tail -1').toString().trim().split(/\s+/)
    const pct = parseInt(parts[4])
    return { ok: pct < 90, pct, details: `Disque : ${pct}% utilisé (libre : ${parts[3]})` }
  } catch { return { ok: true, pct: 0, details: 'Disque non lisible' } }
}

function checkPM2(): { ok: boolean; status: string; restarts: number } {
  try {
    const list = JSON.parse(execSync('pm2 jlist 2>/dev/null').toString()) as any[]
    const proc = list.find((p: any) => p.name === 'akili-backend')
    if (!proc) return { ok: false, status: 'introuvable', restarts: 0 }
    return {
      ok:       proc.pm2_env?.status === 'online',
      status:   proc.pm2_env?.status || 'unknown',
      restarts: proc.pm2_env?.restart_time || 0,
    }
  } catch { return { ok: false, status: 'erreur PM2', restarts: 0 } }
}

// ─── Boucle principale ─────────────────────────────────────────────────────
async function runCheck(): Promise<void> {
  const ts = new Date().toLocaleTimeString('fr-FR')
  console.log(`\n[MONITOR ${ts}] ── Vérification ──────────────────────`)

  // 1. Site web
  const site = await checkHttp(CONFIG.siteUrl)
  if (!site.ok) {
    console.log(`[MONITOR] ❌ Site KO (HTTP ${site.code}, ${site.error || ''})`)
    await alert(
      `Site inaccessible (HTTP ${site.code || 'timeout'})`,
      `URL : ${CONFIG.siteUrl}\nCode : ${site.code || 'pas de réponse'}\nErreur : ${site.error || '-'}\nDurée : ${site.ms}ms`,
      'site_down',
    )
  } else {
    console.log(`[MONITOR] ✅ Site OK (HTTP ${site.code}, ${site.ms}ms)`)
    await recovery('Site akiliproperty.fr accessible', 'site_down')
  }

  // 2. API
  const api = await checkHttp(CONFIG.apiUrl)
  if (!api.ok) {
    console.log(`[MONITOR] ❌ API KO (HTTP ${api.code})`)
    await alert(
      `API backend ne répond pas (HTTP ${api.code || 'timeout'})`,
      `URL : ${CONFIG.apiUrl}\nCode : ${api.code || 'pas de réponse'}\nErreur : ${api.error || '-'}\nDurée : ${api.ms}ms`,
      'api_down',
    )
  } else {
    console.log(`[MONITOR] ✅ API OK (HTTP ${api.code}, ${api.ms}ms)`)
    await recovery('API backend opérationnelle', 'api_down')
  }

  // 3. PM2
  const pm2 = checkPM2()
  console.log(`[MONITOR] ${pm2.ok ? '✅' : '❌'} PM2 akili-backend : ${pm2.status} (redémarrages : ${pm2.restarts})`)
  if (!pm2.ok) {
    await alert(
      `Processus backend arrêté (PM2 status: ${pm2.status})`,
      `Processus : akili-backend\nStatus PM2 : ${pm2.status}\nNb redémarrages : ${pm2.restarts}\n\nAction : ssh root@46.62.160.11 puis pm2 restart akili-backend`,
      'pm2_down',
    )
  } else {
    await recovery('Processus PM2 akili-backend en ligne', 'pm2_down')
  }

  // 4. Mémoire
  const mem = checkMemory()
  console.log(`[MONITOR] ${mem.ok ? '✅' : '⚠️ '} ${mem.details}`)
  if (!mem.ok) await alert(`Mémoire RAM critique (${mem.pct}%)`, mem.details, 'memory_high')

  // 5. Disque
  const disk = checkDisk()
  console.log(`[MONITOR] ${disk.ok ? '✅' : '⚠️ '} ${disk.details}`)
  if (!disk.ok) await alert(`Espace disque critique (${disk.pct}%)`, disk.details, 'disk_full')

  console.log(`[MONITOR ${ts}] ── Fin ────────────────────────────────`)
}

// ─── Démarrage ─────────────────────────────────────────────────────────────
console.log(`
╔═══════════════════════════════════════════════════════╗
║         AKILI Property — Monitoring actif             ║
║  Vérification toutes les 5 min                        ║
║  Alertes → support@increase360.fr                     ║
║  Expéditeur → akiliproperty@akili-so.fr               ║
╚═══════════════════════════════════════════════════════╝
`)

runCheck().catch(console.error)
setInterval(() => runCheck().catch(console.error), CONFIG.checkIntervalMs)
