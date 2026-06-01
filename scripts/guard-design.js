const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  'public/index.html',
  'public/analyze.html',
  'public/styles.css',
  'public/script.js',
  'public/analyze.js'
];

const bannedTokens = [
  'visual-person',
  'person-head',
  'person-body',
  'model-photo',
  'model-face',
  'model-shirt',
  'analysis-model-card',
  'ai-model-showcase',
  'clean-showcase',
  'clean-image-wrap',
  'analysis-panel',
  'scan-grid',
  'scan-card'
];

let failed = false;
for (const file of files) {
  const fullPath = path.join(root, file);
  const source = fs.readFileSync(fullPath, 'utf8');
  for (const token of bannedTokens) {
    if (source.includes(token)) {
      console.error(`Old design token blocked: ${token} in ${file}`);
      failed = true;
    }
  }
}

const requiredChecks = [
  ['public/index.html', 'homepage-image-wrap'],
  ['public/index.html', '/assets/ai-model-hero.jpg'],
  ['public/analyze.html', 'analysis-orb'],
  ['public/styles.css', '.hero-split'],
  ['public/styles.css', 'grid-template-columns: 1fr;']
];

for (const [file, token] of requiredChecks) {
  const fullPath = path.join(root, file);
  const source = fs.readFileSync(fullPath, 'utf8');
  if (!source.includes(token)) {
    console.error(`Locked design requirement missing: ${token} in ${file}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log('Design guard passed: no old design fallback tokens found.');
