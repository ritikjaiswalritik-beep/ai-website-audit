# AnalyzeMySite

Minimal professional Node.js lead-generation website inspired by modern audit tools.

## Features

- URL-first landing page
- 60-second style AI analysis loading experience
- Minimal white SaaS design
- Lead capture popup: name, email, phone, business
- Saves leads to `data/leads.jsonl`
- Optional email notification with SMTP/Nodemailer
- Hostinger Node.js-ready

## Local Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env` and configure SMTP for email notifications.

## Report Link Flow

When a visitor submits the form after the scan, AnalyzeMySite now creates a unique `/report/:id` result page and stores it under `data/reports/`. If SMTP is configured, the visitor receives an email with their report link, similar to a professional SEO analyzer flow.

Set `PUBLIC_BASE_URL` to your live domain so email links use the correct website URL.
