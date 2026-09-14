import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileStyle } from '@vue/compiler-sfc'
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url),'utf8')
test('equipment fits all content height and only scrolls horizontally',()=>{
  const source=read('arkham/components/EquipmentRowFit.vue')
  assert.match(source,/row.value.scrollHeight/)
  assert.match(source,/Math.ceil\(parseFloat\(style.height\)/)
  assert.match(source,/const scale = Math.min\(1, available \/ height\)/)
  assert.match(source,/overflow-x: auto; overflow-y: hidden/)
  assert.match(source,/childList: true, subtree: true/)
  const {descriptor,errors}=parse(source)
  assert.deepEqual(errors,[])
  assert.deepEqual(compileStyle({source:descriptor.styles[0].content,id:'data-v-test',scoped:true}).errors,[])
  assert.match(source,/\.equipment-fit, \.equipment-fit-track, \.equipment-fit-row \{ display: contents/)
})
test('equipment wrapper preserves original card entities and callbacks',()=>{
  const source=read('arkham/components/Player.vue')
  const row=source.match(/<EquipmentRowFit class="tabletop-equipment-cards">([\s\S]*?)<\/EquipmentRowFit>/)?.[1]
  assert.ok(row)
  for(const node of ['Asset','Treachery','EventView','Skill','ScarletKey']) assert.ok(row.includes(`<${node}`))
  for(const loop of ['tarotCards','currentTreacheries','skills','events','investigator.scarletKeys','pendingAssets','visibleAssets','emptySlots']) assert.ok(row.includes(` in ${loop}`))
  assert.match(row,/@choose="\$emit\('choose', \$event\)"/)
  assert.doesNotMatch(row,/<Teleport|v-html|cloneNode/)
})
test('homepage theme is route-scoped and reuses the existing tabletop texture',()=>{
  const css=read('styles/tabletopHome.css')
  assert.match(css,/#app:has\(\.tabletop-lobby, \.tabletop-login\)/)
  assert.match(css,/tabletop-felt-20260914-v2.png/)
  assert.doesNotMatch(css,/--guardian:|--survivor:|--select:/)
  assert.match(read('views/Home.vue'),/class="page-container tabletop-lobby"/)
  assert.match(read('views/SignIn.vue'),/class="tabletop-login" @submit.prevent="authenticate"/)
})
