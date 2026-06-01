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
    const url = new URL(value);
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
  ['GPT-style reasoning layer', 'Reading your website like a buyer and finding unclear messaging that can reduce trust.'],
  ['Claude-style clarity review', 'Checking if your offer, sections, and copy are simple enough for visitors to understand fast.'],
  ['Gemini-style discovery scan', 'Looking for SEO opportunities, missing page signals, and modern search visibility gaps.'],
  ['Perplexity-style citation check', 'Testing if your content looks credible enough to be quoted by AI answer engines.'],
  ['ChatGPT 2026 intent mapping', 'Matching your website pages with user search intent and lead-generation potential.'],
  ['AI Overview readiness', 'Checking headings, snippets, and answer-friendly content structure.'],
  ['GEO / AEO visibility engine', 'Reviewing if AI search systems can extract your expertise, services, and location clearly.'],
  ['Mobile buyer journey analysis', 'Finding friction points that can make phone users leave before contacting you.'],
  ['Conversion leak detector', 'Reviewing CTAs, trust signals, contact flow, and report-worthy growth blockers.'],
  ['Final growth report builder', 'Prioritizing the most valuable fixes for traffic, leads, and AI visibility.']
];

function addFeed(text) {
  const item = document.createElement('div');
  item.className = 'feed-item';
  item.innerHTML = `<span></span><p>${text}</p>`;
  liveFeed.prepend(item);
  while (liveFeed.children.length > 5) liveFeed.lastElementChild.remove();
}

let progress = 0;
let index = 0;
addFeed('Secure scan session created. No website changes will be made.');

const timer = setInterval(() => {
  progress += Math.floor(Math.random() * 4) + 2;
  if (progress > 100) progress = 100;

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

  if (progress >= 100) {
    clearInterval(timer);
    setTimeout(() => leadModal.classList.remove('hidden'), 900);
  }
}, 1600);

closeModal.addEventListener('click', () => leadModal.classList.add('hidden'));
leadModal.addEventListener('click', (event) => {
  if (event.target === leadModal) leadModal.classList.add('hidden');
});

leadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formStatus.textContent = 'Sending your report request…';
  const payload = Object.fromEntries(new FormData(leadForm).entries());

  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Something went wrong.');
    formStatus.textContent = data.message;
    leadForm.reset();
  } catch (error) {
    formStatus.textContent = error.message || 'Unable to submit right now. Please try again.';
  }
});
