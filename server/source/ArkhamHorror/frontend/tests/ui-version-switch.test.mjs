import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'
const script=fs.readFileSync(new URL('../public/ui-switch-v20260921.js',import.meta.url),'utf8')
function run(url,saved=null,blocked=false,source=script){
 const result={navigated:null,buttons:[],saved},storage={getItem(){if(blocked)throw Error('disabled');return result.saved},setItem(k,v){if(blocked)throw Error('disabled');result.saved=v}}
 const window={location:{href:url,get hash(){return new URL(this.href).hash},assign(v){result.navigated=v},replace(v){result.navigated=v}},history:{replaceState(state,title,v){window.location.href=v}},addEventListener(type,handler){result[type]=handler}}
 const document={documentElement:{dataset:{}},readyState:'complete',getElementById:()=>null,createElement:()=>({style:{}}),body:{appendChild(b){result.buttons.push(b)}}}
 vm.runInNewContext(source,{window,document,localStorage:storage,URL});return{result,window,document}
}
test('settings and games can explicitly switch both ways with a full reload',()=>{
 const game=run('https://example.test/?x=1#/games/fixture','current')
 game.window.arkhamSwitchUi('legacy');assert.equal(game.result.navigated,'https://example.test/legacy-ui-20260923.1/?x=1&ui=legacy#/games/fixture');assert.equal(game.result.saved,'legacy')
 const classic=run(game.result.navigated,'legacy')
 classic.window.arkhamSwitchUi('current');assert.equal(classic.result.navigated,'https://example.test/?x=1&ui=current#/games/fixture');assert.equal(classic.result.saved,'current')
 const {result,window}=run('https://example.test/?x=1#/settings','current')
 window.arkhamSwitchUi('legacy');assert.equal(result.navigated,'https://example.test/?x=1&ui=legacy#/settings');assert.equal(result.saved,'legacy')
 const settings=run(result.navigated,'legacy')
 settings.window.arkhamSwitchUi('current');assert.equal(settings.result.navigated,'https://example.test/?x=1&ui=current#/settings');assert.equal(settings.result.saved,'current')
})
test('invalid modes and unrelated routes cannot switch the interface',()=>{
 for(const mode of ['legacy','current','invalid']) {
  const other=run('https://example.test/#/decks','current');other.window.arkhamSwitchUi(mode);assert.equal(other.result.navigated,null);assert.equal(other.result.saved,'current')
 }
 const game=run('https://example.test/#/games/g','current');game.window.arkhamSwitchUi('invalid');assert.equal(game.result.navigated,null)
})
test('game switch preserves route and query even when preference storage is unavailable',()=>{
 const game=run('https://example.test/?x=1&ui=current#/games/g?view=log',null,true)
 game.window.arkhamSwitchUi('legacy');assert.equal(game.result.navigated,'https://example.test/legacy-ui-20260923.1/?x=1&ui=legacy#/games/g?view=log')
 const classic=run(game.result.navigated,null,true)
 classic.window.arkhamSwitchUi('current');assert.equal(classic.result.navigated,'https://example.test/?x=1&ui=current#/games/g?view=log')
})
test('saved choice beats stale links; blocked storage preserves mode in URL',()=>{
 const current=run('https://example.test/?ui=current#/games/g','legacy');assert.equal(current.result.navigated,'https://example.test/legacy-ui-20260923.1/?ui=legacy#/games/g');assert.equal(current.result.saved,'legacy')
 const legacy=run('https://example.test/legacy-ui-20260923.1/?ui=legacy#/games/g','current');assert.equal(legacy.result.navigated,'https://example.test/?ui=current#/games/g');assert.equal(legacy.result.saved,'current')
 const blocked=run('https://example.test/legacy-ui-20260923.1/?ui=legacy#/games/g',null,true)
 assert.equal(blocked.result.buttons.length,0);assert.equal(blocked.result.navigated,null)
 const settings=run('https://example.test/?ui=legacy#/settings',null,true)
 settings.window.arkhamSwitchUi('current');assert.equal(settings.result.navigated,'https://example.test/?ui=current#/settings')
})
test('ordinary root entry restores selected legacy UI without floating switches',()=>{
 assert.match(run('https://example.test/#/games/g','legacy').result.navigated,/legacy-ui-20260923.1/)
 assert.equal(run('https://example.test/').result.buttons.length,0)
 assert.equal(run('https://example.test/legacy-ui-20260923.1/','legacy').result.navigated,'https://example.test/?ui=legacy')
})
test('all feature pages share current catalog and gates while preserving classic preference',()=>{
 for(const route of ['/','/new-game','/settings','/decks','/cards','/achievements','/bugs','/about','/card-builder','/card-builder/marketplace']) {
  const shared=run(`https://example.test/?ui=legacy#${route}`,'legacy')
  assert.equal(shared.result.navigated,null,route)
  assert.equal(shared.document.documentElement.dataset.ui,'legacy-editor',route)
  const old=run(`https://example.test/legacy-ui-20260923.1/?x=1&ui=legacy#${route}`,'legacy')
  assert.equal(old.result.navigated,`https://example.test/?x=1&ui=legacy#${route}`,route)
 }
})
test('classic game navigation returns to shared pages, not frozen catalogs',()=>{
 const {result,window}=run('https://example.test/legacy-ui-20260923.1/?ui=legacy#/games/g','legacy')
 assert.equal(result.navigated,null)
 window.location.href='https://example.test/legacy-ui-20260923.1/?ui=legacy#/settings'
 result.hashchange()
 assert.equal(result.navigated,'https://example.test/?ui=legacy#/settings')
})
test('older bookmarks escape frozen catalogs without interrupting classic game routes',()=>{
 for(const [file,path] of [['v20260916','20260826.3'],['v20260918','20260918.1'],['v20260918b','20260918.2']]) {
  const source=fs.readFileSync(new URL(`../public/ui-switch-${file}.js`,import.meta.url),'utf8')
  const base=`https://example.test/legacy-ui-${path}/?ui=legacy`
  assert.equal(run(`${base}#/new-game`,'legacy',false,source).result.navigated,'https://example.test/?ui=legacy#/new-game')
  const game=run(`${base}#/games/g`,'legacy',false,source)
  assert.equal(game.result.navigated,'https://example.test/legacy-ui-20260923.1/?ui=legacy#/games/g')
  const canonical=run(game.result.navigated,'legacy')
  canonical.window.location.href='https://example.test/legacy-ui-20260923.1/?ui=legacy#/cards';canonical.result.hashchange()
  assert.equal(canonical.result.navigated,'https://example.test/?ui=legacy#/cards')
 }
})
test('dated legacy resources remain isolated and preload paths do not become protocol-relative',()=>{
 const base=new URL('../../legacy-ui-v20260826.3/',import.meta.url)
 const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',base),'utf8'))
 assert.equal(manifest.files.length,94)
 assert.equal(manifest.packageSha256,'b5359402930b2a2582bafb8e23e725b872978cedca80fccaef30b52936ffec9b')
 const entry=fs.readFileSync(new URL('prepared/index.html',base),'utf8')
 assert.match(entry,/src="\/legacy-ui-20260826.3\/assets\/index-BQrQvsth.js"/)
 const js=fs.readFileSync(new URL('prepared/assets/index-BQrQvsth.js',base),'utf8')
 assert.match(js,/"legacy-ui-20260826.3\/assets\/Home-/);assert.doesNotMatch(js,/\["\/legacy-ui/)
})
test('shared editor keeps classic preference and does not redirect in a loop',()=>{
 const {result,document}=run('https://example.test/?ui=legacy#/card-builder','legacy')
 assert.equal(result.navigated,null)
 assert.equal(result.saved,'legacy')
 assert.equal(document.documentElement.dataset.ui,'legacy-editor')
 const redirected=run('https://example.test/legacy-ui-20260923.1/?ui=legacy#/card-builder/marketplace','legacy')
 assert.equal(redirected.result.navigated,'https://example.test/?ui=legacy#/card-builder/marketplace')
})
