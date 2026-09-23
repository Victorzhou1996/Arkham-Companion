import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { parse } from '@vue/compiler-sfc'
const read = path => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8')
function controller() {
  const { descriptor } = parse(read('arkham/components/AssetSideStack.vue'))
  const code = ts.transpileModule(descriptor.scriptSetup.content.replace(/^import .*$/gm, '') + '\n;({enter,exit,pin,dismiss,shown,pinned,escape})', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  let now = 0, id = 0, unmount
  const tasks = new Map()
  const state = vm.runInNewContext(code, { ref: value => ({ value }), defineProps: () => ({ images: ['a'] }), nextTick: fn => fn(), watch: () => {}, onMounted: () => {}, onBeforeUnmount: fn => unmount = fn,
    document: { removeEventListener() {} }, SCENE_EXPAND_DELAY: 650,
    setTimeout: (fn, ms) => { tasks.set(++id, { fn, at: now + ms }); return id }, clearTimeout: id => tasks.delete(id),
  })
  function advance(ms) { const until = now + ms; for (;;) { const next = [...tasks].filter(([, t]) => t.at <= until).sort((a,b) => a[1].at-b[1].at)[0]; if (!next) break; now=next[1].at; tasks.delete(next[0]); next[1].fn() } now=until }
  return { state, advance, tasks, unmount }
}
test('brief hover closes; dwelling pins until dismissal', () => {
  const f = controller(); f.state.enter(); f.advance(100); f.state.exit(); f.advance(200)
  assert.equal(f.state.shown.value, false); assert.equal(f.tasks.size, 0)
  f.state.enter(); f.advance(650); f.state.exit(); f.advance(3000)
  assert.equal(f.state.pinned.value, true); assert.equal(f.state.shown.value, true)
  f.state.dismiss(); assert.equal(f.state.shown.value, false); assert.equal(f.tasks.size, 0)
})
test('crossing into panel preserves dwell; touch pins immediately; Escape and teardown clear timers', () => {
  const f = controller(); f.state.enter(); f.advance(100); f.state.exit(); f.advance(80); f.state.enter(); f.advance(650)
  assert.equal(f.state.pinned.value, true)
  f.state.escape({ key: 'Escape' }); assert.equal(f.state.shown.value, false)
  f.state.pin(); f.state.exit(); f.advance(1000); assert.equal(f.state.shown.value, true)
  f.state.dismiss(); f.state.enter(); f.unmount(); assert.equal(f.tasks.size, 0)
})
test('attachments stay separate from underneath cards and preserve original choose callbacks', () => {
  const s = read('arkham/components/Asset.vue')
  assert.match(s, /side="right"[\s\S]*:images="underneathImages"/)
  assert.match(s, /side="left" :images="attachmentImages"/)
  for (const tag of ['Event', 'Treachery', 'ScarletKey', 'Asset', 'Enemy', 'CardView']) assert.ok(s.includes('<' + tag))
  assert.match(s, /@choose="\$emit\('choose', \$event\)"/)
  assert.match(s, /'flipped' in card && card.flipped\s*\? imgsrc\('backs\/back_player.jpg'\)/)
  assert.doesNotMatch(read('arkham/components/AdaptiveHand.vue'), /translate: 0 -20px/)
})
