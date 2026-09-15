import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = file => readFileSync(new URL(file, import.meta.url), 'utf8')
const css = source('../src/styles/mobileGame.css')

test('phone hints disable legacy paint loops and use a bounded transform-only rounded frame', () => {
  assert.doesNotMatch(css,/mobile-action-breathe|mobile-edge-breathe|animation:[^;]*infinite/)
  assert.match(css,/body:has\(#game.mobile-game\)[\s\S]*?\.tab--has-actions[\s\S]*?animation: none !important/)
  assert.match(css,/animation: mobile-action-frame-scale 1\.6s ease-in-out 3 !important/)
  const frames = css.slice(css.indexOf('@keyframes mobile-action-frame-scale'), css.indexOf('@media (prefers-reduced-motion: no-preference)', css.indexOf('@keyframes mobile-action-frame-scale')))
  assert.match(frames,/0%, 100% \{ transform: scale\(1\); \}/)
  assert.match(frames,/50% \{ transform: scale\(1\.04\); \}/)
  const scales = [...frames.matchAll(/scale\(([\d.]+)\)/g)].map(match => Number(match[1]))
  assert.ok(scales.every(scale => scale >= 1 && scale <= 1.05), 'only a slight outward pulse; never shrink inward')
  assert.doesNotMatch(frames,/box-shadow|filter|width|height|opacity/)
  assert.match(css,/border: 4px solid var\(--mobile-action\); border-radius: 10px/)
  assert.match(css,/pointer-events: none; background: none/)
  assert.match(css,/@media \(prefers-reduced-motion: no-preference\)[\s\S]*mobile-action-frame-scale/)
  assert.match(css,/\.draggable--minimized:has\(\[data-game-actionable=true\]\) > header/)
  assert.match(css,/body:has\(#game.mobile-game\) :is\(\.resource--can-take, \.resource--can-spend, \.health--can-interact, \.sanity--can-interact\) > img,[\s\S]*?animation: none !important/)
  assert.match(css,/:not\(\.card--flipping, \.card--flipping-diagonal\)/)
  assert.doesNotMatch(css,/inset 0 0 0 4px #fff3df/)
  assert.match(css,/outline: none; box-shadow: none !important/)
  assert.match(css,/border-color: transparent !important/)
  assert.match(css,/mobile-page-hidden[^\n]*animation-play-state: paused/)
  assert.match(css,/objective-ring::after \{ filter: none/)
})

test('landscape replaces inline desktop scenario grid and retains full card height and touch controls', () => {
  const landscape = css.slice(css.indexOf('@media (min-width: 700px) and (max-height: 600px)'))
  assert.match(landscape,/scenario-decks \{ display: flex !important; flex-direction: column/)
  assert.match(landscape,/\.card-container\) \{ height: auto/)
  assert.match(landscape,/clamp\(300px, 37vw, 370px\)/)
  assert.match(landscape,/\.tabs__header li \{ min-width: 0/)
  assert.match(landscape,/switch-investigators \{ flex: 0 0 44px/)
  assert.match(landscape,/zoom-btn \{ min-width: 44px/)
})

test('action aggregation shares one scan and unchanged marks do not trigger DOM writes', async () => {
  const js = ts.transpileModule(source('../src/arkham/mobile/actionHints.ts'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  const { enabledGameActions, markMobileActionCards, inspectMobileActions, GAME_ACTION_SELECTOR } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
  let scans=0,writes=0
  const attrs={}
  const card={getAttribute:k=>attrs[k]??null,hasAttribute:k=>k in attrs,setAttribute(k,v){attrs[k]=v;writes++},removeAttribute(k){delete attrs[k];writes++}}
  const action={matches:()=>false,closest:s=>s==='[data-mobile-card]'?card:null}
  const root={querySelectorAll:s=>s===GAME_ACTION_SELECTOR?(scans++,[action]):[card]}
  const actions=enabledGameActions(root)
  markMobileActionCards(root,actions)
  inspectMobileActions(root,actions)
  assert.equal(scans,1);assert.equal(writes,1)
  for(let i=0;i<20;i++)markMobileActionCards(root,actions)
  assert.equal(writes,1)
  markMobileActionCards(root,[]);markMobileActionCards(root,[])
  assert.equal(writes,2)
})

test('phone scanning coalesces updates, stops in background and omits cursor spotlight work', () => {
  const hints=source('../src/arkham/mobile/useMobileActionHints.ts')
  assert.match(hints,/timer !== undefined \|\| frame \|\| document.hidden/)
  assert.match(hints,/const actions = enabledGameActions\(root.value\)/)
  assert.match(hints,/inspectMobileActions\(root.value, actions\)/)
  assert.match(hints,/removeEventListener\('visibilitychange', visibility\)/)
  assert.match(source('../src/arkham/views/Game.vue'),/if \(mobileEnabled.value \|\| document.hidden\) return/)
})
