import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync, readdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {parse, compileStyle} from '@vue/compiler-sfc'
import {compileString} from 'sass-embedded'
const src=fileURLToPath(new URL('../src/', import.meta.url))
const read=p=>readFileSync(join(src,p),'utf8')

test('game neutral surfaces are green at root, including teleported dialogs',()=>{
  const css=read('styles/tokens.css')
  assert.match(css,/:root\s*\{/)
  for(const token of ['background','background-dark','background-mid','box-background','surface-input','surface-raised','surface-hover']) {
    const hex=css.match(new RegExp(`--${token}: #(\\w{6});`))?.[1]
    assert.ok(hex,token)
    const [r,g,b]=hex.match(/../g).map(x=>parseInt(x,16))
    assert.ok(g>r && g>b,token)
  }
  assert.match(css,/--app-background:.*tabletop-felt-20260914-v2\.png/)
  assert.match(read('styles/tabletopHome.css'),/body, #app\s*\{/)
})
test('choose-deck, campaign continuation, settings and story use the shared texture',()=>{
  for(const name of ['ChooseDeck','ContinueCampaign','Settings','ScenarioDebug','StoryQuestion']) {
    assert.match(read(`arkham/components/${name}.vue`),/background: var\(--app-background\)/,name)
  }
})
test('neutral dialog migration preserves semantic colors and adds no perpetual effects',()=>{
  const css=read('styles/tokens.css')
  for(const declaration of ['--guardian: #5cb4fd','--mystic: #ba81f2','--survivor: #ee4a53','--health: #ae4236','--sanity: #2c7fc0','--select: #ff00ff']) assert.ok(css.includes(declaration))
  assert.doesNotMatch(read('styles/tabletopHome.css'),/@keyframes|animation:|backdrop-filter:|background-attachment: fixed/)
  assert.match(read('arkham/components/debug/CustomCardForm.vue'),/background: var\(--surface-input\) var\(--select-caret\) no-repeat/)
})
test('separate Build application still has its own document entry',()=>{
  assert.match(read('components/NavBar.vue'),/const buildHref = .*\/build\//)
  assert.match(read('components/NavBar.vue'),/:href="buildHref"/)
  assert.doesNotMatch(read('styles/tabletopHome.css'),/iframe|\/build\/.*\{/)
})
test('all migrated Vue surface styles compile and leave no old blue panel literals',()=>{
  let checked=0
  function visit(dir) {
    for(const f of readdirSync(dir,{withFileTypes:true})) {
      const p=join(dir,f.name)
      if(f.isDirectory()) visit(p)
      else if(f.name.endsWith('.vue')) {
        const text=readFileSync(p,'utf8')
        const {descriptor}=parse(text)
        for(const style of descriptor.styles) {
          assert.doesNotMatch(style.content,/background(?:-color)?:\s*#(?:15192c|1e2030|1a1a2e|111827|26283b)\b/i,p)
          if(!/var\(--(?:surface-|app-background|box-background)/.test(style.content)) continue
          const css=style.lang==='scss' ? compileString(style.content,{silenceDeprecations:['legacy-js-api']}).css : style.content
          assert.deepEqual(compileStyle({source:css,filename:p,id:'data-v-theme',scoped:style.scoped}).errors,[],p)
          checked++
        }
      }
    }
  }
  visit(src)
  assert.ok(checked>=30)
})
