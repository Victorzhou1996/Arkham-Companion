import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = file => readFileSync(new URL(file, import.meta.url), 'utf8')
const js = ts.transpileModule(source('../src/arkham/mobile/actionHints.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { inspectMobileActions, inspectMobileScenarioActions, GAME_ACTION_SELECTOR, markMobileActionCards, enabledGameActions } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
test('landscape category tabs inherit hidden scenario actions without hiding pending prompts', () => {
  const actions=['scene','encounter','reference','other',null].map(group=>({closest:()=>group?{getAttribute:()=>group}:null}))
  assert.deepEqual(inspectMobileScenarioActions(actions), {scene:true,encounter:true,reference:true,other:true})
  assert.deepEqual(inspectMobileScenarioActions([]), {})
  const scenario=source('../src/arkham/components/Scenario.vue')
  assert.match(scenario, /<MobileScenarioNav v-if="mobileEnabled"/)
  assert.doesNotMatch(scenario, /<SkillTest[^>]*data-mobile-scenario-group/)
  const css=source('../src/styles/mobileGame.css')
  assert.match(css, /#game.mobile-game.touch-game \{ display: grid; grid-template-columns: 66px/)
  assert.match(css, /\.mobile-scenario-nav \{ display: none/)
})
// DOM adapter tests exercise aggregation independently of browser visibility.
function action({ owner, zone, disabled=false, top=false } = {}) {
  return { matches: () => disabled, closest: selector => selector === '[data-player-tab]'
    ? (owner ? {getAttribute: () => owner} : null)
    : selector === '.scenario-cards, .tabletop-tools' ? (top ? {} : null)
    : selector === zone ? {} : null }
}
const scan = actions => inspectMobileActions({querySelectorAll: () => actions})
test('hidden player zones aggregate separately, including investigator resources/skip/abilities', () => {
  const hints = scan([action({owner:'one',zone:'.hand-area'}),action({owner:'one',zone:'.investigator-and-deck'}),action({owner:'two',zone:'.tabletop-threats'}),action({owner:'two',zone:'.tabletop-equipment'})])
  assert.deepEqual(hints,{top:false,bottom:true,players:{one:{hand:true,threats:false,equipment:false,investigator:true},two:{hand:false,threats:true,equipment:true,investigator:false}}})
})
test('disabled controls do not light tabs; map actions do not falsely light collapsed top/bottom', () => {
  assert.deepEqual(scan([action({owner:'one',zone:'.hand-area',disabled:true}),action()]),{top:false,bottom:false,players:{}})
})
test('scenario actions light only the top fold, and removed actions clear previous hints', () => {
  assert.deepEqual(scan([action({top:true})]),{top:true,bottom:false,players:{}})
  assert.deepEqual(scan([]),{top:false,bottom:false,players:{}})
})
test('availability covers live small ability anchors, resources, decks and all entity markers', () => {
  for (const marker of ['data-mobile-ability-available','data-game-actionable','--can-interact','--can-progress','resource--can-take','resource--can-spend','clue--can-spend','deck--can-draw']) assert.ok(GAME_ACTION_SELECTOR.includes(marker),marker)
})

test('closed actionable stacks retain their live marker without a redundant text label', () => {
  const stack = source('../src/arkham/components/CardsUnderIndicator.vue')
  assert.match(stack, /:data-game-actionable="count > 0 && isHighlighted \|\| undefined"/)
  assert.match(stack, /const isHighlighted = computed\(\(\) => props.highlighted \|\| hasCardChoice.value\)/)
  const css = source('../src/styles/mobileGame.css')
  assert.doesNotMatch(css, /content: '可操作'/)
  assert.match(css, /\.cards-under-indicator\[data-game-actionable=true\]/)
  assert.deepEqual(scan([action({top:true}), action({owner:'one',zone:'.tabletop-equipment'})]), {
    top:true,bottom:true,players:{one:{hand:false,threats:false,equipment:true,investigator:false}},
  })
})

test('tiny actions mark their enclosing card, clear stale marks, and ignore inert/pending ancestors', () => {
  const makeCard = () => ({ attrs:{}, getAttribute(k){return this.attrs[k]??null}, hasAttribute(k){return k in this.attrs}, setAttribute(k,v){this.attrs[k]=v}, removeAttribute(k){delete this.attrs[k]} })
  const card=makeCard(), idle=makeCard()
  idle.attrs['data-mobile-has-action']='true'
  let actions=[{ matches:()=>false, closest:s=>s==='[data-mobile-card]'?card:null }]
  const root={querySelectorAll:s=>s===GAME_ACTION_SELECTOR?actions:[card,idle]}
  markMobileActionCards(root)
  assert.equal(card.attrs['data-mobile-has-action'],'true')
  assert.deepEqual(idle.attrs,{})
  actions=[{ matches:()=>false, closest:s=>s==='[inert], .asset--pending'?{}:card }]
  assert.deepEqual(enabledGameActions(root),[])
  markMobileActionCards(root)
  assert.deepEqual(card.attrs,{})
})

test('touch hand and generic card abilities use preview menus without changing direct play', () => {
  const hand=source('../src/arkham/components/HandCard.vue')
  assert.match(hand,/touchAbilities = computed\(\(\) => isMobile.value \|\| !!mobileBoard\?\.touchEnabled.value\)/)
  assert.match(hand,/v-if="touchAbilities && abilities.length > 0"/)
  assert.match(hand,/if \(cardAction.value !== -1\) emit\('choose', cardAction.value\)/)
  assert.match(source('../src/arkham/components/Card.vue'),/AbilitiesMenu v-if="mobileBoard\?\.touchEnabled.value && abilities.length"/)
  const preview=source('../src/arkham/mobile/MobileCard.vue')
  assert.match(preview,/\.poolItem, img.key/)
  assert.match(preview,/button:not\(\[data-mobile-direct\]\)/)
  assert.match(source('../src/arkham/components/CardsUnderIndicator.vue'),/data-mobile-direct/)
})

test('hunch deck joins the investigator zone only on phones; tucked cards remain expanded there', () => {
  const player=source('../src/arkham/components/Player.vue')
  assert.match(player,/:disabled="!mobileEnabled \|\| !mobileHunchSlot"/)
  assert.match(player,/v-if="mobileEnabled" ref="mobileHunchSlot"/)
  assert.match(player,/!mobileEnabled.value && settings.hideInertCards/)
  const css=source('../src/styles/mobileGame.css')
  assert.match(css,/#game.mobile-game \.mobile-hunch-slot \{ display: contents/)
})

test('mobile card markers and minimized pending dialogs retain visible reduced-motion outlines', () => {
  const css=source('../src/styles/mobileGame.css')
  const steady=css.slice(0,css.indexOf('@media (prefers-reduced-motion: no-preference)'))
  assert.match(steady,/mobile-card\[data-mobile-has-action=true\][\s\S]*?outline: 3px solid/)
  assert.match(steady,/draggable--minimized:has\(\[data-game-actionable=true\]\)/)
  assert.match(source('../src/components/Draggable.vue'),/'draggable--minimized': isMinimized/)
  assert.match(source('../src/arkham/mobile/MobilePlayerStatus.vue'),/investigator.playerId !== playerId/)
})

test('phone action orange-red contrasts with felt and remains separate from selected gold', () => {
  const css=source('../src/styles/mobileGame.css')
  assert.match(css,/--mobile-action: #ff784f/)
  assert.match(css,/li.tab--selected[^}]*border-bottom-color: #c6aa63/)
  assert.match(css,/--hidden-location-action-glow: #ff784f/)
  const linear=x=>{const s=x/255; return s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4}
  const luminance=rgb=>rgb.map(linear).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)
  assert.ok((luminance([255,120,79])+.05)/(luminance([16,44,33])+.05)>5)
  assert.doesNotMatch(css,/inset 0 0 0 4px #fff3df/)
})

test('phone investigator fits normal piles and keeps expandable special-pile scrolling', () => {
  const css=source('../src/styles/mobileGame.css')
  assert.match(css,/\.player-container \{ flex: 0 0 190px; width: 190px/)
  assert.match(css,/\.player-card \{ flex: 0 0 120px; width: 120px/)
  assert.match(css,/investigator-and-deck \{ display: flex; flex-wrap: nowrap;[^}]*scrollbar-width: thin/)
  assert.match(css,/\.resources \{ display: flex; flex-wrap: wrap/)
  assert.match(css,/\.hunch-deck \{ flex: 0 0 78px/)
  assert.ok(190+78*2+8*2+20<=402)
  assert.match(css,/\.discard \{ width: 78px; flex: 0 0 78px; margin: 0/)
  assert.match(css,/\.discard img.card \{ width: 78px; max-width: 78px; height: auto/)
  assert.match(css,/\.view-discard-button.cards-under-indicator \{ width: 78px; max-width: 78px/)
})
test('observer follows asynchronous game root and new ability attributes; previews keep hint path', () => {
  const s=source('../src/arkham/mobile/useMobileActionHints.ts')
  assert.match(s,/watch\(\[root, board.enabled\]/)
  assert.match(s,/flush: 'post'/)
  assert.match(s,/data-mobile-ability-available/)
  assert.match(s,/if \(board.preview.value\) return/)
  assert.match(s,/onBeforeUnmount\(\(\) => \{ stop\(\)/)
  assert.doesNotMatch(s,/fetch|axios|choose\(/)
})
test('phone hints use one frame and accessible descriptions without visible action labels', () => {
  const css=source('../src/styles/mobileGame.css')
  const nav=source('../src/arkham/mobile/MobilePlayerNav.vue')
  assert.doesNotMatch(css,/@keyframes mobile-action-breathe/)
  assert.match(css,/outline: none; box-shadow: none !important/)
  assert.match(css,/\.mobile-zone-action \{[^}]*animation: none/)
  assert.match(nav,/players\[props.owner\]/)
  assert.doesNotMatch(nav,/可操作|mobile-action-label/)
  assert.match(nav,/:aria-description=/)
  const scenarioNav=source('../src/arkham/mobile/MobileScenarioNav.vue')
  assert.doesNotMatch(scenarioNav,/可操作|<small/)
  assert.match(scenarioNav,/:aria-description=/)
  assert.doesNotMatch(nav,/board.zone.value = zone as MobileZone/)
  assert.match(source('../src/arkham/mobile/MobileMapFold.vue'),/collapsed.value && board.actions.value\[props.edge\]/)
})
test('investigator fronts preserve natural landscape ratio both inline and in preview', () => {
  const css=source('../src/styles/mobileGame.css')
  for(const selector of ['#game.mobile-game .investigator-and-deck .investigator-image > img.card','.mobile-card-preview .mobile-preview-content .investigator-image > img.card']) {
    const block=css.slice(css.indexOf(selector),css.indexOf('}',css.indexOf(selector)))
    assert.match(block,/width: 100%/)
    assert.match(block,/height: auto/)
    assert.match(block,/aspect-ratio: auto/)
    assert.match(block,/object-fit: contain/)
  }
  assert.match(css,/investigator-and-deck \.stats \{[^}]*flex-direction: row/)
})
