import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'
const script=fs.readFileSync(new URL('../public/ui-switch-v20260916.js',import.meta.url),'utf8')
function run(url,saved=null,blocked=false){
 const result={navigated:null,buttons:[],saved},storage={getItem(){if(blocked)throw Error('disabled');return result.saved},setItem(k,v){if(blocked)throw Error('disabled');result.saved=v}}
 const window={location:{href:url,assign(v){result.navigated=v}}}
 const document={readyState:'complete',getElementById:()=>null,createElement:()=>({style:{}}),body:{appendChild(b){result.buttons.push(b)}}}
 vm.runInNewContext(script,{window,document,localStorage:storage,URL});return{result,window}
}
test('legacy switch preserves current game hash and query without touching saves',()=>{
 const {result,window}=run('https://example.test/?x=1#/games/fixture')
 window.arkhamSwitchUi('legacy');assert.equal(result.navigated,'https://example.test/legacy-ui-20260826.3/?x=1&ui=legacy#/games/fixture');assert.equal(result.saved,'legacy')
})
test('explicit current recovery beats stale legacy preference and blocked storage',()=>{
 const current=run('https://example.test/?ui=current#/games/g','legacy');assert.equal(current.result.navigated,null)
 const blocked=run('https://example.test/legacy-ui-20260826.3/?ui=legacy#/games/g',null,true)
 assert.equal(blocked.result.buttons.length,1);blocked.result.buttons[0].onclick();assert.equal(blocked.result.navigated,'https://example.test/?ui=current#/games/g')
})
test('ordinary root entry restores selected legacy UI; only legacy gets floating return',()=>{
 assert.match(run('https://example.test/#/games/g','legacy').result.navigated,/legacy-ui-20260826.3/)
 assert.equal(run('https://example.test/').result.buttons.length,0)
 assert.equal(run('https://example.test/legacy-ui-20260826.3/','legacy').result.buttons.length,1)
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
