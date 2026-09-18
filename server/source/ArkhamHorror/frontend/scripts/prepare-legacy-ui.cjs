const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function disableLegacyCompanion(source) {
  // This historical bundle has no rebuildable source in the release. Patch only
  // its known detector, and fail if a different bundle is substituted.
  const startMarker = 'async function lA(){';
  const endMarker = 'const xv=Zm("site_settings",';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'Unknown legacy Companion detector');
  assert.equal(source.indexOf(startMarker, start + 1), -1);
  assert.match(source.slice(start, end), /Arkham Companion/);
  assert.match(source.slice(start, end), /fetch\(`/);
  return source.slice(0, start) + 'async function lA(){return""}' + source.slice(end);
}

function patchCampaignMessages(source, messages) {
  const match = source.match(/export\{(\w+) as default\};\s*$/);
  assert.ok(match, 'Unknown legacy locale export');
  const campaigns = ['theDreamEaters', 'theFeastOfHemlockVale', 'theDrownedCity'];
  const updates = Object.fromEntries(campaigns.map(name => {
    assert.ok(messages[name] && typeof messages[name] === 'object', `Missing ${name}`);
    return [name, messages[name]];
  }));
  // Preserve historical-only keys used by older saves and the original UI.
  const merge = '(function merge(a,b){for(const k of Object.keys(b)){if(b[k]&&typeof b[k]==="object"&&!Array.isArray(b[k])){if(!a[k]||typeof a[k]!=="object")a[k]={};merge(a[k],b[k])}else a[k]=b[k]}})';
  return source.slice(0, match.index) + `${merge}(${match[1]},${JSON.stringify(updates)});` + match[0];
}

async function prepare() {
  const frontend = path.resolve(__dirname, '..');
  const source = path.join(frontend, '../legacy-ui-v20260826.3/prepared');
  const output = path.join(frontend, 'public/legacy-ui-20260918.1');
  fs.cpSync(source, output, { recursive: true });
  const { createServer } = await import('vite');
  const server = await createServer({ root: frontend, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true, hmr: false } });
  try {
    const { loadLocaleMessages } = await server.ssrLoadModule('/src/locales/messages.ts');
    const { messages } = await loadLocaleMessages('zh');
    const localeFile = path.join(output, 'assets/zh-DAG2tbjn.js');
    fs.writeFileSync(localeFile, patchCampaignMessages(fs.readFileSync(localeFile, 'utf8'), messages));
  } finally { await server.close(); }
  function rebase(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) rebase(file);
      else if (/\.(js|css|html)$/.test(file)) {
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('legacy-ui-20260826.3', 'legacy-ui-20260918.1').replaceAll('ui-switch-v20260916.js', 'ui-switch-v20260918.js'));
      } else if (/\.(gz|br)$/.test(file)) fs.unlinkSync(file);
    }
  }
  rebase(output);
  if (process.env.VITE_DISABLE_COMPANION === 'true') {
    const entry = path.join(output, 'assets/index-BQrQvsth.js');
    fs.writeFileSync(entry, disableLegacyCompanion(fs.readFileSync(entry, 'utf8')));
  }
}

module.exports = { disableLegacyCompanion, patchCampaignMessages };
if (require.main === module) prepare().catch(error => { console.error(error); process.exitCode = 1; });
