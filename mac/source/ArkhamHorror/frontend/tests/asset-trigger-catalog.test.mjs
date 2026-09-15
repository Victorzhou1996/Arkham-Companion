import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source=fs.readFileSync('src/arkham/assetTriggerModeCatalog.ts','utf8')
const code=ts.transpileModule(source.replace(/^import .*$/gm,'').replaceAll('export function','function')+'\n;({knownAssetTriggerModeIndexes,assetTriggerModes})',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
const catalog=vm.runInNewContext(code,{normalizeCardCode:s=>s.replace(/^c/,'').toLowerCase()})
test('Spirit-Speaker has a persistent settings entry before its first fast window',()=>{
  assert.equal(catalog.knownAssetTriggerModeIndexes('03014').join(','),'1')
  assert.equal(catalog.knownAssetTriggerModeIndexes('c03014').join(','),'1')
  assert.match(fs.readFileSync('src/arkham/components/Asset.vue','utf8'),/:known-ability-indexes="knownAssetTriggerModeIndexes\(cardCode\)"/)
})
test('indices follow engine definitions, excluding forced and ordinary action abilities',()=>{
  assert.equal(catalog.knownAssetTriggerModeIndexes('01063').join(','),'2') // Arcane Initiate: forced entry 1, fast 2
  assert.equal(catalog.knownAssetTriggerModeIndexes('03035').join(','),'1') // Spirit Athame: fast 1, fight 2
  assert.equal(catalog.knownAssetTriggerModeIndexes('02306').length,0) // Shrivelling 5: fight action
  assert.equal(catalog.knownAssetTriggerModeIndexes('01059').length,0) // Holy Rosary: no triggered ability
  assert.equal(catalog.knownAssetTriggerModeIndexes('04107').join(','),'1') // Lucky Cigarette Case: reaction
  assert.equal(catalog.knownAssetTriggerModeIndexes('07262').join(','),'1,2') // Nephthys: reaction + fast
  assert.equal(catalog.knownAssetTriggerModeIndexes('custom-unknown').length,0)
})
test('catalogue contains only distinct positive literal indices; it never adds fast-play or guessed defaults',()=>{
  for(const values of Object.values(catalog.assetTriggerModes)) {
    assert.ok(values.length>0)
    assert.equal(new Set(values).size,values.length)
    assert.ok(values.every(x=>Number.isInteger(x)&&x>0))
  }
})
