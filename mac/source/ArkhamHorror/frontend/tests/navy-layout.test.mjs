import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8')
const code=ts.transpileModule(read('arkham/locationLayout.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {parseLocationOffsets}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
test('visual position preferences reject corrupt data without failing game entry',()=>{
 for(const raw of [null,'null','[]','broken','{"x":null}','{"x":{"x":"2","y":3}}']) assert.deepEqual(parseLocationOffsets(raw),{})
 assert.deepEqual(parseLocationOffsets('{"a":{"x":20.5,"y":-40},"bad":{"x":2}}'),{a:{x:20.5,y:-40}})
 assert.deepEqual(parseLocationOffsets('{"a":{"x":100001,"y":-100001}}'),{a:{x:100000,y:-100000}})
})
test('location dragging and reset never enqueue undoable game updates',()=>{
 const s=read('arkham/components/Scenario.vue')
 assert.doesNotMatch(s,/setLocationOffset\(|resetLocationOffsets\(/)
 assert.match(s,/saveVisualLocations\(\{ \.\.\.visualLocationOffsets.value/)
 assert.match(s,/return \{ \.\.\.offsets, \.\.\.visualLocationOffsets.value \}/)
 assert.match(s,/visual-location-offsets/)
})
test('edge layout keeps personal piles visible and scenes out of the player grid',()=>{
 const s=read('styles/edgeTabletop.css')
 assert.match(s,/#player-zone \{[^}]*width: calc\(100% - var\(--edge-rail\)\)/)
 assert.match(s,/\.discard \{ grid-row: 1/)
 assert.match(s,/\.scenario-encounter-decks \{[^}]*bottom: calc\(var\(--edge-bottom\) \+ 12px\)/)
 assert.match(s,/\.scenario-cards \{[^}]*top: 8px/)
 assert.match(s,/\.edge-scene-shelf \{[^}]*height: 30px/)
 assert.match(read('arkham/components/Scenario.vue'),/<Teleport :to="edgeSceneSlot \|\| 'body'" :disabled="!tabletopDesktop \|\| !edgeSceneSlot">/)
 assert.match(s,/tabletop-log-collapsed #game-log-sidebar \{ display: none/)
})

test('scene title taps bypass card-preview interception and pins survive resize',()=>{
 for(const name of ['Act','Agenda']) assert.match(read(`arkham/components/${name}.vue`),/data-mobile-direct class="edge-scene-name"/)
 assert.match(read('arkham/components/EdgeTabletopControls.vue'),/if \(existing\) \{ existing.sync\(\); continue \}/)
 assert.match(read('arkham/components/EdgeTabletopControls.vue'),/card.dataset.scenePinned = String\(pinned\)/)
 assert.match(read('styles/edgeTabletop.css'),/100cqh - 62px/)
 assert.match(read('styles/edgeTabletop.css'),/#game.mobile-game \.investigator-short-name \{ display: none !important/)
 assert.doesNotMatch(read('styles/edgeTabletop.css'),/#game:not\(\.edge-tabletop\)/)
 assert.match(read('styles/edgeTabletop.css'),/\.game \{ overflow: clip/)
})
