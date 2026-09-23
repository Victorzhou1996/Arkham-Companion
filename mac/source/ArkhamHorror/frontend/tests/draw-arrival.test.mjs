import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8')
const code=ts.transpileModule(read('arkham/drawTransition.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {createDrawTracker}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const before={gameId:'g',investigatorId:'i',step:1,inSetup:false,deck:['a','b','c'],hand:['h'],discard:[]}
test('draw tracker handles atomic and split deck/hand updates exactly once',()=>{
 const t=createDrawTracker()
 assert.deepEqual(t.update(before,0),[])
 assert.deepEqual(t.update({...before,step:2,deck:['b','c']},1),[])
 assert.deepEqual(t.update({...before,step:3,deck:['b','c'],hand:['h','a']},2),['a'])
 assert.deepEqual(t.update({...before,step:4,deck:['c'],hand:['h','a','b']},3),['b'])
 assert.deepEqual(t.update({...before,step:4,deck:['c'],hand:['h','a','b']},4),[])
})
test('multiple departures survive unrelated intermediate messages including final empty deck',()=>{
 const t=createDrawTracker();t.update(before,0)
 const removed={...before,step:2,deck:[]}
 t.update(removed,1);t.update({...removed,step:3},2)
 assert.deepEqual(t.update({...removed,step:4,hand:['h','a','b','c']},3),['a','b','c'])
})
for(const patch of [{gameId:'other'},{investigatorId:'other'},{step:0},{inSetup:true}])
test('reset boundary never animates old departures: '+JSON.stringify(patch),()=>{
 const t=createDrawTracker();t.update(before,0);t.update({...before,step:2,deck:['b','c']},1)
 assert.deepEqual(t.update({...before,deck:['b','c'],hand:['h','a'],...patch},2),[])
})
test('discarded and expired departures cannot masquerade as a new draw',()=>{
 for(const [discard,time] of [[['a'],2],[[],12000]]) {
  const t=createDrawTracker();t.update(before,0);t.update({...before,step:2,deck:['b','c'],discard},1)
  assert.deepEqual(t.update({...before,step:3,deck:['b','c'],hand:['h','a'],discard},time),[])
 }
})
test('explicit reset and no deck departure suppress non-draw appearances',()=>{
 const t=createDrawTracker();t.update(before,0)
 assert.deepEqual(t.update({...before,hand:['h','returned']},1),[])
 t.reset()
 assert.deepEqual(t.update({...before,hand:['h','a'],deck:['b','c']},2),[])
})
test('real rendered slot moves through Teleport; never create a duplicate image',()=>{
 const component=read('arkham/components/DrawCardFlight.vue')
 assert.match(component,/<Teleport to="body" :disabled="!flying">/)
 assert.match(component,/<slot v-else \/>/)
 assert.match(component,/content.value.animate/)
 assert.doesNotMatch(component,/createElement|cloneNode|ghost|setInterval|requestAnimationFrame/)
 for(const term of ['visibilitychange','resize','scroll','onBeforeUnmount','prefers-reduced-motion','img.decode','generation']) assert.ok(component.includes(term),term)
})
test('draw origins are assigned before rendering and bypass conflicting legacy enter hooks',()=>{
 const player=read('arkham/components/Player.vue')
 assert.match(player,/flush: 'pre'/)
 assert.match(player,/mobileEnabled.value \|\| !root\?\.closest\('#game.edge-tabletop'\)/)
 assert.match(player,/:draw-origin="mobileEnabled \? undefined/)
 assert.equal((player.match(/hasAttribute\('data-draw-arrival'\)/g)||[]).length,2)
 assert.doesNotMatch(player,/flyDrawnCard|cancelDraws|onCleanup\(\(\) => \{ stale/)
})
test('phase steps remain a single column with bounded scrolling',()=>{
 const css=read('styles/edgeTabletop.css')
 const rules=[...css.matchAll(/\.subphases\s*\{([^}]*)\}/g)].map(x=>x[1])
 assert.ok(rules.some(s=>s.includes('grid-template-columns: minmax(0,1fr)')))
 assert.ok(rules.every(s=>!s.includes('repeat(')))
 assert.match(css,/\.phases \{[^}]*overflow-y: auto; overflow-x: hidden/)
})
