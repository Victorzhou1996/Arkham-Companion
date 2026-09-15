import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const source = path => readFileSync(new URL(path,import.meta.url),'utf8')
const js=ts.transpileModule(source('../src/arkham/mobile/mapCameraMemory.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {parseMapCameraMemory,mobileMapMemoryKey}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
test('map memory validates finite coordinates, schema and supported zoom',()=>{
  const state={version:1,zoom:1.75,x:142.5,y:-100}
  assert.deepEqual(parseMapCameraMemory(JSON.stringify(state)),state)
  for(const raw of [null,'bad','{}','null',JSON.stringify({...state,version:2}),JSON.stringify({...state,zoom:0}),JSON.stringify({...state,zoom:7}),JSON.stringify({...state,x:1e10}),JSON.stringify({...state,x:'42'})]) assert.equal(parseMapCameraMemory(raw),null)
})
test('camera settings are isolated per game, scenario and mobile presentation',()=>{
  assert.equal(mobileMapMemoryKey('one','c01104'),'game:one:mobile:mapCamera:c01104')
  assert.notEqual(mobileMapMemoryKey('one','c01104'),mobileMapMemoryKey('two','c01104'))
  assert.notEqual(mobileMapMemoryKey('one','c01104'),mobileMapMemoryKey('one','c01105'))
  assert.match(source('../src/arkham/components/Scenario.vue'),/mobileEnabled.value \? mobileMapMemoryKey\(props.game.id, props.scenario.id\) : null/)
})
test('mobile camera saves on background and exit without a server request, and restores a natural center',()=>{
  const memory=source('../src/arkham/mobile/useMobileMapMemory.ts')
  const camera=source('../src/arkham/composables/useMapViewport.ts')
  assert.match(memory,/pagehide', save/)
  assert.match(memory,/visibilityState === 'hidden'/)
  assert.match(memory,/cleanup = \(\) => \{\s*save\(\)/)
  assert.match(memory,/localStorage.setItem\(key/)
  assert.match(memory,/catch/)
  assert.match(memory,/if \(!ready \|\| restoring \|\| stopped\) return/)
  assert.match(camera,/mapPointAt\(center, rectPoint\(grid\)/)
  assert.match(camera,/mapAnchorCorrection\(view, center/)
  assert.doesNotMatch(memory,/fetch|axios|\/api\//)
})
test('phone folds are text-free, top-left and bottom-right, with accessible labels and live hints',()=>{
  const fold=source('../src/arkham/mobile/MobileMapFold.vue')
  const css=source('../src/styles/mobileGame.css')
  assert.doesNotMatch(fold,/<small|\{\{ arrow \}\}/)
  assert.match(fold,/mobile-fold-triangle/)
  assert.match(fold,/:aria-label="label"/)
  assert.match(fold,/'mobile-zone-action': hasActions/)
  assert.match(css,/mobile-map-fold-row--top \{[^}]*justify-content: flex-start/)
  assert.match(css,/mobile-map-fold-row--bottom \{[^}]*justify-content: flex-end/)
})
test('manual reset and zoom invalidate the old resize anchor before saving the new view',()=>{
  const memory=source('../src/arkham/mobile/useMobileMapMemory.ts')
  assert.match(memory,/manualViewChange = \(\) => \{[\s\S]*?remembered = null[\s\S]*?clearTimeout\(resizeTimer\)/)
  assert.match(memory,/watch\(options.zoom, manualViewChange/)
  assert.match(memory,/arkham-map-view-reset', manualViewChange/)
  assert.match(source('../src/arkham/composables/useMapViewport.ts'),/dispatchEvent\(new Event\('arkham-map-view-reset'\)\)/)
})
