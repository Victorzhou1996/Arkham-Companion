import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8')
const code=ts.transpileModule(read('arkham/drawTransition.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {drawnCardIds}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const before={gameId:'game',investigatorId:'i',step:10,inSetup:false,deck:['a','b','c'],hand:['h']}
test('draw identities distinguish single / multiple draws from unrelated hand changes',()=>{
 assert.deepEqual(drawnCardIds(before,{...before,step:11,deck:['c'],hand:['h','a','b']}),['a','b'])
 assert.deepEqual(drawnCardIds(before,{...before,step:11,hand:['h','returned-asset']}),[])
 assert.deepEqual(drawnCardIds(before,{...before,hand:['h','a']}),[])
})
test('draw animations never replay at initial entry, setup, another game / investigator or undo',()=>{
 const after={...before,step:11,deck:['b','c'],hand:['h','a']}
 assert.deepEqual(drawnCardIds(undefined,after),[])
 for(const diff of [{step:9},{inSetup:true},{gameId:'other'},{investigatorId:'other'}])
   assert.deepEqual(drawnCardIds(before,{...after,...diff}),[])
 assert.deepEqual(drawnCardIds({...before,inSetup:true},after),[])
 assert.deepEqual(drawnCardIds(after,after),[])
})
test('green map has no tint or panel boxes and uses reduced avatar diameter',()=>{
 const css=read('styles/edgeTabletop.css')
 assert.doesNotMatch(css,/#092343|background-blend-mode/)
 for(const name of ['scenario-cards','scenario-encounter-decks'])
   assert.match(css,new RegExp('\\.'+name+' \\{[^}]*background: transparent;[^}]*border: 0|\\.'+name+' \\{[^}]*border: 0;[^}]*background: transparent'))
 assert.match(css,/width: clamp\(33px,2.7vw,75px\); height: clamp\(33px,2.7vw,75px\)/)
})
test('phase rail reserves player space; eyes align at bottom with rounded selection',()=>{
 const css=read('styles/edgeTabletop.css')
 assert.match(css,/inset: 0 auto var\(--edge-bottom\) 0/)
 assert.match(css,/@container \(max-height: 380px\)/)
 assert.match(css,/switch-investigators \{ position: absolute; bottom: 5px/)
 assert.match(css,/switch-investigators\[aria-pressed="true"\] \{[^}]*border-radius: 7px/)
 const split=read('arkham/components/TabletopLayoutControls.vue')
 assert.match(split,/equipment\?\.left \?\? hand.left/)
 assert.match(split,/map.offsetWidth - map.clientWidth/)
 assert.match(split,/gutter \+ 20/)
})
test('one group owns scene hover/pin, with folded content inert and shared heading',()=>{
 const controls=read('arkham/components/EdgeTabletopControls.vue')
 assert.match(controls,/const selector = '.edge-scene-shelf .edge-scene-group'/)
 assert.doesNotMatch(controls,/titles.join/)
 assert.match(controls,/content.inert = !expanded/)
 assert.match(controls,/names.forEach\(name => name.setAttribute\('aria-expanded'/)
 assert.doesNotMatch(controls,/setInterval|requestAnimationFrame|MutationObserver/)
 const css=read('styles/edgeTabletop.css')
 assert.match(css,/\.edge-scene-group.edge-scene-raised/)
 assert.doesNotMatch(css,/scenario-decks > \.edge-scene-raised/)
})
test('flight is finite, cancellable and honors reduced motion without moving real cards',()=>{
 const s=read('arkham/components/DrawCardFlight.vue')
 assert.match(s,/prefers-reduced-motion: reduce/)
 assert.match(s,/document.hidden/)
 assert.match(s,/<Teleport to="body"/)
 assert.match(s,/pointerEvents: 'none'/)
 assert.match(s,/animation.finished.then/)
 assert.match(s,/animation\?\.cancel\(\)/)
 assert.doesNotMatch(s,/setInterval|requestAnimationFrame|target.style|source.style/)
})
