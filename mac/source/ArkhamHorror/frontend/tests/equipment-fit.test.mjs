import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileStyle } from '@vue/compiler-sfc'
import vm from 'node:vm'
import ts from 'typescript'
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url),'utf8')

// Run the real setup controller with deterministic observer/frame adapters.
// Updating dimensions simulates Vue re-rendering the equipment slot, which
// notifies the childList observer again: this used to run forever at idle.
function fitController({phone = false, visible = true} = {}) {
  const { descriptor } = parse(read('arkham/components/EquipmentRowFit.vue'))
  const script = descriptor.scriptSetup.content.replace(/^import .*$/gm, '')
  const code = ts.transpileModule(script + '\n;({measure, dimensions, viewport, row})', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  let mutation, id = 0, writes = 0, controller
  const frames = new Map()
  const ctx = {
    ref: initial => { let value = initial; return { get value(){return value}, set value(next){value = next; if (controller && this === controller.dimensions) { writes++; mutation() } } } },
    computed: get => ({ get value(){ return get() } }),
    useMediaQuery: () => ({value:true}), TABLETOP_MEDIA_QUERY: '',
    useMobileBoard: () => ({enabled:{value:phone},tablet:{value:false}}),
    useResizeObserver: () => {}, useMutationObserver: (_, fn) => {mutation=fn},
    watch: () => {}, onBeforeUnmount: () => {},
    requestAnimationFrame: fn => {frames.set(++id,fn);return id},
    cancelAnimationFrame: key => frames.delete(key),
    getComputedStyle: () => ({height:'160px',width:'800px'}),
  }
  controller = vm.runInNewContext(code, ctx)
  controller.viewport.value = {offsetHeight:134,getClientRects:()=>visible?[{}]:[]}
  controller.row.value = {offsetHeight:160,scrollHeight:160,offsetWidth:800,scrollWidth:800}
  return { ...controller, frames, writes:()=>writes, flush(){
    let count=0
    while(frames.size && count < 20) { const [key,fn]=frames.entries().next().value; frames.delete(key);fn();count++ }
    return count
  } }
}

test('equipment observer/render feedback converges and unchanged measurements stop writing', () => {
  const fit = fitController()
  fit.measure()
  assert.equal(fit.flush(), 2)
  assert.equal(fit.frames.size, 0)
  assert.equal(fit.writes(), 1)
  for(let i=0;i<100;i++) fit.measure()
  assert.equal(fit.frames.size, 1)
  assert.equal(fit.flush(), 1)
  assert.equal(fit.writes(), 1)
  fit.row.value.scrollWidth=900
  fit.measure();fit.flush()
  assert.equal(fit.writes(), 2)
  assert.equal(fit.dimensions.value.width, 675)
})

test('phone and hidden equipment panels do not repaint or keep idle frames alive', () => {
  const phone=fitController({phone:true})
  phone.measure();assert.equal(phone.frames.size,0)
  const hidden=fitController({visible:false})
  hidden.measure();assert.equal(hidden.flush(),1);assert.equal(hidden.writes(),0)
})
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
test('homepage shares game-app surfaces while keeping its own decoration',()=>{
  const css=read('styles/tabletopHome.css')
  assert.match(css,/body, #app/)
  assert.match(css,/background: var\(--app-background\)/)
  assert.match(read('styles/tokens.css'),/tabletop-felt-20260914-v2.png/)
  assert.doesNotMatch(css,/--guardian:|--survivor:|--select:/)
  assert.match(read('views/Home.vue'),/class="page-container tabletop-lobby site-workspace"/)
  assert.match(read('views/SignIn.vue'),/class="tabletop-login" @submit.prevent="authenticate"/)
})
