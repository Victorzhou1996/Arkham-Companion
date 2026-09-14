import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = readFileSync(new URL('../src/arkham/tabletopPanels.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { panelDefaults, panelLimits, normalizePanels, movePanel, persistentPanels, temporaryPileDefaults } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('the four pile cells reset equally while other panel preferences persist', () => {
  const changed = { ...panelDefaults, left: 26, threat: 40, hand: 60, piles: 65, pileRows: 35 }
  assert.deepEqual(persistentPanels(changed), { left: 26, right: 14, upper: 62, threat: 40, hand: 60 })
  // Legacy storage still containing old pile values is also overridden.
  const reopened = normalizePanels({ ...changed, ...temporaryPileDefaults })
  assert.equal(reopened.piles, 50)
  assert.equal(reopened.pileRows, 50)
  assert.equal(reopened.left, 26)
  assert.equal(reopened.threat, 40)
  const controls = readFileSync(new URL('../src/arkham/components/TabletopLayoutControls.vue', import.meta.url), 'utf8')
  assert.match(controls, /temporaryPiles = ref\(\{ \.\.\.temporaryPileDefaults \}\)/)
  assert.match(controls, /if \(key === 'piles' \|\| key === 'pileRows'\) temporaryPiles.value/)
  assert.match(controls, /else saved.value = persistentPanels\(next\)/)
})
test('compact default leaves most width for the map', () => {
  assert.equal(panelDefaults.left, 18)
  assert.ok(100 - panelDefaults.left - panelDefaults.right >= 65)
})
test('old, missing or corrupted local preferences cannot collapse a panel', () => {
  assert.deepEqual(normalizePanels(null), panelDefaults)
  for (const key of Object.keys(panelDefaults)) {
    for (const value of [undefined, 'large', NaN, Infinity, -Infinity]) assert.equal(normalizePanels({[key]: value})[key], panelDefaults[key])
    for (const value of [-1000, 0, 50, 1000]) {
      const p = normalizePanels({ [key]: value })
      assert.ok(p[key] >= panelLimits[key][0] && p[key] <= panelLimits[key][1])
      assert.ok(100 - p.left - p.right >= 43)
    }
  }
})
test('each separator only changes its own view preference and clamps drag extremes', () => {
  for (const key of Object.keys(panelDefaults)) {
    const next = movePanel(panelDefaults, key, 2)
    assert.equal(next[key], panelDefaults[key] + 2)
    for (const other of Object.keys(panelDefaults).filter(k => k !== key)) assert.equal(next[other], panelDefaults[other])
    assert.equal(movePanel(panelDefaults, key, 1000)[key], panelLimits[key][1])
    assert.equal(movePanel(panelDefaults, key, -1000)[key], panelLimits[key][0])
    assert.deepEqual(movePanel(panelDefaults, key, NaN), panelDefaults)
  }
})
test('offscreen direction glow uses the same selection color as actionable cards', () => {
  const scenario = readFileSync(new URL('../src/arkham/components/Scenario.vue', import.meta.url), 'utf8')
  assert.match(scenario, /--hidden-location-action-glow: color-mix\(in srgb, var\(--select\)/)
  assert.doesNotMatch(scenario, /rgba\(255, 0, 255/)
  for (const edge of ['top', 'right', 'bottom', 'left']) assert.ok(scenario.includes(`--hidden-location-action-${edge}: var(--hidden-location-action-glow)`))
})
