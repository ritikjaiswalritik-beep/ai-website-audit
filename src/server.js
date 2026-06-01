const express = require('express');
const helmet = require('helmet');
const fs = require('fs/promises');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, '..', 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.jsonl');

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

async function sendLeadEmail(lead) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, ADMIN_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !ADMIN_EMAIL) return { skipped: true };

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  await transporter.sendMail({
    from: MAIL_FROM || SMTP_USER,
    to: ADMIN_EMAIL,
    subject: `New AI Website Audit Lead - ${lead.website}`,
    text: [
      'New AI Website Audit lead received:',
      '',
      `Website: ${lead.website}`,
      `Name: ${lead.name}`,
      `Email: ${lead.email}`,
      `Phone: ${lead.phone}`,
      `Business: ${lead.business || '-'}`,
      `Submitted: ${lead.createdAt}`
    ].join('\n')
  });

  return { sent: true };
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

  const lead = {
    website,
    name,
    email,
    phone,
    business,
    createdAt: new Date().toISOString(),
    userAgent: clean(req.get('user-agent'), 220),
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.appendFile(LEADS_FILE, JSON.stringify(lead) + '\n', 'utf8');

  try {
    await sendLeadEmail(lead);
  } catch (error) {
    console.error('Email delivery failed:', error.message);
  }

  res.json({ ok: true, message: 'Your website audit request has been received. The report will be shared by email.' });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`AI Audit website running on port ${PORT}`);
});
