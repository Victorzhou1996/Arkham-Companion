import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileStyle } from '@vue/compiler-sfc'
const read = path => readFileSync(new URL(`../src/${path}`,import.meta.url),'utf8')

test('all original threat types and choice handlers stay in a single adaptive row',()=>{
  const {descriptor,errors}=parse(read('arkham/components/Player.vue'))
  assert.deepEqual(errors,[])
  const row=descriptor.template.content.match(/<AdaptiveHand v-if="threatCount > 0" desktop-only>([\s\S]*?)<\/AdaptiveHand>/)?.[1]
  assert.ok(row)
  for(const list of ['spawningEnemies','stories','engagedEnemies','visibleTreacheries','facedownThreatCards']) assert.ok(row.includes(` in ${list}`))
  assert.equal([...row.matchAll(/@choose="\$emit\('choose', \$event\)"/g)].length,4)
  assert.match(row,/class="adaptive-hand-row tabletop-threat-row"/)
  assert.doesNotMatch(row,/<Teleport|v-html|cloneNode/)
})

test('equipment spans both columns and threats occupy only the lower left',()=>{
  const css=read('styles/tabletop.css')
  assert.match(css,/\.in-play \{[^}]*grid-template-rows: var\(--tabletop-hand\) minmax\(0, 1fr\)/)
  assert.match(css,/\.tabletop-threats \{ grid-column: 1; grid-row: 2;/)
  assert.match(css,/\.tabletop-equipment \{ grid-column: 1 \/ -1; grid-row: 1;/)
  const controls=read('arkham/components/TabletopLayoutControls.vue')
  assert.match(controls,/case 'threat':[^\n]*lowerTop.value \+ lowerHeight.value \* p.hand \/ 100/)
  assert.match(controls,/case 'hand': return \{ left: `\$\{left\}px`/)
})

test('mobile threat wrapper is transparent; preview and keyboard handlers are desktop guarded',()=>{
  const source=read('arkham/components/AdaptiveHand.vue')
  const {descriptor}=parse(source)
  assert.match(source,/!props.desktopOnly \|\| desktop.value/)
  assert.match(source,/if \(!enabled.value \|\| !overlapping.value/)
  assert.match(source,/function onKey[\s\S]*?if \(!enabled.value\) return/)
  assert.match(source,/keyboardStops.forEach\(card => card.removeAttribute\('tabindex'\)\)/)
  const style=compileStyle({source:descriptor.styles[0].content,scoped:true,id:'data-v-test'})
  assert.deepEqual(style.errors,[])
  assert.match(style.code,/\.adaptive-hand--disabled[^}]*display: contents/)
})
