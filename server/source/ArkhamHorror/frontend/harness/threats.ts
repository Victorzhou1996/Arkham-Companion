// Synthetic UI only: callbacks record choices, never send game messages.
import { createApp, h, ref } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { RouterLink, createRouter, createMemoryHistory } from 'vue-router'
import FloatingVue from 'floating-vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import '../src/styles/index.css'
import '../src/styles/tabletop.css'
import '../src/styles/tabletopInteraction.css'
import 'floating-vue/dist/style.css'
import AdaptiveHand from '../src/arkham/components/AdaptiveHand.vue'
import EnemyView from '../src/arkham/components/Enemy.vue'
import { useCardStore } from '../src/stores/cards'
import type { Enemy } from '../src/arkham/types/Enemy'
import type { Game } from '../src/arkham/types/Game'

function enemy(i: number): Enemy {
  return { id:`enemy-${i}`,cardId:`card-${i}`,cardCode:i%2?'c01118':'c01116',assignedDamage:0,tokens:{Damage:i},exhausted:i===1,
    engagedInvestigators:['tester'],treacheries:[],assets:[],skills:[],events:[],stories:[],scarletKeys:[],asSelfLocation:null,
    sealedChaosTokens:[],placement:{tag:'InThreatArea',contents:'tester'},keys:[],modifiers:[],fight:{tag:'Fixed',contents:2},
    evade:{tag:'Fixed',contents:3},healthDamage:1,sanityDamage:1,health:{tag:'Fixed',contents:20},meta:null,flipped:false,
    cardsUnderneath:[],referenceCards:i===0?['c01164']:[] }
}
const enemies = Array.from({length:18},(_,i)=>enemy(i))
const game = {id:'isolated-enemy-fixture',question:{tester:{tag:'ChooseOne',choices:enemies.flatMap(e=>[{tag:'FightLabel',enemyId:e.id},{tag:'EvadeLabel',enemyId:e.id}])}},
  enemies:Object.fromEntries(enemies.map(e=>[e.id,e])),stories:{},assets:{},locations:{},investigators:{},treacheries:{},cards:{},modifiers:[],highlightedCards:[],enemyAttackTargets:[],phase:'InvestigationPhase'} as unknown as Game
createApp({setup(){
  useCardStore().loaded=true
  const count=ref(18), width=ref(420), preview=ref(false), status=ref('尚未执行操作')
  return ()=>h('main',{style:'padding:24px;background:#102c23;min-height:100vh;color:#eadab0'},[
    h('h1',{style:'font-size:18px'},'实际敌人组件 · 不连接游戏存档'),
    h('output',{role:'status'},status.value),
    h('div',{style:'display:flex;gap:8px;margin-block:12px'},[
      ...[1,3,18].map(n=>h('button',{onClick:()=>count.value=n},`${n} 个敌人`)),
      ...[180,420,900].map(n=>h('button',{onClick:()=>width.value=n},`${n}px 威胁区`)),
      h('button',{onClick:()=>preview.value=!preview.value,'aria-pressed':preview.value},'模拟首次点按预览'),
    ]),
    h('section',{class:'enemy-test-area',style:`width:min(100%,${width.value}px);height:380px;--card-width:100px;--card-height:140px;border:1px solid #9a884a`},[
      h(AdaptiveHand,{desktopOnly:true,previewOnTap:preview.value,style:'height:100%'},{default:()=>h('div',{class:'adaptive-hand-row tabletop-threat-row'},enemies.slice(0,count.value).map(e=>h(EnemyView,{key:e.id,game,enemy:e,playerId:'tester',onChoose:(i:number)=>status.value=`敌人原始操作 ${i}`})))})
    ])
  ])
}}).use(createPinia()).use(FloatingVue).use(createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{render:()=>null}}]})).component('RouterLink',RouterLink).component('font-awesome-icon',FontAwesomeIcon).use(createI18n({legacy:false,locale:'zh',missingWarn:false,fallbackWarn:false,messages:{zh:{label:{fight:'攻击',evade:'躲避'}}}})).mount('#threat-tests')
