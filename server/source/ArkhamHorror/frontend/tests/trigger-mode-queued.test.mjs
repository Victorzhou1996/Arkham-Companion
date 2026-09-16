import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8')
const code=ts.transpileModule(read('arkham/triggerModeChoices.ts'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {skippedOptionalAbility:blocked,visibleTriggerChoices:visible,automaticTriggerSkip:skip,authorizedAutomaticSeat:allowed}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
const game=(mode='AbilityAutoSkip')=>({activeInvestigatorId:'rex',investigators:{lola:{settings:{perCardSettings:{c03006:{cardAbilityModes:{2:mode}}}}}}})
const ability=(type='FastAbility',index=2)=>({tag:'AbilityLabel',investigatorId:'lola',ability:{cardCode:'c03006',index,type:{tag:type}}})
const pass={tag:'SkipTriggersButton',investigatorId:'lola'}
const q={tag:'ChooseOne',isPlayerWindow:true}
test('actual Lola queued fast window: stopped ability hides without changing server answer indices',()=>{
 const raw=[ability(),pass]; const v=visible(game(),raw)
 assert.equal(v[0].tag,'InvalidLabel');assert.equal(v[1],pass);assert.equal(raw[0].tag,'AbilityLabel');assert.equal(skip(game(),q,raw),1)
})
test('owner-only compares active investigator, never current viewing perspective',()=>{
 assert.equal(blocked(game('AbilityOwnerOnly'),ability()),true)
 const g=game('AbilityOwnerOnly');g.activeInvestigatorId='lola';assert.equal(blocked(g,ability()),false)
})
for(const type of ['ActionAbility','ForcedAbility','SilentForcedAbility','ForcedWhen','UnknownAbility'])test(`never silently discards ${type}`,()=>assert.equal(blocked(game(),ability(type)),false))
test('another enabled ability or another index keeps the window actionable',()=>{
 assert.equal(skip(game(),q,[ability(),ability('ReactionAbility',1),pass]),-1)
 assert.equal(skip(game('AbilityAlwaysAsk'),q,[ability(),pass]),-1)
})
test('never ends a turn, pays, chooses a card, or dismisses an unknown choice',()=>{
 for(const tag of ['EndTurnButton','TargetLabel','Label','Done','ComponentLabel'])assert.equal(skip(game(),q,[ability(),pass,{tag}]),-1)
 assert.equal(skip(game(),{tag:'ChooseOne'},[ability(),pass]),-1)
 assert.equal(skip(game(),q,[ability()]),-1)
 assert.equal(skip(game(),q,[pass]),-1)
 assert.equal(skip(game(),q,[ability(),pass,pass]),-1)
})
test('wrapped response window can use its one explicit server skip control',()=>assert.equal(skip(game(),{tag:'QuestionWithSource',question:{tag:'ChooseOne',isWindowResponse:true}},[ability(),pass]),1))
test('multiplayer viewing another seat is not permission to answer it',()=>{
 assert.equal(allowed(false,'me','them'),false);assert.equal(allowed(false,'me','me'),true)
 assert.equal(allowed(true,'me','them'),true);assert.equal(allowed(true,null,'them'),false)
})
test('production automatic handler guards spectator/UI lock/processing and deduplicates exact question',()=>{
 const s=read('arkham/views/Game.vue');const block=s.slice(s.indexOf('const automaticSkipAttempts'),s.indexOf('const automaticSkipAttempts')+1400)
 for(const guard of ['processing.value','uiLock.value','props.spectate','authenticatedSeat.value','automaticSkipAttempts.has','g.scenarioSteps'])assert.ok(block.includes(guard),guard)
 assert.doesNotMatch(block,/setInterval|setTimeout|fetchGame/)
})
test('empty equipment slots match card size and rounded thin border; control columns have no scrollbar',()=>{
 const s=read('styles/edgeTabletop.css')
 assert.match(s,/\.slot \{ background: transparent; width: var\(--card-width\); height: calc\(var\(--card-width\) \* 1.4\)/)
 assert.match(s,/border: 1px solid #9a9577; border-radius: 7px/)
 assert.match(s,/grid-template-rows: repeat\(3,28px\)/)
 assert.doesNotMatch(s,/\.player-buttons \{[^}]*overflow-y: auto/)
 assert.match(s,/scenario::before[^}]*bottom: var\(--edge-bottom\)/)
})
