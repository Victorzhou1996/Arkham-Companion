import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/arkham/helpers.ts', import.meta.url), 'utf8')
const code = source.slice(source.indexOf('const versionedUiAssets'), source.indexOf('export function isLocalized'))
const context = vm.createContext({})
vm.runInContext(ts.transpile(code, { target: ts.ScriptTarget.ES2022 }), context)

test('new card pack invalidates card and localized sheet caches', () => {
  for (const path of ['cards/01014.avif', 'customizations/09021.jpg', 'tarot/tarot-0.jpg', 'seals/seal-a-active.png']) {
    assert.equal(context.withUiAssetRevision('/img/' + path, path), '/img/' + path + '?v=cards-20260913')
    assert.equal(context.withUiAssetRevision('/img/' + path + '?existing=1', path), '/img/' + path + '?existing=1&v=cards-20260913')
  }
  assert.equal(context.withUiAssetRevision('/img/portraits/03001.jpg', 'portraits/03001.jpg'), '/img/portraits/03001.jpg')
  assert.equal(context.withUiAssetRevision('/img/card.png', 'card.png'), '/img/card.png?v=ui-20260721-1')
})
