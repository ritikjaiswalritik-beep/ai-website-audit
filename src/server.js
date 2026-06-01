const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const fs = require('fs/promises');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, '..', 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const LEADS_FILE = path.join(DATA_DIR, 'leads.jsonl');

app.set('trust proxy', true);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function normalizeUrl(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function clean(value, max = 160) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function publicBaseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL || process.env.BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function scoreFromText(text, salt, min = 38, max = 88) {
  const hash = crypto.createHash('sha256').update(`${text}:${salt}`).digest();
  return min + (hash[0] % (max - min + 1));
}

function buildReport({ id, website, name, business, createdAt }) {
  const seo = scoreFromText(website, 'seo');
  const aiVisibility = scoreFromText(website, 'ai', 22, 74);
  const speed = scoreFromText(website, 'speed', 45, 91);
  const conversion = scoreFromText(website, 'conversion', 28, 80);
  const overall = Math.round((seo + aiVisibility + speed + conversion) / 4);

  return {
    id,
    website,
    name,
    business,
    createdAt,
    expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    scores: { overall, seo, aiVisibility, speed, conversion },
    fixes: [
      'Make the first screen instantly explain who you help, what you do, and why visitors should trust you.',
      'Improve headings and page structure so Google and AI answer engines can understand your offer faster.',
      'Add stronger proof points, clearer calls-to-action, and easier contact paths to reduce lead drop-off.',
      'Tighten mobile spacing, readability, and speed signals so phone visitors can take action quickly.'
    ]
  };
}

async function saveReport(report) {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(path.join(REPORTS_DIR, `${report.id}.json`), JSON.stringify(report, null, 2), 'utf8');
}

function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

async function sendReportEmail(lead, reportUrl) {
  const transporter = getTransporter();
  if (!transporter) return { skipped: true };

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const adminEmail = process.env.ADMIN_EMAIL;

  await transporter.sendMail({
    from,
    to: lead.email,
    subject: 'Your website report is ready',
    text: [
      `Hi ${lead.name},`,
      '',
      'Thanks for using AnalyzeMySite. Your website growth report is ready.',
      '',
      'Open your report here:',
      reportUrl,
      '',
      'The report shows what to fix so more people can find you, trust you, and contact you.',
      '',
      'Cheers,',
      'AnalyzeMySite'
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:620px;margin:auto;padding:24px">
        <h2 style="margin:0 0 12px">Your website report is ready</h2>
        <p>Hi ${escapeHtml(lead.name)},</p>
        <p>Thanks for using AnalyzeMySite. We prepared your website growth report.</p>
        <p style="margin:28px 0"><a href="${reportUrl}" style="background:#b11226;color:#fff;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:700">Open my report</a></p>
        <p>The report shows what to fix so more people can find you, trust you, and contact you.</p>
        <p style="color:#666;font-size:13px">This report link is intended to be available for 15 days.</p>
        <p>Cheers,<br>AnalyzeMySite</p>
      </div>`
  });

  if (adminEmail) {
    await transporter.sendMail({
      from,
      to: adminEmail,
      subject: `New AnalyzeMySite Lead - ${lead.website}`,
      text: [
        'New AnalyzeMySite lead received:',
        '',
        `Website: ${lead.website}`,
        `Report: ${reportUrl}`,
        `Name: ${lead.name}`,
        `Email: ${lead.email}`,
        `Phone: ${lead.phone}`,
        `Business: ${lead.business || '-'}`,
        `Submitted: ${lead.createdAt}`
      ].join('\n')
    });
  }

  return { sent: true };
}

function renderReport(report) {
  const scores = report.scores;
  const scoreRows = [
    ['Overall', scores.overall],
    ['SEO Readiness', scores.seo],
    ['AI Visibility', scores.aiVisibility],
    ['Speed Experience', scores.speed],
    ['Lead Conversion', scores.conversion]
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Website Report | AnalyzeMySite</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css?v=20260601-personal-copy" />
  <style>
    .report-page { width:min(980px,calc(100% - 32px)); margin:0 auto; padding:34px 0 70px; }
    .report-hero { padding:34px 0; }
    .report-hero h1 { max-width:850px; }
    .report-card { border:1px solid var(--border); border-radius:22px; background:#fff; box-shadow:var(--shadow); padding:22px; margin-top:18px; }
    .report-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .result-row { display:flex; justify-content:space-between; gap:14px; border:1px solid var(--border); border-radius:16px; padding:16px; font-weight:800; }
    .result-row strong { color:var(--accent); }
    .fix-list { display:grid; gap:12px; padding:0; margin:18px 0 0; list-style:none; }
    .fix-list li { border:1px solid var(--border); border-radius:16px; padding:16px; background:#fff8f9; color:#333; }
    @media (max-width:760px){ .report-grid { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <div class="report-page">
    <header class="analysis-header">
      <a class="brand" href="/"><span class="brand-mark">A</span><span>AnalyzeMySite</span></a>
      <span class="secure-pill">Report ready</span>
    </header>
    <main>
      <section class="report-hero">
        <p class="small-label">Website growth report</p>
        <h1>Your website has opportunities to get more traffic, trust, and leads.</h1>
        <p class="hero-copy">Report for <strong>${escapeHtml(report.website)}</strong>. Use this as a simple starting point for what to improve first.</p>
      </section>
      <section class="report-card">
        <h2>Your scores</h2>
        <div class="report-grid">
          ${scoreRows.map(([label, value]) => `<div class="result-row"><span>${label}</span><strong>${value}/100</strong></div>`).join('')}
        </div>
      </section>
      <section class="report-card">
        <p class="small-label">Recommended fixes</p>
        <h2>What to improve first</h2>
        <ul class="fix-list">
          ${report.fixes.map((fix) => `<li>${escapeHtml(fix)}</li>`).join('')}
        </ul>
      </section>
    </main>
  </div>
</body>
</html>`;
}

app.post('/api/leads', async (req, res) => {
  const website = normalizeUrl(req.body.website);
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120);
  const phone = clean(req.body.phone, 40);
  const business = clean(req.body.business, 120);

  if (!website || !name || !email || !phone) {
    return res.status(400).json({ ok: false, message: 'Website, name, email, and phone are required.' });
  }

  const reportId = crypto.randomBytes(16).toString('hex');
  const report = buildReport({ id: reportId, website, name, business, createdAt: new Date().toISOString() });
  const reportUrl = `${publicBaseUrl(req)}/report/${reportId}`;

  const lead = {
    website,
    name,
    email,
    phone,
    business,
    reportId,
    reportUrl,
    createdAt: report.createdAt,
    userAgent: clean(req.get('user-agent'), 220),
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  await saveReport(report);
  await fs.appendFile(LEADS_FILE, JSON.stringify(lead) + '\n', 'utf8');

  try {
    await sendReportEmail(lead, reportUrl);
  } catch (error) {
    console.error('Email delivery failed:', error.message);
  }

  res.json({ ok: true, reportUrl, message: 'Your report link is ready. Check your email, or open the report link shown here.' });
});

app.get('/report/:id', async (req, res) => {
  const id = String(req.params.id || '').replace(/[^a-f0-9]/g, '');
  if (id.length !== 32) return res.status(404).send('Report not found');

  try {
    const raw = await fs.readFile(path.join(REPORTS_DIR, `${id}.json`), 'utf8');
    const report = JSON.parse(raw);
    if (Date.parse(report.expiresAt) < Date.now()) return res.status(410).send('This report link has expired.');
    res.type('html').send(renderReport(report));
  } catch {
    res.status(404).send('Report not found');
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`AnalyzeMySite running on port ${PORT}`);
});
