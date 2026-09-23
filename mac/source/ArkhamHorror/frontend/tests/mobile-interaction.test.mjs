import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8')
async function load(path) {
  const js = ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}
const { createPressGesture, PREVIEW_HOLD_MS, PRESS_SLOP_PX } = await load('../src/arkham/mobile/pressGesture.ts')
const { playerDeckChoice } = await load('../src/arkham/playerDeckChoice.ts')
const { phonePresentation, isTabletDevice } = await load('../src/arkham/mobile/devicePresentation.ts')
function rig() {
  let now = 0, next = 0, opens = 0
  const tasks = new Map()
  const gesture = createPressGesture(() => opens++, (fn, ms) => { tasks.set(++next, { fn, at: now + ms }); return next }, id => tasks.delete(id))
  return { gesture, get opens() { return opens }, tick(ms) { now += ms; for (const [id, task] of tasks) if (task.at <= now) { tasks.delete(id); task.fn() } } }
}
test('mobile: a short tap remains one original action, no preview or confirmation', () => {
  const r = rig(); r.gesture.down(10, 10, 1); r.tick(100); r.gesture.up()
  assert.equal(r.gesture.consumeClick(), false); r.tick(1000); assert.equal(r.opens, 0)
})
test('mobile: 450 ms hold previews once and consumes the release click', () => {
  const r = rig(); r.gesture.down(10, 10, 1); r.tick(PREVIEW_HOLD_MS - 1); assert.equal(r.opens, 0)
  r.tick(1); assert.equal(r.opens, 1); r.tick(1000); assert.equal(r.opens, 1)
  r.gesture.up(); assert.equal(r.gesture.consumeClick(), true)
  r.gesture.down(10, 10, 2); r.gesture.up(); assert.equal(r.gesture.consumeClick(), false)
})
test('mobile: finger jitter does not cancel, but scrolling cancels preview and action', () => {
  const r = rig(); r.gesture.down(0, 0, 1); r.gesture.move(PRESS_SLOP_PX - 1, 0, 1); r.tick(450)
  assert.equal(r.opens, 1); r.gesture.up()
  r.gesture.down(0, 0, 2); r.gesture.move(PRESS_SLOP_PX + 1, 0, 2); r.tick(1000); r.gesture.up()
  assert.equal(r.opens, 1); assert.equal(r.gesture.consumeClick(), true)
})
test('mobile: cancellation, multiple fingers and unmount cannot leave a pending action', () => {
  for (const stop of [g => g.cancel(), g => g.down(1, 1, 2), g => g.dispose()]) {
    const r = rig(); r.gesture.down(0, 0, 1); stop(r.gesture); r.tick(1000); assert.equal(r.opens, 0)
  }
})
test('mobile: another pointer cannot move the active press origin', () => {
  const r = rig(); r.gesture.down(0, 0, 1); r.gesture.move(100, 100, 2); r.tick(450); assert.equal(r.opens, 1)
})
test('mobile quick draw shares deck ownership and live choice lookup', () => {
  const choices = [{ tag: 'Label' }, { tag: 'ComponentLabel', component: { tag: 'InvestigatorDeckComponent' } }]
  assert.equal(playerDeckChoice(choices, 'a', 'a'), 1)
  assert.equal(playerDeckChoice(choices, 'a', 'b'), -1)
  assert.equal(playerDeckChoice([], 'a', 'a'), -1)
  assert.equal(playerDeckChoice([{tag:'ComponentLabel',component:{tag:'InvestigatorComponent'}}], 'a', 'a'), -1)
})
test('mobile: preview teleports live slots; desktop has the original wrapper-free slot', () => {
  const s = source('../src/arkham/mobile/MobileCard.vue')
  assert.match(s, /<slot v-if="!mobile"/)
  assert.match(s, /<Teleport to="body" :disabled="!open"/)
  assert.match(s, /gesture\.consumeClick\(\)/)
  assert.match(s, /window\.addEventListener\('pointerup'/)
  assert.match(s, /onBeforeUnmount.*detach\(\)/)
  assert.doesNotMatch(s, /cloneNode|innerHTML|fetchCard\(/)
  assert.doesNotMatch(s, /@pointerup="close/)
})
test('mobile: separate layout, landscape detection, preferences, safe area and viewport', () => {
  const g = source('../src/arkham/views/Game.vue')
  const ctx = source('../src/arkham/mobile/context.ts')
  const css = source('../src/styles/mobileGame.css')
  assert.match(g, /'tabletop-game': isActualScenarioView && !mobileEnabled/)
  assert.match(g, /TabletopLayoutControls v-if="isActualScenarioView && !mobileEnabled"/)
  assert.match(g, /:inert="touchEnabled && !!mobilePreview"/)
  assert.match(ctx, /pointer: coarse/)
  assert.match(ctx, /visualViewport/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
  assert.match(source('../src/arkham/components/Scenario.vue'), /`mobile:\$\{key\}`/)
  assert.match(source('../src/arkham/components/PlayerTabs.vue'), /'mobile:selected-tab'/)
  assert.match(source('../src/arkham/components/Player.vue'), /mobileEnabled.value \? 'mobile:' : ''/)
  assert.match(g, /matchMedia\(mobileSidebarQuery\)/)
  assert.match(source('../src/arkham/components/AdaptiveHand.vue'), /if \(touch.value \|\| !enabled.value/)
})

const iphoneWebKit = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const safariSuffix = 'Version/26.0 Mobile/15E148 Safari/604.1'
const desktopSafari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'
const iPhone = {userAgent:`${iphoneWebKit} ${safariSuffix}`, platform:'iPhone', maxTouchPoints:5, screenWidth:402, screenHeight:874, coarsePointer:true}
const iPad = {...iPhone, userAgent:desktopSafari, platform:'MacIntel', screenWidth:768, screenHeight:1024}

for (const [browser, suffix] of [
  ['Safari', safariSuffix],
  ['Chrome', 'CriOS/140.0.7339.39 Mobile/15E148 Safari/604.1'],
  ['Edge', 'Version/26.0 EdgiOS/140.0.3485.54 Mobile/15E148 Safari/605.1.15'],
  ['Firefox', 'FxiOS/142.0 Mobile/15E148 Safari/605.1.15'],
]) {
  test(`real iPhone ${browser} UA: "like Mac OS X" never means iPad`, () => {
    const device = {...iPhone, userAgent:`${iphoneWebKit} ${suffix}`}
    assert.equal(isTabletDevice(device), false)
    for (const [w,h] of [[402,874],[402,760],[402,450],[874,402]]) assert.equal(phonePresentation(w,h,device), true)
    assert.equal(isTabletDevice({...device, screenWidth:1206,screenHeight:2622}), false)
  })
}

test('phone-sized desktop Safari identity stays a phone, while iPad Split View stays a tablet', () => {
  const desktopModePhone = {...iPhone, userAgent:desktopSafari, platform:'MacIntel'}
  assert.equal(isTabletDevice(desktopModePhone), false)
  assert.equal(phonePresentation(402,760,desktopModePhone), true)
  assert.equal(phonePresentation(402,760,iPad), false)
})

test('iPod and explicit iPhone platform are not tablets; coarse Android tablets remain tablets', () => {
  assert.equal(isTabletDevice({...iPhone,userAgent:'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',platform:'iPod'}), false)
  assert.equal(isTabletDevice({...iPhone,userAgent:desktopSafari}), false)
  const android = {...iPhone,userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36',platform:'Linux armv8l',screenWidth:800,screenHeight:1280}
  assert.equal(isTabletDevice(android), true)
  assert.equal(isTabletDevice({...android,screenWidth:412,screenHeight:915}), false)
})
test('iPad uses PC presentation in portrait, landscape and Split View, including desktop Safari identity', () => {
  assert.equal(isTabletDevice(iPad), true)
  for (const [w,h] of [[768,1024],[1024,768],[600,800],[400,800],[768,450]]) assert.equal(phonePresentation(w,h,iPad), false)
  assert.equal(isTabletDevice({...iPad,userAgent:'iPad',platform:'iPad'}), true)
  assert.equal(isTabletDevice({...iPad,userAgent:'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',platform:'iPad'}), true)
})
test('iPhone keeps phone presentation in landscape and when browser chrome/keyboard reduces height', () => {
  for (const [w,h] of [[402,874],[402,760],[402,450],[874,402]]) assert.equal(phonePresentation(w,h,iPhone), true)
  assert.equal(isTabletDevice(iPhone), false)
})
test('desktop Mac is not mistaken for iPad; narrow desktop can still preview phone UI', () => {
  const desktop = {...iPad, maxTouchPoints:0,coarsePointer:false}
  assert.equal(isTabletDevice(desktop), false)
  assert.equal(phonePresentation(1440,900,desktop), false)
  assert.equal(phonePresentation(402,760,desktop), true)
})
test('tablet shares touch preview but not the phone layout or old two-tap hand', () => {
  const ctx = source('../src/arkham/mobile/context.ts')
  assert.match(ctx, /!tablet.value && \(phone.value \|\| narrow.value \|\| touchLandscape.value\)/)
  assert.match(ctx, /enabled.value \|\| tablet.value/)
  assert.match(source('../src/arkham/mobile/MobileCard.vue'), /board\?\.touchEnabled.value/)
  assert.match(source('../src/arkham/isMobile.ts'), /board\?\.touchEnabled.value \? false/)
  assert.match(source('../src/arkham/components/TabletopLayoutControls.vue'), /dragHold.start\(event/)
  assert.match(source('../src/components/Draggable.vue'), /dragHold.start\(e/)
})
test('phone permanent regions reserve grid rows instead of overlaying hand and map', () => {
  const css = source('../src/styles/mobileGame.css')
  assert.match(css, /\.player-cards \{ display: grid; grid-template-rows: 44px minmax\(0, 1fr\) 46px/)
  assert.match(css, /\.mobile-player-nav \{ grid-row: 3; grid-column: 1; position: static/)
  assert.match(css, /\.location-cards-container \.zoom-control \{ grid-row: 3; grid-column: 1; position: static/)
  assert.doesNotMatch(css, /margin-left: -42px/)
  assert.match(css, /margin-left: calc\(var\(--hand-step/)
})

test('actual phones stay mobile with either browser UA and a 980px desktop-request viewport', () => {
  const desktopModePhone = {...iPhone,userAgent:desktopSafari,platform:'MacIntel'}
  for (const device of [iPhone,desktopModePhone]) {
    assert.equal(phonePresentation(980,1800,device),true)
    assert.equal(phonePresentation(1200,800,device),true)
  }
  assert.equal(phonePresentation(980,1800,iPad),false)
  assert.equal(phonePresentation(400,800,iPad),false)
})

test('phone top/bottom folds reserve rows, keep expand buttons mounted, and never change game data', () => {
  const folds = source('../src/arkham/mobile/MobileMapFold.vue')
  const css = source('../src/styles/mobileGame.css')
  assert.match(folds,/:aria-expanded="!collapsed"/)
  assert.match(folds,/board.topCollapsed.value = !board.topCollapsed.value/)
  assert.match(folds,/board.bottomCollapsed.value = !board.bottomCollapsed.value/)
  assert.doesNotMatch(folds,/fetch|axios|api\//)
  assert.match(css,/mobile-top-collapsed[^}]+--mobile-scenario-height: 0px/s)
  assert.match(css,/mobile-bottom-collapsed[^}]+--mobile-player-height: 0px/s)
  assert.match(css,/\.mobile-map-fold-row \{ position: static/)
  assert.doesNotMatch(css,/mobile-top-collapsed[^}]+mobile-map-fold-row/s)
})
