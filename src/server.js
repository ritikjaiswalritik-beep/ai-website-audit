const crypto = require('crypto');
const dns = require('dns/promises');
const net = require('net');
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

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

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
    if (!url.hostname.includes('.') || url.hostname.length < 4) return '';
    url.hash = '';
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

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
  }
  if (net.isIPv6(ip)) {
    const value = ip.toLowerCase();
    return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:');
  }
  return true;
}

async function assertPublicWebsite(urlText) {
  const url = new URL(urlText);
  if (['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname.toLowerCase())) {
    throw new Error('Please enter a public website URL.');
  }
  const records = await dns.lookup(url.hostname, { all: true, verbatim: false });
  if (!records.length || records.some((record) => isPrivateIp(record.address))) {
    throw new Error('Please enter a public website URL.');
  }
}

function textBetween(source, regex) {
  const match = source.match(regex);
  return match ? clean(match[1].replace(/<[^>]+>/g, ' '), 240) : '';
}

function countMatches(source, regex) {
  return (source.match(regex) || []).length;
}

function hasAny(source, words) {
  return words.some((word) => source.includes(word));
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function grade(score) {
  if (score >= 85) return 'Strong';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Needs work';
  return 'Critical gaps';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkExists(url) {
  try {
    const response = await fetchWithTimeout(url, { method: 'HEAD', redirect: 'follow' }, 6000);
    return response.ok;
  } catch {
    return false;
  }
}

async function analyzeWebsite(website) {
  const normalized = normalizeUrl(website);
  if (!normalized) throw new Error('Enter a valid website URL, like example.com.');
  await assertPublicWebsite(normalized);

  const candidates = [normalized];
  const parsedInput = new URL(normalized);
  if (parsedInput.protocol === 'https:') {
    const httpFallback = new URL(normalized);
    httpFallback.protocol = 'http:';
    candidates.push(httpFallback.toString());
  }

  let response;
  let loadMs = 0;
  let lastError;
  for (const candidate of candidates) {
    try {
      await assertPublicWebsite(candidate);
      const startedAt = Date.now();
      response = await fetchWithTimeout(candidate, {
        redirect: 'follow',
        headers: {
          'user-agent': 'AnalyzeMySiteBot/1.0 (+https://analyzemysite.local)',
          accept: 'text/html,application/xhtml+xml'
        }
      });
      loadMs = Date.now() - startedAt;
      if (response.ok) break;
      lastError = new Error(`Website returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
      response = null;
    }
  }

  if (!response || !response.ok) throw new Error(lastError?.message || 'Unable to open this website right now.');
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
    throw new Error('That URL does not look like a public website page.');
  }

  const raw = await response.text();
  const html = raw.slice(0, 900000);
  const lower = html.toLowerCase();
  const finalUrl = response.url || normalized;
  const final = new URL(finalUrl);
  const origin = final.origin;

  const title = textBetween(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = textBetween(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i)
    || textBetween(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i);
  const h1 = textBetween(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1Count = countMatches(lower, /<h1\b/g);
  const h2Count = countMatches(lower, /<h2\b/g);
  const imageCount = countMatches(lower, /<img\b/g);
  const imageAltCount = countMatches(lower, /<img\b[^>]*\salt=/g);
  const linkCount = countMatches(lower, /<a\b/g);
  const scriptCount = countMatches(lower, /<script\b/g);
  const stylesheetCount = countMatches(lower, /rel=["']stylesheet["']/g);
  const schemaCount = countMatches(lower, /application\/ld\+json/g);
  const wordCount = clean(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '), 200000).split(/\s+/).filter(Boolean).length;

  const hasViewport = lower.includes('name="viewport"') || lower.includes("name='viewport'");
  const hasCanonical = lower.includes('rel="canonical"') || lower.includes("rel='canonical'");
  const hasOg = lower.includes('property="og:') || lower.includes("property='og:");
  const hasTwitter = lower.includes('name="twitter:') || lower.includes("name='twitter:");
  const hasFaq = lower.includes('faq') || lower.includes('question');
  const hasContact = hasAny(lower, ['contact', 'phone', 'whatsapp', 'email', 'book a call', 'get quote']);
  const hasTrust = hasAny(lower, ['testimonial', 'review', 'case study', 'clients', 'trusted', 'privacy', 'about']);
  const hasCta = hasAny(lower, ['get started', 'contact us', 'book', 'call now', 'request', 'start', 'buy', 'quote', 'sign up']);
  const hasHttps = final.protocol === 'https:';
  const robots = await checkExists(`${origin}/robots.txt`);
  const sitemap = await checkExists(`${origin}/sitemap.xml`);
  const pageKb = Buffer.byteLength(html, 'utf8') / 1024;
  const altRatio = imageCount ? imageAltCount / imageCount : 1;

  const seo = clampScore(
    (title ? 14 : 0) +
    (description ? 14 : 0) +
    (h1Count === 1 ? 12 : h1Count > 1 ? 6 : 0) +
    (h2Count >= 2 ? 8 : h2Count ? 4 : 0) +
    (hasCanonical ? 8 : 0) +
    (robots ? 8 : 0) +
    (sitemap ? 10 : 0) +
    (hasOg ? 6 : 0) +
    (wordCount >= 450 ? 12 : wordCount >= 200 ? 7 : 2) +
    (linkCount >= 6 ? 8 : 4)
  );

  const aiVisibility = clampScore(
    (title ? 10 : 0) +
    (description ? 10 : 0) +
    (h1 ? 10 : 0) +
    (h2Count >= 3 ? 12 : h2Count ? 6 : 0) +
    (schemaCount ? 16 : 0) +
    (hasFaq ? 12 : 0) +
    (hasTrust ? 10 : 0) +
    (wordCount >= 700 ? 12 : wordCount >= 350 ? 8 : 3) +
    (hasContact ? 8 : 0)
  );

  const speed = clampScore(
    100 -
    (loadMs > 2500 ? 24 : loadMs > 1500 ? 14 : loadMs > 900 ? 7 : 0) -
    (pageKb > 900 ? 24 : pageKb > 500 ? 14 : pageKb > 250 ? 7 : 0) -
    (scriptCount > 30 ? 16 : scriptCount > 18 ? 9 : scriptCount > 10 ? 4 : 0) -
    (stylesheetCount > 8 ? 8 : stylesheetCount > 4 ? 4 : 0)
  );

  const mobile = clampScore((hasViewport ? 45 : 10) + (pageKb < 500 ? 20 : 10) + (loadMs < 1800 ? 20 : 10) + (imageCount < 30 ? 15 : 8));

  const conversion = clampScore(
    (hasCta ? 24 : 6) +
    (hasContact ? 22 : 5) +
    (hasTrust ? 18 : 5) +
    (description ? 8 : 0) +
    (h1 ? 10 : 0) +
    (mobile >= 70 ? 10 : 5) +
    (altRatio >= 0.8 ? 8 : 3)
  );

  const overall = clampScore((seo * 0.28) + (aiVisibility * 0.24) + (speed * 0.18) + (mobile * 0.12) + (conversion * 0.18));

  const issues = [];
  const wins = [];
  if (title) wins.push('Page title found'); else issues.push('Missing page title');
  if (description) wins.push('Meta description found'); else issues.push('Missing meta description');
  if (h1Count === 1) wins.push('Single clear H1 found'); else issues.push(h1Count > 1 ? 'Multiple H1 headings found' : 'Missing H1 heading');
  if (schemaCount) wins.push('Structured data found'); else issues.push('No structured data detected for AI/search context');
  if (hasViewport) wins.push('Mobile viewport is present'); else issues.push('Missing mobile viewport tag');
  if (hasCta) wins.push('Call-to-action language detected'); else issues.push('Clear CTA language is weak or missing');
  if (hasTrust) wins.push('Trust signals detected'); else issues.push('Add testimonials, proof, about, or privacy trust signals');
  if (sitemap) wins.push('Sitemap found'); else issues.push('Sitemap not found at /sitemap.xml');
  if (loadMs > 1800) issues.push('Initial response feels slow and may reduce conversions');

  const fixes = [
    !description && 'Add a benefit-focused meta description so Google and AI tools understand the page faster.',
    h1Count !== 1 && 'Use one clear H1 that explains who you help and what outcome you provide.',
    !schemaCount && 'Add Organization, LocalBusiness, FAQ, or Service schema to improve 2026 AI/search readability.',
    !hasTrust && 'Add proof: testimonials, client logos, case studies, reviews, or clear about/contact information.',
    !hasCta && 'Make the next step obvious with stronger CTA buttons above the fold and near important sections.',
    loadMs > 1800 && 'Reduce heavy scripts/images so mobile visitors do not leave before the page loads.'
  ].filter(Boolean).slice(0, 6);

  while (fixes.length < 4) {
    fixes.push([
      'Make the first screen instantly explain who you help, what you do, and why visitors should trust you.',
      'Improve headings and page structure so Google and AI answer engines can understand your offer faster.',
      'Tighten mobile spacing, readability, and speed signals so phone visitors can take action quickly.',
      'Add clearer internal links and supporting sections that answer buyer questions before they contact you.'
    ][fixes.length]);
  }

  return {
    website: normalized,
    finalUrl,
    checkedAt: new Date().toISOString(),
    status: response.status,
    loadMs,
    pageKb: Math.round(pageKb),
    metrics: { title, description, h1, h1Count, h2Count, imageCount, imageAltCount, linkCount, scriptCount, wordCount, schemaCount, robots, sitemap, hasViewport, hasCanonical, hasOg, hasTwitter, hasContact, hasTrust, hasCta },
    scores: { overall, seo, aiVisibility, speed, mobile, conversion },
    grades: { overall: grade(overall), seo: grade(seo), aiVisibility: grade(aiVisibility), speed: grade(speed), mobile: grade(mobile), conversion: grade(conversion) },
    wins: wins.slice(0, 6),
    issues: issues.slice(0, 8),
    fixes
  };
}

async function buildReport({ id, website, name, business, createdAt }) {
  const analysis = await analyzeWebsite(website);
  return {
    id,
    website: analysis.website,
    name,
    business,
    createdAt,
    expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    scores: analysis.scores,
    grades: analysis.grades,
    fixes: analysis.fixes,
    analysis
  };
}

async function saveReport(report) {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(path.join(REPORTS_DIR, `${report.id}.json`), JSON.stringify(report, null, 2), 'utf8');
}

function reportSecret() {
  return process.env.REPORT_SECRET || 'analyzemysite-durable-report-v1';
}

function compactReport(report) {
  const analysis = report.analysis || {};
  return {
    v: 1,
    id: report.id,
    website: report.website,
    name: report.name,
    business: report.business,
    createdAt: report.createdAt,
    expiresAt: report.expiresAt,
    scores: report.scores,
    grades: report.grades,
    fixes: report.fixes,
    analysis: {
      finalUrl: analysis.finalUrl,
      loadMs: analysis.loadMs,
      pageKb: analysis.pageKb,
      metrics: analysis.metrics,
      issues: analysis.issues,
      wins: analysis.wins
    }
  };
}

function createReportToken(report) {
  const payload = Buffer.from(JSON.stringify(compactReport(report))).toString('base64url');
  const sig = crypto.createHmac('sha256', reportSecret()).update(payload).digest('base64url').slice(0, 32);
  return `${payload}.${sig}`;
}

function readReportToken(token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', reportSecret()).update(payload).digest('base64url').slice(0, 32);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
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
  const analysis = report.analysis || {};
  const scoreRows = [
    ['Overall', scores.overall],
    ['SEO Readiness', scores.seo],
    ['AI Visibility', scores.aiVisibility],
    ['Speed Experience', scores.speed],
    ['Mobile UX', scores.mobile],
    ['Lead Conversion', scores.conversion]
  ];
  const detailRows = [
    ['Final URL', analysis.finalUrl || report.website],
    ['Page title', analysis.metrics?.title || 'Not detected'],
    ['Meta description', analysis.metrics?.description || 'Not detected'],
    ['Load time', analysis.loadMs ? `${analysis.loadMs}ms` : '-'],
    ['Page size', analysis.pageKb ? `${analysis.pageKb}KB` : '-'],
    ['Words scanned', analysis.metrics?.wordCount || 0]
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
    .result-row strong { color:var(--accent); white-space:nowrap; }
    .fix-list { display:grid; gap:12px; padding:0; margin:18px 0 0; list-style:none; }
    .fix-list li { border:1px solid var(--border); border-radius:16px; padding:16px; background:#fff8f9; color:#333; }
    .detail-row { display:grid; grid-template-columns:170px 1fr; gap:12px; padding:12px 0; border-bottom:1px solid var(--border); color:#333; }
    .detail-row strong { color:#0a0a0a; }
    @media (max-width:760px){ .report-grid,.detail-row { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <div class="report-page">
    <header class="analysis-header">
      <a class="brand" href="/"><span class="brand-mark">A</span><span>AnalyzeMySite</span></a>
      <span class="secure-pill">Real scan report</span>
    </header>
    <main>
      <section class="report-hero">
        <p class="small-label">Website growth report</p>
        <h1>Your website has opportunities to get more traffic, trust, and leads.</h1>
        <p class="hero-copy">Report for <strong>${escapeHtml(report.website)}</strong>. Scores are based on deterministic checks from the live website HTML, metadata, speed response, trust signals, and 2026 search/AI-readiness signals.</p>
      </section>
      <section class="report-card">
        <h2>Your scores</h2>
        <div class="report-grid">
          ${scoreRows.map(([label, value]) => `<div class="result-row"><span>${label}</span><strong>${value}/100</strong></div>`).join('')}
        </div>
      </section>
      <section class="report-card">
        <p class="small-label">Website details detected</p>
        <h2>What we found</h2>
        ${detailRows.map(([label, value]) => `<div class="detail-row"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`).join('')}
      </section>
      <section class="report-card">
        <p class="small-label">Recommended fixes</p>
        <h2>What to improve first</h2>
        <ul class="fix-list">
          ${report.fixes.map((fix) => `<li>${escapeHtml(fix)}</li>`).join('')}
        </ul>
      </section>
      <section class="report-card">
        <p class="small-label">Detected issues</p>
        <h2>Why this score happened</h2>
        <ul class="fix-list">
          ${(analysis.issues || []).map((issue) => `<li>${escapeHtml(issue)}</li>`).join('')}
        </ul>
      </section>
    </main>
  </div>
</body>
</html>`;
}

app.get('/api/analyze', async (req, res) => {
  try {
    const website = normalizeUrl(req.query.website);
    if (!website) return res.status(400).json({ ok: false, message: 'Enter a real public website URL.' });
    const analysis = await analyzeWebsite(website);
    res.json({ ok: true, analysis });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message || 'Unable to analyze this website.' });
  }
});

app.post('/api/leads', async (req, res) => {
  const website = normalizeUrl(req.body.website);
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120);
  const phone = clean(req.body.phone, 40);
  const business = clean(req.body.business, 120);

  if (!website || !name || !email || !phone) {
    return res.status(400).json({ ok: false, message: 'Website, name, email, and phone are required.' });
  }

  let report;
  try {
    const reportId = crypto.randomBytes(16).toString('hex');
    report = await buildReport({ id: reportId, website, name, business, createdAt: new Date().toISOString() });
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message || 'Unable to analyze this website.' });
  }
  const reportToken = createReportToken(report);
  const reportUrl = `${publicBaseUrl(req)}/report/${reportToken}`;

  const lead = {
    website: report.website,
    name,
    email,
    phone,
    business,
    reportId: report.id,
    reportToken,
    reportUrl,
    createdAt: report.createdAt,
    scores: report.scores,
    userAgent: clean(req.get('user-agent'), 220),
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await saveReport(report);
  } catch (error) {
    console.error('Report file save failed, signed link will still work:', error.message);
  }
  await fs.appendFile(LEADS_FILE, JSON.stringify(lead) + '\n', 'utf8');

  try {
    await sendReportEmail(lead, reportUrl);
  } catch (error) {
    console.error('Email delivery failed:', error.message);
  }

  res.json({ ok: true, reportUrl, scores: report.scores, message: 'Your real website report is ready. Check your email, or open the report link shown here.' });
});

app.get('/report/:token', async (req, res) => {
  const token = String(req.params.token || '');

  try {
    const reportFromToken = readReportToken(token);
    if (reportFromToken) {
      if (Date.parse(reportFromToken.expiresAt) < Date.now()) return res.status(410).send('This report link has expired.');
      return res.type('html').send(renderReport(reportFromToken));
    }
  } catch (error) {
    console.error('Signed report token failed:', error.message);
  }

  const legacyId = token.replace(/[^a-f0-9]/g, '');
  if (legacyId.length === 32) {
    try {
      const raw = await fs.readFile(path.join(REPORTS_DIR, `${legacyId}.json`), 'utf8');
      const report = JSON.parse(raw);
      if (Date.parse(report.expiresAt) < Date.now()) return res.status(410).send('This report link has expired.');
      return res.type('html').send(renderReport(report));
    } catch {
      return res.status(404).type('html').send('<!doctype html><title>Report unavailable</title><p>This old report link is not available anymore. Please run a new scan to generate a durable report link.</p><p><a href="/">Run a new scan</a></p>');
    }
  }

  res.status(404).type('html').send('<!doctype html><title>Report not found</title><p>Report not found. Please check the link or run a new scan.</p><p><a href="/">Run a new scan</a></p>');
});

app.get('/health', (_req, res) => res.json({ ok: true, service: 'AnalyzeMySite' }));

app.use((req, res) => {
  res.status(404).type('html').send('<!doctype html><title>Not found</title><p>Page not found. <a href="/">Go home</a></p>');
});

app.use((error, _req, res, _next) => {
  console.error('Request error:', error);
  res.status(500).json({ ok: false, message: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`AnalyzeMySite running on port ${PORT}`);
});
