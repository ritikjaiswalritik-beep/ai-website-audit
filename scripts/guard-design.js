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

const join = (...parts) => parts.join('-');
const blockedLegacyTokens = [
  join('visual', 'person'),
  join('person', 'head'),
  join('person', 'body'),
  join('model', 'photo'),
  join('model', 'face'),
  join('model', 'shirt'),
  join('analysis', 'model', 'card'),
  join('ai', 'model', 'showcase'),
  join('clean', 'showcase'),
  join('clean', 'image', 'wrap'),
  join('analysis', 'panel'),
  join('scan', 'grid'),
  join('scan', 'card'),
  join('hero', 'ai', 'image', 'wrap')
];

let failed = false;
for (const file of files) {
  const fullPath = path.join(root, file);
  const source = fs.readFileSync(fullPath, 'utf8');
  for (const token of blockedLegacyTokens) {
    if (source.includes(token)) {
      console.error(`Blocked legacy design token found in ${file}`);
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

console.log('Design guard passed: locked design only.');
