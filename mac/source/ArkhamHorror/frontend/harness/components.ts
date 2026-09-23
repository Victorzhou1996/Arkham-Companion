// Development-only interaction fixtures. These are not game-state evidence
// and never enter the production Vite entry point or the released package.
import { createApp, h, ref } from 'vue'
import { createPinia } from 'pinia'
import AdaptiveHand from '../src/arkham/components/AdaptiveHand.vue'
import ActionExtras from '../src/arkham/components/ActionExtras.vue'
import ActionCount from '../src/arkham/components/ActionCount.vue'
import PoolItem from '../src/arkham/components/PoolItem.vue'
import DeckCount from '../src/arkham/components/DeckCount.vue'

createApp({ setup() {
  const selected = ref('尚未执行任何操作')
  const cardCount = ref(32)
  return () => h('main', { style: '--card-width:100px;--card-height:140px;--pool-token-width:40px;max-width:600px;background:#102c23;color:#eadab0;padding:24px;font:16px system-ui' }, [
    h('h1', {style:'font-size:18px'}, '前端组件隔离测试（非真实游戏）'),
    h('p', {role:'status'}, selected.value),
    h('p', ['普通行动 ', h(ActionCount, {count:1000000})]),
    h('section', {class:'deck-counter-fixture',style:'display:flex;gap:10px;flex-wrap:wrap'}, [49,150].flatMap(width=>[0,28,999,1000,1000000].map(count=>h('div', {style:`--card-width:${width}px;width:${width}px;border:1px solid #ad9455`, 'data-count':count}, [h(DeckCount,{count})])))),
    h('p', ['特殊行动 ', h(ActionExtras, {count:100}, {default:()=>Array.from({length:100}, (_,i)=>h('button', {onClick:()=>selected.value=`特殊行动 ${i+1}`}, `行动 ${i+1}`))})]),
    h('section', {class:'counter-fixture',style:'display:flex;flex-wrap:wrap;gap:10px;margin-block:16px'}, ['resource','clue','doom','health','sanity','chaos-tokens/ct-bless'].map(type=>h(PoolItem,{type,amount:1000000,class:type==='clue'?'clue--can-take':type==='resource'?'resource--can-take':'',onChoose:()=>selected.value=`计数 ${type}`}))),
    h('button', {onClick:()=>cardCount.value=5}, '五张手牌'),
    h('button', {onClick:()=>cardCount.value=32}, '三十二张手牌'),
    h('p', '已启用首次点按预览。首次点牌或按钮不应执行，第二次点同一张牌才执行。'),
    h(AdaptiveHand, {previewOnTap:true}, {default:()=>h('section', {class:'adaptive-hand-row'}, Array.from({length:cardCount.value}, (_,i)=>h('div', {key:i,style:'height:140px;box-sizing:border-box;border:1px solid #ad9455;background:#25463b',onClick:()=>selected.value=`出牌 ${i+1}`}, [
      h('span', `卡 ${i+1}`),
      h('button', {onClick:(event:MouseEvent)=>{event.stopPropagation();selected.value=`自动跳过 ${i+1}`}}, `跳过 ${i+1}`)
    ])))})
  ])
}}).use(createPinia()).mount('#component-tests')
