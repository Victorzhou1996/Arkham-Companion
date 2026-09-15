import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import vm from 'node:vm'
const read = name => readFileSync(new URL(`../src/arkham/components/${name}.vue`, import.meta.url), 'utf8')
const ref = value => ({value})
const computed = get => ({ get value() { return get() } })
function setup(name, context, exports) {
  const script = parse(read(name)).descriptor.scriptSetup.content.replace(/^import .*$/gm, '')
  return vm.runInNewContext(ts.transpileModule(script + `\n;({${exports}})`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, {ref,computed,...context})
}
test('single ability is one click; multiple opens a menu; no ability never sends -1', () => {
  const props = {abilities:[]}; const choices = []
  const c = setup('CardAbilityControls', {defineProps:()=>props,defineEmits:()=> (...args)=>choices.push(args),useMobileBoard:()=>null,inject:()=>null,mobileCardKey:0,useI18n:()=>({locale:ref('zh')}),defineExpose:()=>{}}, 'activate,shown')
  c.activate(); assert.equal(choices.length,0)
  props.abilities=[{index:7}];c.activate();assert.deepEqual(choices,[['choose',7]])
  props.abilities.push({index:9});c.activate();assert.equal(c.shown.value,true);assert.equal(choices.length,1)
})
test('touch ability entry previews instead of sending a gameplay choice', () => {
  let opened=0, chosen=0
  const c=setup('CardAbilityControls',{defineProps:()=>({abilities:[{index:4}]}),defineEmits:()=>()=>chosen++,useMobileBoard:()=>({touchEnabled:ref(true)}),inject:()=>({open:()=>opened++}),mobileCardKey:0,useI18n:()=>({locale:ref('zh')}),defineExpose:()=>{}},'activate')
  c.activate();assert.equal(opened,1);assert.equal(chosen,0)
})
test('forced choices never become optional trigger modes; optional modes retain ownership and cycle', async () => {
  const sent=[]
  const props={game:{id:'test',investigators:{i:{id:'i',playerId:'p',settings:{perCardSettings:{}}}}},investigatorId:'i',playerId:'p',cardCode:'08131',abilities:[]}
  const c=setup('AbilityTriggerModeToggle',{defineProps:()=>props,useI18n:()=>({t:key=>key}),useDebug:()=>({send:async(...args)=>sent.push(args)}),normalizeCardCode: code=>code.replace(/^c/,'').toLowerCase(),MessageType:{ABILITY_LABEL:'AbilityLabel'}},'abilityIndexes,cycleMode')
  props.abilities=[{contents:{tag:'AbilityLabel',investigatorId:'i',ability:{cardCode:'08131',index:1,type:{tag:'ForcedAbility'}}}}]
  assert.equal(c.abilityIndexes.value.length,0)
  props.abilities[0].contents.ability.type={tag:'ReactionAbility'}
  assert.equal(c.abilityIndexes.value[0],1)
  await c.cycleMode(1)
  assert.equal(sent[0][1].contents[2].value['1'],'AbilityAutoSkip')
  props.playerId='other';assert.equal(c.abilityIndexes.value.length,0)
  await c.cycleMode(1);assert.equal(sent.length,1)
})
test('treachery/event/skill controls stay on cards, not below clipped rows', () => {
  for(const name of ['Treachery','Event','Skill']) {
    const source=read(name)
    assert.match(source,/<CardAbilityControls/)
    assert.doesNotMatch(source,/<AbilityButton/)
    assert.match(source,/abilityControls/)
  }
  assert.match(read('CardAbilityControls'),/position: absolute; bottom: 3px/)
  assert.match(read('AbilityTriggerModeToggle'),/24px \/ var\(--equipment-control-scale, 1\)/)
  assert.match(read('EquipmentRowFit'),/'--equipment-control-scale': Math.max\(0.35, dimensions.scale\)/)
})
test('fresh owned assets show known modes with no live choices, while hand/foreign cards do not', () => {
  const props={game:{investigators:{i:{id:'i',playerId:'p',settings:{perCardSettings:{}}}}},investigatorId:'i',playerId:'p',cardCode:'03014',abilities:[],knownAbilityIndexes:[1]}
  const c=setup('AbilityTriggerModeToggle',{defineProps:()=>props,useI18n:()=>({t:key=>key}),useDebug:()=>({}),MessageType:{ABILITY_LABEL:'AbilityLabel'},handTriggerModeIndexes:()=>[],normalizeCardCode:code=>code.replace(/^c/,'')},'abilityIndexes')
  assert.equal(c.abilityIndexes.value.join(','),'1')
  props.currentAbilitiesOnly=true; assert.equal(c.abilityIndexes.value.length,0)
  props.currentAbilitiesOnly=false;props.playerId='spectator';assert.equal(c.abilityIndexes.value.length,0)
  props.playerId='p';props.abilities=[{contents:{tag:'AbilityLabel',investigatorId:'i',ability:{cardCode:'c03014',index:1,type:{tag:'FastAbility'}}}}]
  assert.equal(c.abilityIndexes.value.join(','),'1')
})
test('ability menu fallback removes anchor positioning and constrains both axes', () => {
  const source=read('AbilitiesMenu')
  assert.match(source,/anchored: useAnchor/)
  assert.doesNotMatch(source,/anchored: supportsAnchor/)
  assert.match(source,/delete positionStyle.bottom/)
  assert.match(source,/delete positionStyle.right/)
  assert.match(source,/max-height: calc\(100dvh - 16px\)/)
})
