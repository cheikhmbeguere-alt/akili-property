import nodemailer from 'nodemailer';

// ─── Configuration SMTP ────────────────────────────────────────────────────────
// Variables d'environnement requises :
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
// Optionnel :
//   SMTP_SECURE (true pour port 465, false pour 587)

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

const FROM = process.env.SMTP_FROM || 'noreply@akili-property.fr';
const APP_NAME = 'AKILI PROPERTY';

// ─── Vérification de la config ────────────────────────────────────────────────
export const isMailConfigured = (): boolean =>
  !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('fr-FR');

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
      Cet email a été envoyé automatiquement par ${APP_NAME}. Ne pas répondre directement à ce message.
    </div>
  </div>
</body>
</html>`;

// ─── Relance impayé ───────────────────────────────────────────────────────────
export interface RelanceData {
  locataire_nom:   string;
  locataire_email: string;
  bail_code:       string;
  lot_code:        string;
  immeuble_name:   string;
  montant_impaye:  number;
  nb_quittances:   number;
  type:            'premier_rappel' | 'deuxieme_rappel' | 'mise_en_demeure';
}

export const sendRelance = async (data: RelanceData): Promise<void> => {
  const typeLabels = {
    premier_rappel:    'Premier rappel de paiement',
    deuxieme_rappel:   'Deuxième rappel de paiement',
    mise_en_demeure:   'Mise en demeure',
  };
  const subject = `[${APP_NAME}] ${typeLabels[data.type]} — ${data.bail_code}`;

  const urgenceHtml = data.type === 'mise_en_demeure'
    ? `<div class="warning">⚠️ <strong>Mise en demeure :</strong> Sans régularisation sous 8 jours, nous serons contraints d'engager les procédures légales.</div>`
    : '';

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
  `;

  await transporter.sendMail({
    from:    `"${APP_NAME}" <${FROM}>`,
    to:      data.locataire_email,
    subject,
    html:    baseHtml(typeLabels[data.type], body),
  });
};

// ─── Alerte échéance bail ─────────────────────────────────────────────────────
export interface AlerteEcheanceData {
  locataire_nom:   string;
  locataire_email: string;
  bail_code:       string;
  lot_code:        string;
  immeuble_name:   string;
  end_date:        string;
  jours_restants:  number;
}

export const sendAlerteEcheance = async (data: AlerteEcheanceData): Promise<void> => {
  const subject = `[${APP_NAME}] Échéance de bail dans ${data.jours_restants} jour(s) — ${data.bail_code}`;

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
  `;

  await transporter.sendMail({
    from:    `"${APP_NAME}" <${FROM}>`,
    to:      data.locataire_email,
    subject,
    html:    baseHtml(`Échéance dans ${data.jours_restants} jour(s)`, body),
  });
};

// ─── Résumé mensuel gestionnaire ─────────────────────────────────────────────
export interface ResumeMensuelData {
  gestionnaire_email: string;
  gestionnaire_nom:   string;
  mois_label:         string;
  total_encaisse:     number;
  nb_impayes:         number;
  montant_impayes:    number;
  nb_baux_actifs:     number;
  nb_alertes_echeance: number;
}

export const sendResumeMensuel = async (data: ResumeMensuelData): Promise<void> => {
  const subject = `[${APP_NAME}] Résumé mensuel — ${data.mois_label}`;

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
  `;

  await transporter.sendMail({
    from:    `"${APP_NAME}" <${FROM}>`,
    to:      data.gestionnaire_email,
    subject,
    html:    baseHtml(`Résumé — ${data.mois_label}`, body),
  });
};
