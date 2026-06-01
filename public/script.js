const auditForm = document.getElementById('auditForm');
const analysisPanel = document.getElementById('analysisPanel');
const progressBar = document.getElementById('progressBar');
const progressNumber = document.getElementById('progressNumber');
const scanMessage = document.getElementById('scanMessage');
const leadModal = document.getElementById('leadModal');
const closeModal = document.getElementById('closeModal');
const leadForm = document.getElementById('leadForm');
const leadWebsite = document.getElementById('leadWebsite');
const formStatus = document.getElementById('formStatus');
document.getElementById('year').textContent = new Date().getFullYear();

const messages = [
  'Connecting to AI-powered website intelligence engine…',
  'Scanning public website structure and page signals…',
  'Checking Google SEO fundamentals and metadata quality…',
  'Reviewing mobile experience and user journey clarity…',
  'Testing if AI answer engines can understand your content…',
  'Analyzing conversion leaks, trust signals, and CTA strength…',
  'Comparing your website with 2026 growth factors…',
  'Preparing priority recommendations for your report…',
  'Finalizing your personalized website audit…'
];

function cleanUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function openLeadModal(url) {
  leadWebsite.value = cleanUrl(url);
  leadModal.classList.remove('hidden');
}

function runAnalysis(url) {
  analysisPanel.classList.remove('hidden');
  analysisPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  let progress = 0;
  let messageIndex = 0;
  scanMessage.textContent = messages[0];
  progressBar.style.width = '0%';
  progressNumber.textContent = '0%';

  const timer = setInterval(() => {
    progress += Math.floor(Math.random() * 5) + 2;
    if (progress > 100) progress = 100;
    progressBar.style.width = `${progress}%`;
    progressNumber.textContent = `${progress}%`;

    const nextIndex = Math.min(messages.length - 1, Math.floor((progress / 100) * messages.length));
    if (nextIndex !== messageIndex) {
      messageIndex = nextIndex;
      scanMessage.textContent = messages[messageIndex];
    }

    if (progress >= 100) {
      clearInterval(timer);
      setTimeout(() => openLeadModal(url), 700);
    }
  }, 1450);
}

auditForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const url = document.getElementById('websiteUrl').value;
  if (!url.trim()) return;
  runAnalysis(url);
});

closeModal.addEventListener('click', () => leadModal.classList.add('hidden'));
leadModal.addEventListener('click', (event) => {
  if (event.target === leadModal) leadModal.classList.add('hidden');
});

leadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formStatus.textContent = 'Sending your request…';
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
    setTimeout(() => leadModal.classList.add('hidden'), 2200);
  } catch (error) {
    formStatus.textContent = error.message || 'Unable to submit right now. Please try again.';
  }
});
