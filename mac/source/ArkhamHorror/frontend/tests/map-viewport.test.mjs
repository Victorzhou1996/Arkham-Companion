import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = file => readFileSync(new URL(file, import.meta.url), 'utf8')
const compiled = ts.transpileModule(source('../src/arkham/mapViewport.ts'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {clampMapZoom, wheelMapZoom, mapPointAt, mapAnchorCorrection, pinchGeometry, createMapTouchGesture, interpolateMapZoom, MAP_WHEEL_DURATION} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('wheel interpolation has continuous intermediate scales and finishes exactly without idle frames', () => {
  for (const [from,to] of [[1,2],[2,.5],[.25,6],[6,.25]]) {
    assert.equal(interpolateMapZoom(from,to,0),from)
    assert.equal(interpolateMapZoom(from,to,MAP_WHEEL_DURATION),to)
    assert.equal(interpolateMapZoom(from,to,MAP_WHEEL_DURATION+200),to)
    const values=Array.from({length:11},(_,i)=>interpolateMapZoom(from,to,i*MAP_WHEEL_DURATION/10))
    assert.ok(values.every(v=>v>=Math.min(from,to)-1e-10 && v<=Math.max(from,to)+1e-10))
    assert.ok(values.every((v,i)=>i===0 || (to>from?v>values[i-1]:v<values[i-1])))
    assert.ok(new Set(values).size>8)
  }
})

test('wheel tween is serialized, bounded and cancelled by reset, input changes or background', () => {
  const s=source('../src/arkham/composables/useMapViewport.ts')
  assert.match(s,/!applying && frame === undefined/)
  assert.match(s,/wheelMotion\?\.target \?\? pending\?\.zoom/)
  assert.match(s,/time - motion.start >= MAP_WHEEL_DURATION/)
  assert.match(s,/if \(finalWheelFrame\) \{\s*writingZoom = true\s*options.zoom.value = work.zoom/)
  assert.match(s,/if \(finalWheelFrame\) window.dispatchEvent/)
  assert.match(s,/if \(!writingZoom\) cancelZoom\(\)/)
  assert.match(s,/async function resetView\(\) \{\s*cancelZoom\(\)/)
  assert.match(s,/async function restore[\s\S]*cancelZoom\(\)/)
  assert.match(s,/if \(reducedMotion.matches\) \{ zoomAt/)
  assert.match(s,/closest\('\.zoom-control'\)\) return/)
  assert.match(s,/document.removeEventListener\('visibilitychange', visibility\)/)
})

test('map wheel zoom is smooth, bounded, and normalizes pixel/line/page deltas', () => {
  assert.equal(wheelMapZoom(1,16,0,400), wheelMapZoom(1,1,1,400))
  assert.equal(wheelMapZoom(1,400,0,400), wheelMapZoom(1,1,2,400))
  assert.ok(wheelMapZoom(1,-100,0,400) > 1)
  assert.ok(wheelMapZoom(1,100,0,400) < 1)
  assert.equal(clampMapZoom(-1), .25)
  assert.equal(clampMapZoom(100), 6)
  assert.equal(clampMapZoom(NaN), 1)
})
test('map focal correction preserves cursor or moving pinch center, including crossing zoom=1', () => {
  for (const oldZoom of [.25,.8,1,2,6]) for (const newZoom of [.25,.9,1,3,6]) {
    const cursor = {x:337,y:289}, oldGrid = {x:50,y:80}, newGrid = {x:600,y:700}
    const anchor = mapPointAt(cursor,oldGrid,oldZoom)
    for (const to of [cursor,{x:367,y:300}]) {
      const scroll = mapAnchorCorrection(anchor,to,newGrid,newZoom)
      assert.ok(Math.abs(newGrid.x - scroll.x + anchor.x * newZoom - to.x) < 1e-9)
      assert.ok(Math.abs(newGrid.y - scroll.y + anchor.y * newZoom - to.y) < 1e-9)
    }
  }
})
test('pinch geometry handles coincident fingers without division by zero', () => {
  assert.deepEqual(pinchGeometry({x:10,y:10},{x:30,y:10}),{center:{x:20,y:10},distance:20})
  assert.equal(pinchGeometry({x:10,y:10},{x:10,y:10}).distance,1)
})
function rig(canPan=true) {
  const calls = {pan:[],pinch:[],cancel:0}
  const gesture = createMapTouchGesture({canPan:()=>canPan,pan:p=>calls.pan.push(p),pinch:(...args)=>calls.pinch.push(args),cancelCardPress:()=>calls.cancel++})
  return {gesture,calls}
}
test('one-finger tap stays a card action; drag beyond slop cancels preview and pans', () => {
  const {gesture:g,calls:c}=rig()
  assert.equal(g.down(1,{x:10,y:10}),false)
  assert.equal(g.move(1,{x:12,y:12}),false)
  assert.equal(g.up(1),false)
  assert.equal(c.cancel,0)
  g.down(2,{x:10,y:10})
  assert.equal(g.move(2,{x:30,y:10}),true)
  assert.deepEqual(c.pan,[{x:20,y:0}])
  assert.equal(c.cancel,1)
  assert.equal(g.up(2),true)
  g.down(3,{x:10,y:10})
  assert.equal(g.up(3),false,'fresh taps must not require selection then confirmation')
})
test('two fingers cancel card press, zoom at their center, and block release clicks', () => {
  const {gesture:g,calls:c}=rig()
  g.down(1,{x:100,y:100})
  assert.equal(g.down(2,{x:200,y:100}),true)
  assert.equal(c.cancel,1)
  g.move(2,{x:250,y:100})
  assert.deepEqual(c.pinch,[[1.5,{x:150,y:100},{x:175,y:100}]])
  assert.equal(g.up(2),true)
  assert.equal(g.move(1,{x:0,y:0}),true)
  assert.equal(c.pan.length,0,'one remaining finger must not jump into dragging')
  assert.equal(g.up(1),true)
  assert.equal(g.active,false)
})
test('third finger pauses pinch, cancellation clears state, and unlocked locations do not pan', () => {
  const {gesture:g,calls:c}=rig(false)
  g.down(1,{x:0,y:0}); assert.equal(g.move(1,{x:50,y:0}),false)
  g.down(2,{x:100,y:0}); g.down(3,{x:150,y:0})
  g.move(2,{x:200,y:0}); assert.equal(c.pinch.length,0)
  g.up(3); g.move(2,{x:250,y:0}); assert.equal(c.pinch.length,1)
  g.cancel(); assert.equal(g.active,false)
  assert.equal(g.move(1,{x:500,y:0}),false)
  assert.equal(g.up(1),false)
})
test('map events are scoped, nonpassive, cancel long-press, and never write game data', () => {
  const composable = source('../src/arkham/composables/useMapViewport.ts')
  assert.match(composable,/element.addEventListener\('wheel', wheel, \{ passive: false \}\)/)
  assert.match(composable,/document.dispatchEvent\(new Event\('arkham:cancel-card-press'\)\)/)
  assert.doesNotMatch(composable,/window.addEventListener\('wheel'|setLocationOffset|fetch\(|axios/)
  assert.match(composable,/element.removeEventListener\('wheel', wheel\)/)
  assert.match(source('../src/arkham/mobile/MobileCard.vue'),/document.removeEventListener\('arkham:cancel-card-press', cancel\)/)
  assert.match(source('../src/arkham/components/Scenario.vue'),/if \(event.pointerType === 'touch'\) return/)
})
test('divider grips are two small triangles with a larger invisible touch target', () => {
  const css = source('../src/arkham/components/TabletopLayoutControls.vue')
  assert.match(css,/width: 44px; height: 44px/)
  assert.match(css,/width: 6px; height: 12px/)
  assert.match(css,/width: 12px; height: 6px/)
  assert.match(css,/clip-path: polygon/)
  assert.doesNotMatch(css,/height: 44px; left: 3px|width: 44px; height: 18px/)
})
