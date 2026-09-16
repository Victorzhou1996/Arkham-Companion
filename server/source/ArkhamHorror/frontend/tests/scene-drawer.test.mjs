import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const read = path => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8')
const policyJs = ts.transpileModule(read('arkham/previewPolicy.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const policyUrl = `data:text/javascript;base64,${Buffer.from(policyJs).toString('base64')}`
const js = ts.transpileModule(read('arkham/sceneDrawer.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText.replace("'./previewPolicy'", JSON.stringify(policyUrl))
const { createSceneDrawerState, SCENE_LEAVE_DELAY } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
function fixture() {
 let now = 0, id = 0, latest
 const tasks = new Map()
 const clock = { set(fn, ms) { tasks.set(++id, {fn, at: now + ms}); return id }, clear(id) { tasks.delete(id) } }
 const state = createSceneDrawerState(value => latest = value, undefined, clock)
 const advance = ms => { const until = now + ms; for (;;) { const next = [...tasks].filter(([,t]) => t.at <= until).sort((a,b) => a[1].at-b[1].at)[0]; if (!next) break; now = next[1].at; tasks.delete(next[0]); next[1].fn() } now = until }
 return { state, advance, tasks, get latest() { return latest } }
}
test('moving between drawer and owned previews cancels delayed close', () => {
 const f = fixture(); f.state.presence(true); f.advance(700)
 f.state.presence(false); f.advance(300); f.state.presence(true); f.advance(2000)
 assert.deepEqual(f.latest,{raised:true,enlarged:true,pinned:false}); assert.equal(f.tasks.size,0)
})
test('pointer outside the combined region closes after a deliberate delay', () => {
 const f = fixture(); f.state.presence(true); f.state.presence(false)
 f.advance(SCENE_LEAVE_DELAY-1); assert.equal(f.latest.raised,true)
 f.advance(1); assert.equal(f.latest.raised,false); assert.equal(f.tasks.size,0)
})
test('continuous outside movement does not postpone closing forever', () => {
 const f = fixture(); f.state.presence(true); f.state.presence(false)
 for(let i=0;i<10;i++) { f.advance(100); f.state.presence(false) }
 assert.equal(f.latest.raised,false)
})
test('outside click dismisses immediately and clears pin plus pending enlargement', () => {
 const f = fixture(); f.state.togglePin(); f.state.dismiss(); f.advance(2000)
 assert.deepEqual(f.latest,{raised:false,enlarged:false,pinned:false}); assert.equal(f.tasks.size,0)
})
test('explicit pin remains until dismissal, preserving touch access', () => {
 const f = fixture(); f.state.togglePin(); f.state.presence(false); f.advance(2000)
 assert.equal(f.latest.raised,true); assert.equal(f.latest.pinned,true)
 f.state.togglePin(); assert.equal(f.latest.raised,false)
})
test('state refresh and teardown never restart or leak timers', () => {
 const f = fixture(); f.state.presence(true); f.advance(300); f.state.sync(); f.advance(350)
 assert.equal(f.latest.enlarged,true); f.state.presence(false); f.state.dispose(); assert.equal(f.tasks.size,0)
})
test('owned previews use aria relationships and global capture clicks, not every popup', () => {
 const code = read('arkham/sceneDrawer.ts'), controls = read('arkham/components/EdgeTabletopControls.vue')
 assert.match(code,/aria-describedby/); assert.match(code,/aria-controls/)
 assert.match(code,/data-edge-scene-preview="true"/)
 assert.match(controls,/document.addEventListener\('click', click, true\)/)
 assert.match(controls,/if \(existing\) \{ existing.sync\(\); continue \}/)
 assert.doesNotMatch(code+controls,/setInterval|requestAnimationFrame|MutationObserver/)
})
test('three normal piles stay in one row; extra scenario decks sort after them', () => {
 const css=read('styles/edgeTabletop.css')
 assert.match(css,/\.scenario-pile-row \{ display: grid; grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/)
 assert.match(css,/\.scenario-deck-area:first-child \{ order: 1/)
 assert.match(css,/\.victory-display \{ order: 2/)
 assert.match(css,/\.scenario-reference-slot \{ order: 3/)
 assert.match(css,/\.scenario-deck-area \{ order: 4/)
})
test('tooltip aria collisions cannot orphan stack previews and closing hides owned popups', () => {
 for(const name of ['StackIndicator','CardsUnderIndicator']) {
  const s=read(`arkham/components/${name}.vue`)
  assert.match(s,/:data-edge-scene-preview="scenePreview \|\| undefined"/)
  assert.match(s,/@show="markScenePreview"/)
  assert.match(s,/if \(scenePreview.value\) shown.value = false/)
  assert.match(s,/removeEventListener\('arkham:scene-drawer-dismiss'/)
 }
 assert.match(read('arkham/components/CardOverlay.vue'),/arkham:scene-preview-change/)
 assert.match(read('styles/edgeTabletop.css'),/\.edge-scene-shelf:has\(\.edge-scene-raised\) \{ z-index: 70/)
})
