const params = new URLSearchParams(window.location.search);
const website = params.get('website') || '';
const targetUrl = document.getElementById('targetUrl');
const progressBar = document.getElementById('progressBar');
const progressNumber = document.getElementById('progressNumber');
const scanMessage = document.getElementById('scanMessage');
const modelName = document.getElementById('modelName');
const modelStrip = document.getElementById('modelStrip');
const liveFeed = document.getElementById('liveFeed');
const leadModal = document.getElementById('leadModal');
const closeModal = document.getElementById('closeModal');
const leadForm = document.getElementById('leadForm');
const leadWebsite = document.getElementById('leadWebsite');
const formStatus = document.getElementById('formStatus');

function safeUrl(value) {
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

const cleanWebsite = safeUrl(website);
if (!cleanWebsite) window.location.href = '/';
targetUrl.textContent = cleanWebsite;
leadWebsite.value = cleanWebsite;

const steps = [
  ['Validating the website…', 'We are checking if this is a real public website we can safely scan.'],
  ['Reading live page data…', 'We are pulling the actual title, description, headings, links, images, and page structure.'],
  ['Checking Google visibility…', 'We are scoring SEO signals like title, meta description, headings, sitemap, and index-friendly structure.'],
  ['Scanning AI search readiness…', 'We are checking schema, clear answers, trust signals, and content structure for 2026 AI discovery.'],
  ['Measuring speed signals…', 'We are checking response time, page size, scripts, and mobile-friendly basics.'],
  ['Looking for lead leaks…', 'We are finding weak calls-to-action, missing trust points, and contact-flow gaps.'],
  ['Building real scores…', 'Your score is being calculated from visible checks, not random numbers.'],
  ['Preparing your results…', 'Almost done — your website growth report is being prepared with simple next steps.']
];

function addFeed(text) {
  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `<span></span><p>${text}</p>`;
  liveFeed.prepend(item);
  while (liveFeed.children.length > 5) liveFeed.lastElementChild.remove();
}

function addAnalysisFeed(analysis) {
  addFeed(`Real score calculated: ${analysis.scores.overall}/100 overall.`);
  addFeed(`Detected ${analysis.metrics.wordCount} words, ${analysis.metrics.h2Count} subheadings, and ${analysis.metrics.linkCount} links.`);
  if (analysis.issues?.[0]) addFeed(`Top issue: ${analysis.issues[0]}.`);
}

const MIN_SCAN_MS = 60000;
const startedAt = Date.now();
let progress = 0;
let index = 0;
let analysisReady = false;
let progressDone = false;
let analysisError = '';
addFeed('Live scan started. We are checking the actual website now.');

const analysisRequest = fetch(`/api/analyze?website=${encodeURIComponent(cleanWebsite)}`)
  .then(async (response) => {
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || 'Unable to analyze this website.');
    analysisReady = true;
    addAnalysisFeed(data.analysis);
    return data.analysis;
  })
  .catch((error) => {
    analysisError = error.message || 'Unable to analyze this website.';
    modelName.textContent = 'Website scan needs attention';
    scanMessage.textContent = analysisError;
    addFeed(analysisError);
    return null;
  });

function maybeOpenLeadForm() {
  if (analysisError) return;
  if (progressDone && analysisReady) {
    setTimeout(() => leadModal.classList.remove('hidden'), 700);
  }
}

const timer = setInterval(() => {
  const elapsed = Date.now() - startedAt;
  const timeProgress = Math.min(98, Math.floor((elapsed / MIN_SCAN_MS) * 98));
  const stepBoost = Math.floor(Math.random() * 2);
  progress = Math.max(progress, Math.min(98, timeProgress + stepBoost));

  if (analysisReady && elapsed >= MIN_SCAN_MS) progress = 100;

  const nextIndex = Math.min(steps.length - 1, Math.floor((progress / 100) * steps.length));
  if (nextIndex !== index || progress === 100) {
    index = nextIndex;
    const [title, message] = steps[index];
    modelName.textContent = title;
    scanMessage.textContent = message;
    addFeed(message);

    [...modelStrip.children].forEach((child, childIndex) => {
      child.classList.toggle('active', childIndex === index % modelStrip.children.length);
    });
  }

  progressBar.style.width = `${progress}%`;
  progressNumber.textContent = `${progress}%`;

  if (progress >= 100 || analysisError) {
    clearInterval(timer);
    progressDone = true;
    maybeOpenLeadForm();
  }
}, 1200);

analysisRequest.then(() => maybeOpenLeadForm());

closeModal.addEventListener('click', () => leadModal.classList.add('hidden'));
leadModal.addEventListener('click', (event) => {
  if (event.target === leadModal) leadModal.classList.add('hidden');
});

leadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formStatus.textContent = 'Preparing your real report request…';
  const payload = Object.fromEntries(new FormData(leadForm).entries());

  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Something went wrong.');
    formStatus.innerHTML = data.reportUrl ? `${data.message} <a href="${data.reportUrl}" target="_blank" rel="noopener">Open report</a>` : data.message;
    leadForm.reset();
  } catch (error) {
    formStatus.textContent = error.message || 'Unable to submit right now. Please try again.';
  }
});
