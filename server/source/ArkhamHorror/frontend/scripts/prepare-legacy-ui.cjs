const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { patchLegacyProtocol, patchLegacyTokenArt } = require('./legacy-protocol.cjs');

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
  const campaigns = ['nightOfTheZealot', 'theDunwichLegacy', 'thePathToCarcosa', 'theForgottenAge', 'theCircleUndone', 'theDreamEaters', 'theInnsmouthConspiracy', 'edgeOfTheEarth', 'theScarletKeys', 'theFeastOfHemlockVale', 'theDrownedCity'];
  const updates = Object.fromEntries(campaigns.map(name => {
    assert.ok(messages[name] && typeof messages[name] === 'object', `Missing ${name}`);
    return [name, messages[name]];
  }));
  for (const name of ['Reaction', 'choiceText', 'gameLog']) {
    if (messages[name]) updates[name] = messages[name];
  }
  updates.gameBar = { narration: { title: messages.nav?.home === '首页' ? '音乐与语音' : 'Music & voice' } };
  for (const name of ['thePathToCarcosa', 'theForgottenAge', 'returnToTheForgottenAge', 'theCircleUndone', 'theInnsmouthConspiracy', 'edgeOfTheEarth', 'theScarletKeys']) {
    if (messages[name]?.specialRules) updates[name] = { ...updates[name], specialRules: messages[name].specialRules };
  }
  if (messages.theScarletKeys?.dealingsInTheDark?.act2Setup) {
    updates.theScarletKeys = { ...updates.theScarletKeys, dealingsInTheDark: { ...updates.theScarletKeys.dealingsInTheDark,
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

function patchLegacyCustomCards(source, name) {
  const replace = (from, to) => {
    assert.equal(source.split(from).length, 2, `Unknown legacy ${name} custom-card hook`);
    source = source.replace(from, to);
  };
  if (name === 'index') {
    replace('function ul(e,t){return vA.has(t)?', 'function ul(e,t){if(/^(cards|customizations|tarot|seals)\\//.test(t))return `${e}${e.includes("?")?"&":"?"}v=cards-20260923`;return vA.has(t)?');
    replace('function cL(e){const t=xv()', 'function cL(e){const custom=window.arkhamLegacyCustomCards?.resolveArt(e);if(custom)return custom.url||cL(custom.reference);const t=xv()');
  } else if (name === 'cards') {
    replace('state:()=>({cards:[],loaded:!1})', 'state:()=>({cards:[],custom:[],loaded:!1})');
    replace('getCards(t){return t.cards}', 'getCards(t){return [...t.cards,...t.custom]}');
    replace('actions:{async fetchCards()', 'actions:{async fetchCustomCards(id){try{this.custom=await window.arkhamLegacyCustomCards.load(id)}catch(e){console.error(e)}},async fetchCards()');
  } else if (name === 'game') {
    replace('(E,C)=>S(s).supported?(r(),l("div",og,', '(E,C)=>!0?(r(),l("div",og,');
    replace('const I=Es(null);', 'const I=Es(null);let customLoading=false;re(I,g=>{window.arkhamLegacyCustomCards?.updateMusic(g);if(!customLoading&&window.arkhamLegacyCustomCards?.unknownCards(g)){customLoading=true;p.fetchCustomCards(n.gameId).finally(()=>customLoading=false)}});');
    replace('then(async({game:b,playerId:Z,multiplayerMode:ge,eventId:Ee})=>{window.g=b', 'then(async({game:b,playerId:Z,multiplayerMode:ge,eventId:Ee})=>{await p.fetchCustomCards(n.gameId);window.g=b');
  } else if (name === 'player') {
    const button = 'window.arkhamLegacyCustomCards?.enabled()?(openBlock(),createElementBlock("button",{key:"legacy-custom-card-add",class:"legacy-custom-card-add",type:"button",onClick:withModifiers(()=>window.arkhamLegacyCustomCards.openPicker(e.game,e.investigator.id),["stop"])},window.arkhamLegacyCustomCards.buttonLabel())):createCommentVNode("",!0)';
    replace('createBaseVNode("button",{type:"button",onClick:q},"+ Card to hand")', `createBaseVNode("button",{type:"button",onClick:q},"+ Card to hand"),${button}`);
    replace('unref(Ve).active?withDirectives((openBlock(),createElementBlock("button",{key:0,class:"hand-debug-add-button"', `unref(Ve).active?${button}:createCommentVNode("",!0),unref(Ve).active?withDirectives((openBlock(),createElementBlock("button",{key:0,class:"hand-debug-add-button"`);
  } else throw new Error(`Unknown legacy hook target: ${name}`);
  return source;
}

async function prepare() {
  const frontend = path.resolve(__dirname, '..');
  const source = path.join(frontend, '../legacy-ui-v20260826.3/prepared');
  const output = path.join(frontend, 'public/legacy-ui-20260923.1');
  fs.cpSync(source, output, { recursive: true });
  const imageDigest = fs.readFileSync(path.join(frontend, 'src/digests/zh.json'), 'utf8');
  fs.writeFileSync(path.join(output, 'assets/zh-DxvknHJq.js'), `export default ${JSON.stringify(JSON.parse(imageDigest))};`);
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
    fs.writeFileSync(gameLog, patchLegacyTokenArt(patchLegacyText(fs.readFileSync(gameLog, 'utf8'), frontend)));
    const api = path.join(output, 'assets/api-BQ1BYW-_.js');
    fs.writeFileSync(api, patchLegacyProtocol(fs.readFileSync(api, 'utf8')));
  } finally { await server.close(); }
  function rebase(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) rebase(file);
      else if (/\.(js|css|html)$/.test(file)) {
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll('legacy-ui-20260826.3', 'legacy-ui-20260923.1').replaceAll('ui-switch-v20260916.js', 'ui-switch-v20260921.js?v=20260924.1'));
      } else if (/\.(gz|br)$/.test(file)) fs.unlinkSync(file);
    }
  }
  rebase(output);
  for (const [name, filename] of [['index', 'index-BQrQvsth.js'], ['cards', 'cards-CChhgmQ0.js'], ['game', 'Game-UD6Kvl9c.js'], ['player', 'GameLog-Cf4LRTFm.js']]) {
    const file = path.join(output, 'assets', filename);
    fs.writeFileSync(file, patchLegacyCustomCards(fs.readFileSync(file, 'utf8'), name));
  }
  const html = path.join(output, 'index.html');
  fs.writeFileSync(html, fs.readFileSync(html, 'utf8').replace('<head>', '<head>\n<script type="module" src="/legacy-custom-cards-v20260921.js"></script>\n<style>.hand-area-IsMobile>.legacy-custom-card-add{position:absolute;top:44px;left:8px;z-index:4;min-height:32px;padding:4px 8px;background:#3b465a;color:white;border:1px solid #829076;border-radius:4px}</style>'));
  if (process.env.VITE_DISABLE_COMPANION === 'true') {
    const entry = path.join(output, 'assets/index-BQrQvsth.js');
    fs.writeFileSync(entry, disableLegacyCompanion(fs.readFileSync(entry, 'utf8')));
  }
}

module.exports = { disableLegacyCompanion, patchCampaignMessages, patchLegacyText, patchLegacyCustomCards };
if (require.main === module) prepare().catch(error => { console.error(error); process.exitCode = 1; });
