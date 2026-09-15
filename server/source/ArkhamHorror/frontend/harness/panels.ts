// Explicit local fixture, not a live game, and not imported by production.
import { createApp, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import ScenarioCardFit from '../src/arkham/components/ScenarioCardFit.vue'
import ScenarioReferenceCards from '../src/arkham/components/ScenarioReferenceCards.vue'
import TabletopLayoutControls from '../src/arkham/components/TabletopLayoutControls.vue'
import '../src/styles/tabletop.css'

createApp({ setup() {
  const count = ref(4), references = ref(3), attached = ref(true)
  const source = (card: string) => `/img/arkham/cards/${card}.avif`
  return () => h('div', {id:'game',class:'tabletop-game'}, [
    h('div', {class:'tabletop-tools',style:'height:36px;display:flex;gap:8px'}, [
      h('strong', '隔离验证 · 非游戏'),
      ...[2,4,6,8].map(n=>h('button',{onClick:()=>count.value=n},`${n} 张场景与密谋`)),
      h('button',{onClick:()=>attached.value=!attached.value},'切换附属牌'),
      ...[1,3,8].map(n=>h('button',{onClick:()=>references.value=n},`${n} 张参考牌`)),
    ]),
    h('div',{class:'game-main'},[
      h(TabletopLayoutControls),
      h('div',{class:'game'},[
        h('div',{class:'scenario'},[
          h('div',{class:'phases'},'神话阶段 / 调查阶段 / 敌军阶段 / 补给阶段'),
          h('div',{class:'scenario-body'},[
            h('div',{class:'scenario-cards'},[
              h(ScenarioCardFit,{enabled:true},{default:()=>[
                h('div',{class:'scenario-decks'},Array.from({length:count.value},(_,i)=>h('div',{class:i%2?'act-container':'agenda-container',key:i},[
                  h('h3',{class:'tabletop-card-heading'},`${i%2?'场景':'密谋'} ${Math.floor(i/2)+1}`),
                  h('div',{class:i%2?'act-row':'agenda-main'},[
                    h('div',{class:i%2?'card-container':'agenda-card'},[h('img',{class:'card',src:source(i%2?'01108':'01105')})]),
                    ...(attached.value && i===0 ? [h('img',{class:'card',src:source('01024')})] : []),
                  ])
                ])))
              ]})
            ]),
            h('div',{class:'location-cards-container'},[
              h('div',{class:'scenario-guide scenario-guide--map'},[
                h('div',{class:'scenario-guide-main'},[h('div',{class:'scenario-guide-card-wrapper'},[
                  h('div',{class:'scenario-guide-card'},[
                    h(ScenarioReferenceCards,{cards:Array.from({length:references.value},(_,i)=>source(i%2?'01105':'01104')),enabled:true}),
                    h('button',{onClick:(e:MouseEvent)=>(e.currentTarget as HTMLElement).textContent='能力仍可操作'},'参考牌能力'),
                  ])
                ])])
              ])
            ]),
            h('div',{id:'player-zone'},[h('div',{class:'player-info'},[
              h('div',{class:'tabs-row'},'下方布局随分隔线调整'),
              h('div',{class:'tab'},[h('div',{class:'player-cards'},[
                h('div',{class:'in-play-row'},[h('div',{class:'in-play'},[
                  h('div',{class:'tabletop-threats'},'威胁区'),
                  h('div',{class:'tabletop-equipment'},[h('h3',{class:'tabletop-zone-title'},'装备'),h('div',{class:'tabletop-equipment-cards'},[h('img',{class:'card',style:'width:var(--card-width);height:var(--card-height)',src:source('01024')})])]),
                ])]),h('div',{class:'hand-area'},'手牌')
              ])])
            ])])
          ])
        ])
      ]),
      h('div',{id:'game-log-sidebar'},'日志 · 本页不读取账户或存档')
    ])
  ])
}}).use(createI18n({legacy:false,locale:'zh',messages:{zh:{}}})).mount('#panel-tests')
