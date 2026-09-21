import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const read = p => readFileSync(new URL('../src/'+p, import.meta.url), 'utf8')
const modeCode = ts.transpileModule(read('arkham/triggerModeChoices.ts'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const modeUrl = `data:text/javascript;base64,${Buffer.from(modeCode).toString('base64')}`
const code = ts.transpileModule(read('arkham/gameTaskStatus.ts'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace('./triggerModeChoices',modeUrl)
const {questionTaskKind: kind, pendingGameTasks: tasks} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
test('task status preserves response/action distinction through wrappers',()=>{
 assert.equal(kind({tag:'QuestionLabel',question:{tag:'ChooseOne',isWindowResponse:true,choices:[]}}),'response')
 assert.equal(kind({tag:'ChooseOne',isPlayerWindow:true,choices:[{tag:'EndTurnButton'}]}),'action')
 assert.equal(kind({tag:'ChooseOne',choices:[{tag:'AbilityLabel'}]}),'choice')
})
test('status never infers a specific target from mixed choices',()=>{
 const loc={tag:'TargetLabel',target:{tag:'LocationTarget'}}
 assert.equal(kind({tag:'ChooseOne',choices:[loc,{tag:'Done'}]}),'location')
 assert.equal(kind({tag:'ChooseOne',choices:[loc,{tag:'Label',label:'Other'}]}),'choice')
 assert.equal(kind({tag:'ChooseOne',choices:[]}),'choice')
 assert.equal(kind({tag:'Read'}),'read')
 assert.equal(kind({tag:'PayCostQuestion',question:{tag:'ChoosePaymentAmounts'}}),'payment')
})
test('waiting seats come from actual questions, including non-active investigators',()=>{
 const game={question:{b:{tag:'Read'},unknown:{tag:'ChooseOne',choices:[]}},playerOrder:['a','b','c','gone'],investigators:{a:{playerId:'a'},b:{playerId:'b'},c:{playerId:'b'},gone:{playerId:'b',eliminated:true}}}
 const result=tasks(game)
 assert.equal(result.length,2); assert.equal(result[0].investigators.length,2); assert.equal(result[1].investigators.length,0)
 assert.deepEqual(Object.keys(game.question),['b','unknown'])
})
test('top strip navigates explicitly, without game commands or decorative active highlights',()=>{
 const bar=read('arkham/components/ResponseStatusBar.vue'), tabs=read('arkham/components/PlayerTabs.vue')
 assert.match(bar,/arkham:locate-player/); assert.doesNotMatch(bar,/--active|--waiting|debug.send|sendAnswer/)
 assert.match(tabs,/detail.gameId !== props.game.id/); assert.match(tabs,/processing.value \|\| uiLock.value/)
 assert.match(tabs,/removeEventListener\('arkham:locate-player'/)
})
test('Joe hunch deck uses a complete aligned grid column, not a hand overlay',()=>{
 const css=read('styles/edgeTabletop.css')
 assert.match(css,/player-cards:has\(\.hunch-deck\) \{ grid-template-columns: var\(--edge-person\) var\(--edge-piles\) var\(--edge-piles\) minmax\(0,1fr\)/)
 assert.match(css,/\.player > \.hunch-deck \{ position: relative; grid-column: 3; grid-row: 2/)
 assert.doesNotMatch(css,/player-cards:has\(\.hunch-deck\).*width: 50%/)
})
