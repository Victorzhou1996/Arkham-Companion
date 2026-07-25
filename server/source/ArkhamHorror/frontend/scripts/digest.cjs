// read all images in the public/img/arkham/<lang>/cards directory and write to the src/digests/<lang>.json for each file in the format "cards/{filename}"

const fs = require('fs');
const path = require('path');

// Take 'lang' and an optional localized image root as arguments.
const lang = process.argv[2];
const mergeExisting = process.argv.includes('--merge');
const imageRootArg = process.argv.slice(3).find(arg => !arg.startsWith('--'));
const imageRoot = imageRootArg
  ? path.resolve(imageRootArg)
  : path.join(__dirname, `../public/img/arkham/${lang}`);

if (!lang) {
  console.error('Please provide a language code (e.g., "ita") as an argument.');
  process.exit(1);
}

const cardsDir = path.join(imageRoot, 'cards');
const tarotDir = path.join(imageRoot, 'tarot');
const digest = path.join(__dirname, `../src/digests/${lang}.json`);

if (!fs.existsSync(cardsDir)) {
  console.error(`Directory not found: ${cardsDir}`);
  process.exit(1);
}

const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.avif'));

const tarot = fs.existsSync(tarotDir) ? fs.readdirSync(tarotDir).filter(f => f.endsWith('.jpg')) : [];

const existing = mergeExisting && fs.existsSync(digest)
  ? JSON.parse(fs.readFileSync(digest, 'utf8'))
  : [];
const digests = [...new Set([
  ...existing,
  ...files.map(f => `cards/${f}`),
  ...tarot.map(f => `tarot/${f}`),
])];

fs.writeFileSync(digest, JSON.stringify(digests, null, 2));
console.log(`Wrote ${digests.length} digests to ${digest}`);
