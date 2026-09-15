import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/arkham/tabletopLayout.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { visibleActionCount, handLayout, scenarioFitScale, TABLETOP_MEDIA_QUERY } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('desktop baseline remains width-only; class-selected iPads are not excluded below 801px', () => {
  const css = readFileSync(new URL('../src/styles/tabletop.css', import.meta.url), 'utf8')
  assert.equal(TABLETOP_MEDIA_QUERY, '(min-width: 801px)')
  assert.doesNotMatch(css, /@media \(min-width: 801px\)/)
  assert.match(css, /#game.tabletop-game \.scenario/)
  assert.doesNotMatch(css, /@media[^\{]*orientation/)
})

test('touch hands only overlap when needed and retain a 44px actionable strip', () => {
  assert.deepEqual(handLayout(3,380,92,44), {step:98,width:288,overlapping:false})
  assert.ok(handLayout(8,380,92,44).overlapping)
  assert.ok(handLayout(30,380,92,44).step >= 44)
})

test('interaction pulse uses orange-red, bounded paint and reduced-motion fallback', () => {
  const css = readFileSync(new URL('../src/styles/tabletopInteraction.css', import.meta.url), 'utf8')
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/)
  assert.match(css, /--tabletop-action: #ff784f/)
  assert.match(css, /outline: 4px solid var\(--tabletop-action\)/)
  assert.match(css, /border-radius: 10px/)
  assert.match(css, /2\.6s steps\(12\) 3/)
  assert.doesNotMatch(css, /animation: tabletop-(?:action|token)-breathe[^;]*infinite/)
  assert.doesNotMatch(css, /(?:^|[;{])\s*(?:transform|width|height)\s*:/m)
  assert.match(css, /\.card--flipping/)
  assert.match(css, /\.source-highlight/)
})

test('scenario cards fit the window and added decks without cropping or upscaling', () => {
  assert.equal(scenarioFitScale(400, 802, 400, 800), 1)
  assert.equal(scenarioFitScale(400, 402, 400, 800), .5)
  assert.equal(scenarioFitScale(200, 802, 400, 800), .5)
  assert.equal(scenarioFitScale(400, 402, 400, 1600), .25)
  for (const n of [0, -1, NaN, Infinity]) {
    const scale = scenarioFitScale(n, n, n, n)
    assert.ok(Number.isFinite(scale) && scale >= 0 && scale <= 1)
  }
})

test('ordinary actions remain individual; extreme counts are exact, bounded displays', () => {
  for (const count of [0, 1, 3, 6]) assert.deepEqual(visibleActionCount(count), { count, icons: count, collapsed: false })
  for (const count of [7, 30, 1000, 1000000]) assert.deepEqual(visibleActionCount(count), { count, icons: 1, collapsed: true })
  for (const value of [-1, NaN, Infinity]) assert.equal(visibleActionCount(value).icons, 0)
})
test('normal hands do not overlap when they fit', () => {
  assert.equal(handLayout(0, 500, 100).width, 0)
  assert.equal(handLayout(1, 500, 100).width, 100)
  assert.deepEqual(handLayout(5, 600, 100), { step: 106, width: 524, overlapping: false })
})
test('large hands overlap but every card retains a selectable strip', () => {
  for (const count of [8, 30, 100, 1000]) {
    const layout = handLayout(count, 600, 100)
    assert.ok(layout.overlapping)
    assert.ok(layout.step >= 24)
    assert.equal(layout.width, 100 + (count - 1) * layout.step)
    if (count < 20) assert.ok(layout.width <= 600)
    else assert.ok(layout.width > 600, 'overflow must scroll, not erase cards')
  }
})
test('resize, tiny and invalid measurements never produce invalid CSS dimensions', () => {
  for (const available of [0, 10, 320, 1920, NaN, Infinity]) {
    const layout = handLayout(30, available, 100)
    assert.ok(Number.isFinite(layout.step) && layout.step > 0)
    assert.ok(Number.isFinite(layout.width))
  }
  assert.ok(handLayout(10, 1200, 100).step > handLayout(10, 320, 100).step)
})
