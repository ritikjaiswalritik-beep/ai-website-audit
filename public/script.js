const auditForm = document.getElementById('auditForm');
document.getElementById('year').textContent = new Date().getFullYear();

function cleanUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

auditForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const website = cleanUrl(document.getElementById('websiteUrl').value);
  if (!website) return;
  window.location.href = `/analyze.html?website=${encodeURIComponent(website)}`;
});
