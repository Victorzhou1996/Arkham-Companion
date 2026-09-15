// Layout/interaction fixture only; no API, user or game writes.
import { createApp, h, ref } from 'vue'
import EquipmentRowFit from '../src/arkham/components/EquipmentRowFit.vue'
import '../src/styles/index.css'
createApp({setup(){
  const height=ref(140),width=ref(500),attached=ref(true),status=ref('未操作')
  return()=>h('main',{style:'padding:20px;color:#e7d9ad;background:#0e291f;height:100vh'},[
    h('h1',{style:'font-size:18px'},'装备高度与附属内容隔离测试'),h('output',{role:'status'},status.value),
    h('div',{style:'display:flex;gap:8px;margin:12px 0'},[
      ...[70,140,260].map(n=>h('button',{onClick:()=>height.value=n},`${n}px 高度`)),
      ...[160,500,1000].map(n=>h('button',{onClick:()=>width.value=n},`${n}px 宽度`)),
      h('button',{onClick:()=>attached.value=!attached.value},'切换附属卡'),
    ]),
    h('section',{class:'equipment-host',style:`width:min(100%,${width.value}px);height:${height.value}px;display:flex;--card-width:100px;--card-height:140px;border:1px solid #a18e54`},[
      h(EquipmentRowFit,{}, {default:()=>Array.from({length:12},(_,i)=>h('div',{key:i,class:'test-equipment',style:'width:100px;display:flex;flex-direction:column'},[
        h('img',{class:'card',style:'width:100px;height:140px',src:'/img/arkham/cards/01024.avif'}),
        ...(attached.value&&i===0?[h('img',{class:'card attached',style:'width:100px;height:80px;object-fit:cover',src:'/img/arkham/cards/01164.avif'})]:[]),
        h('button',{onClick:()=>status.value=`装备 ${i+1} 原有操作`,style:'height:30px'},`计数 ${i+1}`),
      ]))})
    ])
  ])
}}).mount('#equipment-tests')
