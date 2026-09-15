// Actual game components, with synthetic cards and no game/network writes.
import { createApp, h, ref } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import FloatingVue from 'floating-vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import 'floating-vue/dist/style.css'
import '../src/styles/tabletop.css'
import ScenarioCardFit from '../src/arkham/components/ScenarioCardFit.vue'
import ScenarioPileRow from '../src/arkham/components/ScenarioPileRow.vue'
import ScenarioReferenceCards from '../src/arkham/components/ScenarioReferenceCards.vue'
import ScenarioDeck from '../src/arkham/components/ScenarioDeck.vue'
import VictoryDisplay from '../src/arkham/components/VictoryDisplay.vue'
import { useCardStore } from '../src/stores/cards'
import type { Game } from '../src/arkham/types/Game'
import type { Card } from '../src/arkham/types/Card'

const fixtureCard = (id: string, code: string): Card => ({ tag:'EncounterCard', contents:{ tag:'CardContents', id, cardCode:code, tokens:[] } })
const cards = [fixtureCard('fixture-a','c01116'), fixtureCard('fixture-b','c01118'), fixtureCard('fixture-c','c01119')]
const game = { id:'isolated-pile-fixture', question:{tester:{tag:'ChooseOne', choices:[{tag:'TargetLabel',target:{tag:'ScenarioDeckTarget',contents:'MonstersDeck'},messages:[]}]}}, investigators:{}, enemies:{}, assets:{}, treacheries:{}, locations:{}, skills:{}, modifiers:[], highlightedCards:[] } as unknown as Game
createApp({ setup() {
  useCardStore().loaded = true
  const width = ref(250), multiple = ref(false), empty = ref(false), references = ref(1), status = ref('尚未操作')
  return () => h('div',{id:'game',class:'tabletop-game'},[
    h('div',{class:'tabletop-tools',style:'display:flex;gap:10px;min-height:40px;flex-wrap:wrap'},[
      h('strong','真实组件隔离测试'),
      ...[120,180,250,420].map(n=>h('button',{onClick:()=>width.value=n},`${n}px 左栏`)),
      h('button',{onClick:()=>multiple.value=!multiple.value},'切换多个牌堆'),
      h('button',{onClick:()=>empty.value=!empty.value},'切换空胜利区'),
      h('button',{onClick:()=>references.value=references.value===1?3:1},'切换多张参考牌'),
      h('output',{role:'status'},status.value)
    ]),
    h('div',{class:'scenario-cards',style:`width:${width.value}px;height:600px;flex:none`},[
      h(ScenarioCardFit,{enabled:true},{default:()=>[
        h(ScenarioPileRow,{}, {default:()=>[
          h(ScenarioDeck,{game,playerId:'tester',deck:['MonstersDeck',cards],onChoose:(i:number)=>status.value=`特殊牌堆选择 ${i}`}),
          ...(multiple.value?[h(ScenarioDeck,{game,playerId:'tester',deck:['CthulhuDeck',cards],discardPile:[cards[0]]}),h(ScenarioDeck,{game,playerId:'tester',deck:['CultistDeck',cards]})]:[]),
          h(VictoryDisplay,{game,playerId:'tester',victoryDisplay:empty.value?[]:cards.slice(0,2)}),
          h('div',{class:'scenario-reference-slot'},[
            h('div',{class:'scenario-guide scenario-guide--pile'},[
              h('div',{class:'scenario-guide-main'},[h('div',{class:'scenario-guide-card-wrapper'},[h('div',{class:'scenario-guide-card'},[
                h(ScenarioReferenceCards,{enabled:true,cards:Array.from({length:references.value},(_,i)=>`/img/arkham/cards/${i?'01105':'01104'}.avif`)}),
                h('button',{onClick:()=>status.value='参考牌原有能力'},'能力')
              ])])])
            ])
          ])
        ]})
      ]})
    ])
  ])
}}).use(createPinia()).use(FloatingVue).component('font-awesome-icon',FontAwesomeIcon).use(createI18n({legacy:false,locale:'zh',messages:{zh:{scenario:{victoryDisplay:'胜利区'},scenarioDeck:{showCards:'查看牌堆'}}}})).mount('#pile-tests')
