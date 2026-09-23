import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

test('recent-game heading uses bilingual campaign and scenario metadata without renaming saves', async t => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true, hmr: false } })
  t.after(() => server.close())
  const { gameSummary } = await server.ssrLoadModule('/src/arkham/gameSummary.ts')
  const { default: zh } = await server.ssrLoadModule('/src/locales/zh.ts')
  const translate = key => key.split('.').reduce((value, part) => value?.[part], zh)
  const game = { name: 'My renamed save', campaign: { id: '06' }, scenario: { id: '06063', name: { title: 'Waking Nightmare' } } }
  assert.deepEqual(gameSummary(game, translate), { zh: '食梦者 - 清醒噩梦', en: 'The Dream-Eaters - Waking Nightmare' })
  assert.equal(game.name, 'My renamed save')
  assert.equal(gameSummary({ ...game, scenario: null }, translate).zh, '食梦者')
  assert.equal(gameSummary({ ...game, campaign: null, scenario: { id: 'c06063', name: { title: 'Waking Nightmare' } } }, translate).zh, '食梦者 - 清醒噩梦')
  const unknown = { name: 'Custom save', campaign: { id: ':unknown' }, scenario: { id: 'c:unknown:1', name: { title: 'Custom chapter' } } }
  assert.equal(gameSummary(unknown, translate).en, 'Custom save - Custom chapter')
  assert.deepEqual(gameSummary({ name: 'New save', campaign: null, scenario: null }, translate), { zh: 'New save', en: 'New save' })
  assert.match(gameSummary({ ...game, campaign: { id: '50' }, scenario: null }, translate).zh, /^重返狂热之夜$/)
})
