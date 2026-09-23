import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8')
const code=ts.transpileModule(read('arkham/investigatorStatusColor.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {statusClassColors,investigatorStatusBackground:background}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
test('all six professions have distinct legible backgrounds, multiple investigators preserve both colors',()=>{
 assert.equal(new Set(Object.values(statusClassColors)).size,6)
 const luminance=h=>h.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0)
 for(const [name,color] of Object.entries(statusClassColors)){
  assert.equal(background([{class:name}]),color)
  assert.ok((luminance('#fff7e5')+.05)/(luminance(color)+.05)>=4.5,name)
 }
 assert.equal(background([]),statusClassColors.Neutral)
 assert.equal(background([{class:'Unknown'}]),statusClassColors.Neutral)
 assert.match(background([{class:'Seeker'},{class:'Mystic'}]),/linear-gradient/)
})
test('hover image switches synchronously, without sticky overlay geometry or shared drawer timer',()=>{
 const overlay=read('arkham/components/CardOverlay.vue')
 const queue=overlay.slice(overlay.indexOf('const queueHover'),overlay.indexOf('const onPreviewKey'))
 assert.doesNotMatch(queue,/setTimeout/)
 assert.match(queue,/hoveredElement.value = el/)
 assert.doesNotMatch(overlay,/containsPoint\(cardOverlay.value, e\)/)
 assert.doesNotMatch(read('arkham/sceneDrawer.ts'),/import.*previewPolicy/)
 assert.match(read('arkham/sceneDrawer.ts'),/SCENE_LEAVE_DELAY = 900/)
})
test('circular actionable miniatures and compact buttons override broad styles without changing phones',()=>{
 assert.match(read('styles/tabletopInteraction.css'),/\.location-investigator-column \.portrait \{ border-radius: 50% !important/)
 const css=read('styles/edgeTabletop.css')
 assert.match(css,/\.response-status__task,\.ui-mode-switch\).*min-height: 22px/)
 assert.match(css,/\.player-buttons \.button-group \{ display: flex; flex-direction: column; flex-wrap: nowrap/)
 assert.doesNotMatch(read('arkham/components/Investigator.vue'),/game\.totalClues|edge-personal-totals|controlColumns/)
 assert.match(read('arkham/components/Scenario.vue'),/:amount="game.totalClues" tooltip="Total Spendable Clues/)
 assert.match(css,/\.investigator-status \{[^}]*flex-wrap: nowrap/)
 assert.match(css,/\.player-container \.stats \{[^}]*width: 100%/)
 assert.match(css,/\.player-container \.player-area \{[^}]*align-items: end/)
 assert.match(css,/#game.edge-tabletop #totals \{[^}]*left: 8px/)
 assert.match(css,/\.deck-container,\.discard\) \{[^}]*align-items: center; justify-content: center/)
})
