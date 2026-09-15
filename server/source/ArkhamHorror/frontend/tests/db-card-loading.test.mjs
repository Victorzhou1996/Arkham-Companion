import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
function fixture(fetch) {
  let now=1000
  const source=readFileSync(new URL('../src/stores/dbCards.ts',import.meta.url),'utf8')
    .replace(/^import .*$/gm,'').replace(/export /g,'').replaceAll('import.meta.env.BASE_URL',"'/base/'")
  const code=ts.transpileModule(source+'\n;useDbCardStore', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
  const store=vm.runInNewContext(code, {fetch,Date:{now:()=>now},localStorage:{getItem:()=> 'zh-CN'},
    defineStore:(_,options)=>Object.assign(options.state(),options.actions)})
  return {store,advance:()=>{now+=31000}}
}
test('card names use the app base, including nested routes, and empty successes do not reload',async()=>{
  const urls=[]
  const {store}=fixture(async url=>{urls.push(url);return {ok:true,json:async()=>[]}})
  await store.initDbCards()
  for(let i=0;i<100;i++) {store.getCardName('name');await store.initDbCards()}
  assert.deepEqual(urls,['/base/cards/cards_zh.json'])
  assert.equal(store.loadedLang,'zh')
})
test('failed card-name requests cannot form a render/request loop and can retry later',async()=>{
  let count=0
  const {store,advance}=fixture(async()=>{count++;return count===1?{ok:false,status:503}:{ok:true,json:async()=>[]}})
  await assert.rejects(store.initDbCards(),/503/)
  for(let i=0;i<100;i++) {store.getCardName('name');await store.initDbCards()}
  assert.equal(count,1)
  assert.equal(store.loadingLang,null)
  advance();await store.initDbCards();assert.equal(count,2)
})
test('malformed JSON shape does not poison the name index',async()=>{
  const {store}=fixture(async()=>({ok:true,json:async()=>({error:'missing'})}))
  await assert.rejects(store.initDbCards(),/Invalid card-name data/)
  assert.equal(store.dbCards.length,0)
  assert.equal(store.loadedLang,null)
})
