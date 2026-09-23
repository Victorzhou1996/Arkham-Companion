import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = readFileSync(new URL('../src/arkham/tabletopPanels.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { panelDefaults, panelLimits, normalizePanels, movePanel, persistentPanels, temporaryPileDefaults, logCollapsed, collapsedLogWidth } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('the four pile cells reset equally while other panel preferences persist', () => {
  const changed = { ...panelDefaults, left: 26, threat: 40, hand: 60, piles: 65, pileRows: 35 }
  assert.deepEqual(persistentPanels(changed), { left: 26, investigator: 18, right: 14, log: 14, upper: 62, threat: 40, hand: 60 })
  // Legacy storage still containing old pile values is also overridden.
  const reopened = normalizePanels({ ...changed, ...temporaryPileDefaults })
  assert.equal(reopened.piles, 50)
  assert.equal(reopened.pileRows, 50)
  assert.equal(reopened.left, 26)
  assert.equal(reopened.threat, 40)
  const controls = readFileSync(new URL('../src/arkham/components/TabletopLayoutControls.vue', import.meta.url), 'utf8')
  assert.match(controls, /temporaryPiles = ref\(\{ \.\.\.temporaryPileDefaults \}\)/)
  assert.match(controls, /if \(key === 'piles' \|\| key === 'pileRows'\) temporaryPiles.value/)
  assert.match(controls, /else save\(\{ \[key\]: next\[key\] \}\)/)
})
test('compact default leaves most width for the map', () => {
  assert.equal(panelDefaults.left, 18)
  assert.ok(100 - panelDefaults.left - panelDefaults.right >= 65)
})

test('upper log and lower pile widths are independent, with a stable collapse threshold', () => {
  const p = movePanel(movePanel(panelDefaults, 'right', 5), 'log', -10)
  assert.equal(p.right, 19)
  assert.equal(p.log, 4)
  assert.equal(normalizePanels({right:22}).log, 14)
  assert.equal(logCollapsed(149, false), true)
  assert.equal(logCollapsed(160, true), true)
  assert.equal(logCollapsed(189, true), true)
  assert.equal(logCollapsed(190, true), false)
  assert.equal(logCollapsed(160, false), false)
  assert.equal(logCollapsed(NaN, false), false)
  assert.equal(collapsedLogWidth, 18)
  const controls = readFileSync(new URL('../src/arkham/components/TabletopLayoutControls.vue', import.meta.url), 'utf8')
  assert.match(controls,/case 'log':[^\n]*logWidth.value[^\n]*height:/)
  assert.match(controls,/case 'right':[^\n]*p.upper[^\n]*bottom: '0'/)
  assert.match(controls,/key === 'right' \|\| key === 'log'/)
  assert.match(controls,/logClosed.value \? \{[^\n]*logWidth.value/)
})

test('desktop rows avoid vertical scrollbars, scenario groups have spacing, original fonts remain', () => {
  const css = readFileSync(new URL('../src/styles/tabletop.css', import.meta.url), 'utf8')
  assert.match(css,/\.adaptive-hand \{ overflow-x: auto; overflow-y: hidden/)
  assert.match(css,/\.tabletop-empty-threat \{ overflow: hidden/)
  assert.match(css,/\.scenario-cards-content--fit \{ row-gap: 12px/)
  assert.match(css,/\.player-cards \{[^\n]*var\(--tabletop-right\)/)
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(main,/uiTypography.css/)
})

test('upper and lower left dividers have independent sizing, geometry and saved values', () => {
  const upper = movePanel(panelDefaults, 'left', 7)
  const lower = movePanel(upper, 'investigator', -4)
  assert.equal(lower.left, 25)
  assert.equal(lower.investigator, 14)
  assert.deepEqual(normalizePanels(persistentPanels(lower)), lower)
  assert.equal(normalizePanels({left: 25}).investigator, 18)
  const controls = readFileSync(new URL('../src/arkham/components/TabletopLayoutControls.vue', import.meta.url), 'utf8')
  assert.match(controls, /case 'left':[^\n]*height:[^\n]*p.upper/)
  assert.match(controls, /case 'investigator':[^\n]*p.investigator[^\n]*lowerTop.value/)
  assert.match(controls, /const middleWidth[^\n]*layout.value.investigator/)
  assert.match(controls, /case 'hand':[^\n]*p.investigator/)
  const css = readFileSync(new URL('../src/styles/tabletop.css', import.meta.url), 'utf8')
  assert.match(css, /\.scenario-body \{[^\n]*grid-template-columns: var\(--tabletop-left\)/)
  assert.match(css, /\.player-cards \{[^\n]*grid-template-columns: var\(--tabletop-investigator\)/)
  assert.match(css, /\.player-buttons \{[^\n]*var\(--panel-investigator, 18\)/)
})

test('undo, end-turn and skip controls retain visible borders even while disabled', () => {
  const css = readFileSync(new URL('../src/styles/tabletop.css', import.meta.url), 'utf8')
  assert.match(css, /\.skip-triggers-group button \{[^\n]*border: 1px solid/)
  assert.match(css, /\.button-group button:disabled \{[^\n]*border-color:[^\n]*opacity: 1/)
  assert.match(css, /\.button-group button:focus-visible \{[^\n]*outline: 2px solid/)
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
