import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import { createI18n } from 'vue-i18n'
import { createServer } from 'vite'

const require = createRequire(import.meta.url)
const { patchCampaignMessages, patchLegacyText } = require('../scripts/prepare-legacy-ui.cjs')
const frontend = path.resolve('.')
const campaigns = ['thePathToCarcosa', 'theForgottenAge', 'theCircleUndone', 'theInnsmouthConspiracy', 'edgeOfTheEarth', 'theScarletKeys']
function module(name) {
  const source = fs.readFileSync(`src/arkham/${name}.ts`, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(compiled, { exports })
  return exports
}
function legacyModules() {
  const original = fs.readFileSync('../legacy-ui-v20260826.3/prepared/assets/GameLog-Cf4LRTFm.js', 'utf8')
  const patched = patchLegacyText(original, frontend)
  const ast = ts.createSourceFile('legacy.js', patched, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  assert.equal(ast.parseDiagnostics.length, 0)
  const modules = {}
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const d of statement.declarationList.declarations) {
      if (['communityLog', 'communityChoices'].includes(d.name.text)) modules[d.name.text] = vm.runInNewContext(d.initializer.getText(ast))
    }
  }
  assert.match(patched, /communityChoices.translateChoiceText\(handleEmbeddedI18n\(f,o\),o,/)
  assert.throws(() => patchLegacyText('unknown version', frontend))
  return { ...modules.communityLog, ...modules.communityChoices }
}

test('new and classic UI share dynamic logs, record aliases and choice translations in both languages', () => {
  for (const api of [{ ...module('gameLogLocalization'), ...module('choiceLocalization') }, legacyModules()]) {
    for (const lang of ['zh', 'en']) {
      const base = JSON.parse(fs.readFileSync(`src/locales/${lang}/base.json`))
      const t = createI18n({ legacy: false, locale: lang, fallbackLocale: false, messages: { [lang]: base } }).global.t
      const source = JSON.parse(fs.readFileSync('src/locales/en/theScarletKeys/base.json'))
      const target = JSON.parse(fs.readFileSync(`src/locales/${lang}/theScarletKeys/base.json`))
      const known = api.buildKnownTranslations(source, target)
      for (const count of [0, 1, 2, 9, 12]) {
        const discard = `must discard down to ${count} card${count === 1 ? '' : 's'}`
        const clues = `discovered ${count} clue${count === 1 ? '' : 's'}`
        assert.equal(api.translateGameLogText(` 阿曼达：学生 ${discard} `, t, known), ` 阿曼达：学生 ${lang === 'zh' ? `必须弃牌至剩余 ${count} 张` : discard} `)
        assert.equal(api.translateGameLogText(clues, t, known), lang === 'zh' ? `发现了 ${count} 个线索` : clues)
      }
      const names = new Map([['Rainy London Streets', '大雨的伦敦街道'], ['Paracausal Entity', '超因果存在']])
      const resolveName = (name) => lang === 'zh' ? names.get(name) ?? name : name
      assert.equal(api.translateChoiceText('Discover Clue at Rainy London Streets', t, resolveName), lang === 'zh' ? '在大雨的伦敦街道发现线索' : 'Discover Clue at Rainy London Streets')
      assert.equal(api.translateChoiceText('Damage Paracausal Entity', t, resolveName), lang === 'zh' ? '对超因果存在造成伤害' : 'Damage Paracausal Entity')
      for (const [en, zh] of [['Establish Motive', '构建动机'], ['Lie in Wait', '守株待兔']]) assert.equal(api.translateChoiceText(en, t, resolveName), lang === 'zh' ? zh : en)
      assert.equal(api.translateChoiceText('Unrecognized option', t, resolveName), 'Unrecognized option')
      // Use the same punctuation loss as existing backend log records.
      function checkRecords(en, zh) {
        for (const key of Object.keys(en)) {
          if (typeof en[key] === 'object' && en[key]) checkRecords(en[key], zh[key] ?? {})
          else if (/^youHaventSeenTheLastOf|^theCellKnowsOfDesisPast$/.test(key)) {
            const raw = en[key].normalize('NFKD').replace(/\p{M}/gu, '').replace(/[’']/g, '').replace(/-/g, ' ').toLowerCase()
            const output = api.translateGameLogText(`Record "${raw}" (2)`, t, known)
            assert.equal(output, t('gameLog.record', { value: lang === 'zh' ? zh[key] : raw }) + ' (2)')
          }
        }
      }
      checkRecords(source, target)
      if (lang === 'zh') assert.equal(api.translateGameLogText('Record "you havent seen the last of the beast in acowl of crimson"', t, known), t('gameLog.record', { value: target.key.youHaventSeenTheLastOfTheBeastInACowlOfCrimson }))
    }
    const ambiguous = api.buildKnownTranslations({ a: 'red-gloved', b: 'red gloved' }, { a: '甲', b: '乙' })
    assert.equal(api.translateGameLogText('Record "redgloved"', (_key, p = {}) => p.value ?? '', ambiguous), 'redgloved')
  }
})

test('community rules and Act 2 setup load in zh/zh-cn and survive the classic build', async t => {
  const server = await createServer({ root: frontend, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true, hmr: false } })
  t.after(() => server.close())
  const { loadLocaleMessages } = await server.ssrLoadModule('/src/locales/messages.ts')
  for (const lang of ['zh', 'zh-cn']) {
    const { messages } = await loadLocaleMessages(lang)
    const missing = []
    const translate = createI18n({ legacy: false, locale: 'zh', fallbackLocale: false, warnHtmlMessage: false, messages: { zh: messages }, missing: (_l, key) => missing.push(key) }).global.t
    const sandbox = {}
    const patched = patchCampaignMessages('const original={oldOnly:"keep"};export{original as default};', messages)
    vm.runInNewContext(patched.replace('export{original as default};', 'globalThis.locale=original;'), sandbox)
    assert.equal(sandbox.locale.oldOnly, 'keep')
    let count = 0
    for (const campaign of campaigns) {
      const en = JSON.parse(fs.readFileSync(`src/locales/en/${campaign}/base.json`))
      assert.equal(messages[campaign].specialRules.length, en.specialRules.length)
      for (const [i, rule] of messages[campaign].specialRules.entries()) {
        for (const k of ['title', 'body']) {
          const rendered = translate(`${campaign}.specialRules[${i}].${k}`)
          assert.match(rendered, /[\u4e00-\u9fff]/)
          assert.equal(sandbox.locale[campaign].specialRules[i][k], rule[k])
          count++
        }
      }
    }
    assert.equal(count, 52) // Return to Forgotten Age shares the same 10 entries.
    assert.equal(translate('Reaction'), '反应')
    for (const key of Object.keys(JSON.parse(fs.readFileSync('src/locales/en/theScarletKeys/scenarios/dealingsInTheDark.json')).act2Setup)) {
      assert.match(translate(`theScarletKeys.dealingsInTheDark.act2Setup.${key}`), /[\u4e00-\u9fff]/)
      assert.equal(sandbox.locale.theScarletKeys.dealingsInTheDark.act2Setup[key], messages.theScarletKeys.dealingsInTheDark.act2Setup[key])
    }
    assert.deepEqual(missing, [])
  }
})
