import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`
const panels = compile(readFileSync(new URL('../src/arkham/tabletopPanels.ts', import.meta.url), 'utf8'))
const source = readFileSync(new URL('../src/arkham/accountPanelPreferences.ts', import.meta.url), 'utf8').replace("'./tabletopPanels'", JSON.stringify(panels))
const { accountPanelPreferences: create, panelPatch } = await import(compile(source))
const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture(overrides = {}) {
  const state = { cache: {}, rendered: {}, writes: [] }
  const controller = create({ read: () => ({}), cache: v => { state.cache = structuredClone(v) },
    render: v => { state.rendered = structuredClone(v) }, load: async () => ({ left: 25, right: 20 }),
    save: async (p, keepalive) => { state.writes.push({p, keepalive}) }, ...overrides })
  return { state, controller }
}
test('server restore excludes temporary pile separators and never uploads defaults', async () => {
  assert.deepEqual(panelPatch({ left: 26, piles: 65, pileRows: 35, log: NaN }), { left: 26 })
  const { state, controller: c } = fixture()
  await c.ready
  assert.deepEqual(state.rendered, {left:25,right:20})
  assert.equal(state.writes.length, 0)
  c.change({threat:40,piles:60}); await c.flush()
  assert.deepEqual(state.writes[0].p, {threat:40})
  c.dispose()
})
test('edits made during initial fetch win without overwriting other server fields', async () => {
  let finish
  const { state, controller:c } = fixture({load: () => new Promise(r => {finish=r})})
  c.change({left:30}); await c.flush(); assert.equal(state.writes.length,0)
  finish({left:18,right:22}); await c.ready; await tick()
  assert.deepEqual(state.rendered,{left:30,right:22})
  assert.deepEqual(state.writes[0].p,{left:30})
  c.dispose()
})
test('slow saves are serialized and newer changes remain pending', async () => {
  let finish
  const writes=[]
  const {state,controller:c}=fixture({save: p=>{writes.push(p); return new Promise(r=>{finish=r})}})
  await c.ready; c.change({left:24}); const first=c.flush()
  c.change({left:29}); await c.flush(); assert.equal(writes.length,1)
  finish(); await first; assert.equal(state.cache.pending.left,29)
  const second=c.flush(); assert.equal(writes.length,2); finish(); await second
  assert.deepEqual(state.cache.pending,{}); c.dispose()
})
test('offline pending changes survive restart and disposed accounts cannot render late responses', async () => {
  const {state,controller:c}=fixture({save:async()=>{throw Error('offline')}})
  await c.ready; c.change({upper:56}); await c.flush(); c.dispose()
  assert.equal(state.cache.pending.upper,56)
  const second=fixture({read:()=>state.cache})
  await second.controller.ready; await tick()
  assert.equal(second.state.rendered.upper,56); second.controller.dispose()
  let finish
  const old=fixture({load:()=>new Promise(r=>{finish=r})})
  old.controller.dispose(); finish({left:31}); await old.controller.ready
  assert.deepEqual(old.state.rendered,{})
})
test('all four cell card sizes reserve count controls, deck badges share a larger center position', () => {
  const css=readFileSync(new URL('../src/styles/tabletop.css',import.meta.url),'utf8')
  assert.match(css,/tabletop-pile-heading-height\) - 38px/)
  assert.match(css,/\.scenario-encounter-decks > \.discard[^\n]*--pile-row-size/)
  assert.match(css,/\.top-of-deck > \.deck-size \{\s*inset: auto; top: calc\(var\(--card-height\) \/ 2\); left: 50%/)
  assert.match(css,/font-size: clamp\(16px, calc\(var\(--card-width\) \* .17\), 28px\)/)
})
