import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createRequire } from 'node:module'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const english = JSON.parse(read('../src/locales/en/base.json')).customCardSets
const chinese = JSON.parse(read('../src/locales/zh/customCardSets.json'))
// Chinese has no English-style singular/plural branches. Compare parameter names.
const placeholders = text => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort()

test('every upstream custom-card library message has Chinese text and identical placeholders', () => {
  function check(en, zh, path = 'customCardSets') {
    for (const [key, value] of Object.entries(en)) {
      assert.ok(Object.hasOwn(zh, key), `${path}.${key} missing`)
      if (typeof value === 'object') check(value, zh[key], `${path}.${key}`)
      else {
        assert.equal(typeof zh[key], 'string')
        assert.deepEqual(placeholders(zh[key]), placeholders(value), `${path}.${key}`)
        assert.ok(zh[key].length, `${path}.${key} empty`)
      }
    }
  }
  check(english, chinese)
})

test('editor localizes numbered abilities and bindings without modifying executable definitions', async t => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true, hmr: false } })
  t.after(() => server.close())
  const { customCardText } = await server.ssrLoadModule('/src/arkham/customCardText.ts')
  assert.equal(customCardText('Forced 2', 'zh'), '强制 2')
  assert.equal(customCardText('the EnemyDamaged window', 'zh-cn'), '敌人受到伤害时机')
  assert.equal(customCardText('the cards it discarded', 'zh'), '弃掉的卡牌')
  assert.equal(customCardText('Forced 2', 'en'), 'Forced 2')
  assert.equal(customCardText('$myTarget', 'zh'), '$myTarget')
  assert.equal(customCardText('custom-player-title', 'zh'), 'custom-player-title')
  const { exportCards, parseCardExport } = await server.ssrLoadModule('/src/arkham/customCardLibrary.ts')
  const card = { def: { cardCode: '*qa-zh-0', name: { title: '档案灯' }, cardType: 'AssetType', meta: { _abilities: [{ type: { tag: "FastAbility'", cost: { tag: 'Free' }, actions: { tag: 'AndActions', contents: [] } }, steps: [{ push: { tag: 'TakeResources', contents: ['$iid', 1, '$source', false] } }] }] } }, art: null }
  const before = JSON.stringify(card)
  const exported = await exportCards([card])
  const imported = parseCardExport(JSON.stringify(exported), '测试卡牌')
  assert.deepEqual(imported.cards[0].def, card.def)
  assert.equal(JSON.stringify(card), before)
})

test('legacy integration uses known hooks and fails closed when the pinned bundle changes', () => {
  const { patchLegacyCustomCards } = createRequire(import.meta.url)('../scripts/prepare-legacy-ui.cjs')
  for (const [name, file] of [['index', 'index-BQrQvsth.js'], ['cards', 'cards-CChhgmQ0.js'], ['game', 'Game-UD6Kvl9c.js'], ['player', 'GameLog-Cf4LRTFm.js']]) {
    const original = read(`../../legacy-ui-v20260826.3/prepared/assets/${file}`)
    const patched = patchLegacyCustomCards(original, name)
    assert.notEqual(patched, original)
    assert.throws(() => patchLegacyCustomCards('changed upstream bundle', name))
    if (name === 'player') {
      assert.match(patched, /unref\(Ve\)\.active\?window.arkhamLegacyCustomCards/)
      assert.match(patched, /openPicker\(e.game,e.investigator.id\)/)
      assert.match(patched, /openBlock\(\),createElementBlock\("button",\{key:"legacy-custom-card-add"/)
    }
  }
})
