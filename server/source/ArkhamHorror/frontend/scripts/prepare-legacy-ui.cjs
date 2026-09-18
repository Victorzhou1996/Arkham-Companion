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
  for (const name of ['Reaction', 'choiceText', 'gameLog']) {
    if (messages[name]) updates[name] = messages[name];
  }
  for (const name of ['thePathToCarcosa', 'theForgottenAge', 'returnToTheForgottenAge', 'theCircleUndone', 'theInnsmouthConspiracy', 'edgeOfTheEarth', 'theScarletKeys']) {
    if (messages[name]?.specialRules) updates[name] = { specialRules: messages[name].specialRules };
  }
  if (messages.theScarletKeys?.dealingsInTheDark?.act2Setup) {
    updates.theScarletKeys = { ...updates.theScarletKeys, dealingsInTheDark: {
      act2Setup: messages.theScarletKeys.dealingsInTheDark.act2Setup,
    } };
  }
  // Preserve historical-only keys used by older saves and the original UI.
  const merge = '(function merge(a,b){for(const k of Object.keys(b)){if(b[k]&&typeof b[k]==="object"&&!Array.isArray(b[k])){if(!a[k]||typeof a[k]!=="object")a[k]={};merge(a[k],b[k])}else a[k]=b[k]}})';
  return source.slice(0, match.index) + `${merge}(${match[1]},${JSON.stringify(updates)});` + match[0];
}

function patchLegacyText(source, frontend) {
  const ts = require('typescript');
  function sharedModule(name, exports) {
    const input = fs.readFileSync(path.join(frontend, `src/arkham/${name}.ts`), 'utf8');
    const { outputText } = ts.transpileModule(input, { compilerOptions: {
      module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
    } });
    return `(()=>{${outputText.replace(/^export /gm, '')};return {${exports}};})()`;
  }
  const start = source.indexOf('function buildKnownTranslations(');
  const end = source.indexOf('const knownTranslationCache=new Map;', start);
  assert.ok(start >= 0 && end > start, 'Unknown legacy log translator');
  const log = sharedModule('gameLogLocalization', 'buildKnownTranslations,translateGameLogText');
  source = source.slice(0, start) + `const communityLog=${log};function buildKnownTranslations(...args){return communityLog.buildKnownTranslations(...args)}function translateGameLogText(...args){return communityLog.translateGameLogText(...args)}` + source.slice(end);
  const label = 's=function(f){return formatContent(handleEmbeddedI18n(f,o))}';
  assert.equal(source.split(label).length, 2, 'Unknown legacy choice translator');
  const choices = sharedModule('choiceLocalization', 'translateChoiceText');
  return `const communityChoices=${choices};` + source.replace(label,
    's=function(f){return formatContent(communityChoices.translateChoiceText(handleEmbeddedI18n(f,o),o,(name,type)=>useDbCardStore().getCardName(name,type)))}');
}

async function prepare() {
  const frontend = path.resolve(__dirname, '..');
  const source = path.join(frontend, '../legacy-ui-v20260826.3/prepared');
  const output = path.join(frontend, 'public/legacy-ui-20260918.2');
  fs.cpSync(source, output, { recursive: true });
  const { createServer } = await import('vite');
  const server = await createServer({ root: frontend, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true, hmr: false } });
  try {
    const { loadLocaleMessages } = await server.ssrLoadModule('/src/locales/messages.ts');
    for (const [lang, filename] of [['zh', 'zh-DAG2tbjn.js'], ['en', 'en-Ci2ZxBe9.js']]) {
      const { messages } = await loadLocaleMessages(lang);
      const localeFile = path.join(output, 'assets', filename);
      fs.writeFileSync(localeFile, patchCampaignMessages(fs.readFileSync(localeFile, 'utf8'), messages));
    }
    const gameLog = path.join(output, 'assets/GameLog-Cf4LRTFm.js');
    fs.writeFileSync(gameLog, patchLegacyText(fs.readFileSync(gameLog, 'utf8'), frontend));
  } finally { await server.close(); }
  function rebase(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) rebase(file);
      else if (/\.(js|css|html)$/.test(file)) {
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('legacy-ui-20260826.3', 'legacy-ui-20260918.2').replaceAll('ui-switch-v20260916.js', 'ui-switch-v20260918b.js'));
      } else if (/\.(gz|br)$/.test(file)) fs.unlinkSync(file);
    }
  }
  rebase(output);
  if (process.env.VITE_DISABLE_COMPANION === 'true') {
    const entry = path.join(output, 'assets/index-BQrQvsth.js');
    fs.writeFileSync(entry, disableLegacyCompanion(fs.readFileSync(entry, 'utf8')));
  }
}

module.exports = { disableLegacyCompanion, patchCampaignMessages, patchLegacyText };
if (require.main === module) prepare().catch(error => { console.error(error); process.exitCode = 1; });
