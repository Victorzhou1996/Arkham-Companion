import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const read = p => readFileSync(new URL('../src/' + p, import.meta.url), 'utf8')
const js = ts.transpileModule(read('arkham/mapCardGroups.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { clampGroupOffset, compactPhaseLabel } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
const base = { left: 56, top: 44, width: 236, height: 114 }
const area = { left: 52, top: 40, width: 1224, height: 416 }
test('short phases remove suffix, not meaningful names', () => {
  for (const name of ['神话', '调查', '敌军', '补给']) assert.equal(compactPhaseLabel(name + '阶段'), name)
  assert.equal(compactPhaseLabel('Investigation Phase'), 'Investigation')
  assert.equal(compactPhaseLabel('Mythos'), 'Mythos')
})
test('group drag is screen-space, independent of map zoom and rotation', () => {
  assert.deepEqual(clampGroupOffset({ x: 240, y: 90 }, base, area), { x: 240, y: 90 })
})
test('groups cannot disappear beyond map edges or into player area', () => {
  assert.deepEqual(clampGroupOffset({ x: -9999, y: -9999 }, base, area), { x: -4, y: -4 })
  assert.deepEqual(clampGroupOffset({ x: 9999, y: 9999 }, base, area), { x: 984, y: 298 })
})
test('oversized or resized special groups keep a reachable top-left corner', () => {
  assert.deepEqual(clampGroupOffset({ x: 900, y: 800 }, { ...base, width: 2000, height: 1000 }, area), { x: -4, y: -4 })
})
test('phone uses original phase labels and no group transforms or gestures', () => {
  const s = read('arkham/components/Scenario.vue'), c = read('arkham/composables/useMapCardGroups.ts')
  assert.match(s, /tabletopDesktop.value \? compactPhaseLabel\(t\(key\)\) : t\(key\)/)
  assert.match(s, /useMapCardGroups\(\(\) => props.game.id, tabletopDesktop, locationsUnlocked\)/)
  assert.match(c, /enabled.value && unlocked.value/)
  assert.match(c, /if \(!enabled.value\) return undefined/)
})
test('groups share location reset but never use game mutations or undo', () => {
  const s = read('arkham/components/Scenario.vue'), c = read('arkham/composables/useMapCardGroups.ts')
  assert.match(s, /async function resetLocationsLayout\(\) \{\s*cancelActiveDrag\(\)\s*mapCardGroups.reset\(\)/)
  assert.match(c, /setGameLocalStorageItem\(gameId\(\), storageKey/)
  assert.doesNotMatch(c, /updateGame|choose\(|fetch\(|setInterval|requestAnimationFrame/)
  for (const event of ['pointercancel', 'blur', 'keydown']) assert.ok(c.includes(`removeEventListener('${event}'`))
  assert.match(c, /onBeforeUnmount\(\(\) => \{ cancel\(\); observer\?\.disconnect\(\)/)
})
test('upper and lower map cards share a single desktop-only size and narrower rail', () => {
  const css = read('styles/edgeTabletop.css')
  assert.match(css, /--edge-rail: 48px/)
  assert.match(css, /\.scenario-encounter-decks > \* \{[^}]*--card-width: var\(--edge-map-card\)/)
  assert.match(css, /#game.tabletop-game.edge-tabletop \.scenario-cards-content--fit > \* \{ --card-width: var\(--edge-map-card\)/)
  assert.match(css, /\.map-card-group--unlocked[^}]*touch-action: none/)
})
