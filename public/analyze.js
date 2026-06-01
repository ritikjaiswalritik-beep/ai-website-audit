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
  ['Analyzing your website…', 'We are checking what visitors see first — and what might stop them from trusting you.'],
  ['Checking Google visibility…', 'Your pages may be missing signals that help Google understand and rank your business.'],
  ['Scanning AI search readiness…', 'We are checking if ChatGPT, Gemini, and AI answers can clearly understand what you offer.'],
  ['Finding hidden traffic gaps…', 'Some pages can look fine but still fail to bring the right visitors. We are looking for those gaps.'],
  ['Reviewing your content structure…', 'If your content is not easy for AI and search engines to read, competitors can win the attention first.'],
  ['Checking mobile experience…', 'Most people decide fast on mobile. We are checking if your site feels clear, fast, and easy to act on.'],
  ['Looking for lead leaks…', 'We are finding weak calls-to-action, missing trust points, and places where visitors may drop off.'],
  ['Comparing growth signals…', 'We are checking the signals that stronger websites use to get more traffic, clicks, and enquiries.'],
  ['Building your fix list…', 'The report will show the most important improvements first, so you know exactly what to work on.'],
  ['Preparing your results…', 'Almost done — your website growth report is being prepared with simple next steps.']
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
addFeed('Scan started. We are finding what your website may be missing.');

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
  formStatus.textContent = 'Preparing your report request…';
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
