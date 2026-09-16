import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8')
async function moduleAt(p){return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(read(p),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'))}
const {logCategory,appendedLogCount}=await moduleAt('arkham/logPresentation.ts')
const {containsPoint,PREVIEW_OPEN_DELAY,PREVIEW_LEAVE_DELAY}=await moduleAt('arkham/previewPolicy.ts')
test('log labels use actual saved references, never infer resource deltas',()=>{
 assert.equal(logCategory('{card:01001}'),'cards');assert.equal(logCategory('{location:x}'),'locations');assert.equal(logCategory('{token:skull}'),'tokens');assert.equal(logCategory('Drew a card'),'other')
 assert.equal(appendedLogCount(['a'],['a','b','c']),2);assert.equal(appendedLogCount(['a','b'],['a']),0);assert.equal(appendedLogCount(['a'],['b','c']),0);assert.equal(appendedLogCount(['a'],['a']),0)
})
test('card preview switches immediately with accessible optional dismissal',()=>{
 assert.equal(PREVIEW_OPEN_DELAY,0);assert.equal(PREVIEW_LEAVE_DELAY,0)
 const element={getBoundingClientRect:()=>({left:10,right:30,top:10,bottom:30,width:20,height:20})}
 assert.equal(containsPoint(element,{clientX:20,clientY:20}),true)
 assert.equal(containsPoint(element,{clientX:31,clientY:20}),false)
 for(const f of ['CardRow','StackIndicator','CardsUnderIndicator','Asset']) assert.match(read(`arkham/components/${f}.vue`),/Escape/)
 const overlay=read('arkham/components/CardOverlay.vue');assert.match(overlay,/card-overlay\.card-overlay--explicit/);assert.match(overlay,/arkham:preview-card/);assert.match(overlay,/removeEventListener/)
})
test('visual source/attack state is not an actionable card highlight',()=>{
 for(const f of ['Asset','Enemy','Investigator','Location','Scenario']){
  const content=read(`arkham/components/${f}.vue`).split('<style')[0]
  assert.doesNotMatch(content,/["'](?:source-highlight|ability-target)["']\s*:/)
 }
 assert.doesNotMatch(read('arkham/components/PlayerTabs.vue').split('<style')[0],/["']glow-effect["']\s*:/)
})
test('special piles remain data-driven and preserve hidden information',()=>{
 const player=read('arkham/components/Player.vue'),asset=read('arkham/components/Asset.vue')
 assert.match(player,/HunchDeck/);assert.match(player,/revealedHunchCard/);assert.match(asset,/knownMarketDeck/);assert.match(asset,/spiritDeckTop.value\?\.tag === 'EncounterCard'/)
 assert.match(read('locales/zh/investigators.json'),/直觉牌库/)
})
test('unread state does not auto-open the log; earlier reading keeps position',()=>{
 const game=read('arkham/views/Game.vue'),start=game.indexOf('let logBaselineReady'),end=game.indexOf('const socketError',start)
 assert.doesNotMatch(game.slice(start,end),/showSidebar.value\s*=/)
 assert.match(game.slice(start,end),/appendedLogCount/)
 const log=read('arkham/components/GameLog.vue');assert.match(log,/if \(!atEnd.value\)/);assert.match(log,/top \+ el.scrollHeight - before/)
})
test('non-game pages opt into one scoped theme and Build remains texture-free CSS',()=>{
 assert.match(read('views/Home.vue'),/site-workspace/)
 for(const p of ['NewCampaign','Decks','Cards','Achievements','Bugs'])assert.match(read(`arkham/views/${p}.vue`),/site-workspace/)
 const css=readFileSync(new URL('../../build-theme/arkham-green-v20260916.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');assert.match(css,/background-image:\s*none/);assert.doesNotMatch(css,/url\(|animation|position:|display:/)
})
