import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse, compileStyle} from '@vue/compiler-sfc'
const read = p => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
test('hand and generic card share unclipped multiple-ability controls', () => {
  for (const name of ['HandCard','Card']) {
    const source=read(`arkham/components/${name}.vue`)
    assert.match(source, /<CardAbilityControls/)
    assert.doesNotMatch(source, /<AbilityButton/)
    assert.match(source, /:frame="cardFrame"/)
  }
  assert.match(read('arkham/components/CardAbilityControls.vue'), /:ignore="controls \? \[controls\] : \[\]"/)
  assert.match(read('arkham/components/AbilitiesMenu.vue'), /ignore: \[frame, \.\.\.\(ignore \|\| \[\]\)\]/)
})
test('new desktop layout preserves phone branch and event-driven scene lift', () => {
  const game=read('arkham/views/Game.vue'), controls=read('arkham/components/EdgeTabletopControls.vue')
  assert.match(game, /'edge-tabletop': isActualScenarioView && !mobileEnabled/)
  assert.match(game, /<EdgeTabletopControls v-if="isActualScenarioView && !mobileEnabled"/)
  assert.match(controls, /event.pointerType === 'mouse'/)
  assert.match(read('arkham/sceneDrawer.ts'), /SCENE_EXPAND_DELAY = 650/)
  assert.match(read('arkham/sceneDrawer.ts'), /SCENE_LEAVE_DELAY = 900/)
  assert.match(read('arkham/previewPolicy.ts'), /PREVIEW_LEAVE_DELAY = 0/)
  assert.match(controls, /edge-scene-raised/)
  assert.match(controls, /setAttribute\('aria-expanded'/)
  assert.doesNotMatch(controls, /setInterval|requestAnimationFrame|MutationObserver/)
  assert.match(controls, /onBeforeUnmount/)
})
test('edge geometry has fixed equipment height and maintains account split controls', () => {
  const css=read('styles/edgeTabletop.css')
  assert.match(css, /equipment-fit \{ height: 100%/)
  assert.match(css, /grid-column: 3/)
  assert.match(css, /edge-scene-expanded/)
  assert.match(css, /\.adaptive-hand \{ padding: 30px/)
  assert.match(css, /--panel-investigator/)
  assert.match(css, /--panel-upper/)
  assert.match(css, /location-cards-container--fullscreen \{ position: fixed; inset: 0; width: 100vw; height: 100dvh/)
  assert.doesNotMatch(css, /\.tabletop-dividers \{ display: none/)
  assert.doesNotMatch(css, /animation:\s*(?!none)[\w-]+\s+\d|filter: blur/)
  assert.equal(compileStyle({source:css,filename:'edgeTabletop.css',id:'edge'}).errors.length,0)
})
test('light paper and dark choice surfaces have explicit paired text colors', () => {
  for (const name of ['PickSupplies','PickDestiny']) {
    const source=read(`arkham/components/${name}.vue`)
    assert.doesNotMatch(source, /#DCD6D0/i)
    assert.match(source, /background: var\(--surface-panel\);\s+color: var\(--text\)/)
  }
  assert.match(read('arkham/components/StoryEntry.vue'), /color: #252b24/)
  assert.match(read('styles/tokens.css'), /--surface-panel: #142f26/)
})
