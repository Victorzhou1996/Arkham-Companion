import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('default feature-page palette C pairs readable text with each surface', () => {
  const css = read('styles/pageSurfaces.css')
  const defaults = css.slice(css.indexOf('#app .site-workspace {'), css.indexOf("html[data-page-theme='paper']"))
  const tokens = Object.fromEntries([...defaults.matchAll(/--([\w-]+): (#[\da-f]{6});/g)].map(([, key, value]) => [key, value]))
  assert.equal(tokens['page-bg'], '#314940')
  assert.doesNotMatch(defaults, /#app :is\(\.tabletop-lobby/)
  const luminance = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
  for (const [bg, fg] of [['page-bg', 'page-text'], ['page-bg', 'page-muted'], ['page-panel', 'page-text'], ['page-raised', 'page-title'], ['panel-bg', 'panel-muted'], ['control-bg', 'control-text'], ['control-selected', 'control-text']]) {
    const a = luminance(tokens[bg]), b = luminance(tokens[fg])
    assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, `${bg}/${fg}`)
  }
})

test('donation preview stays on the page and reuses the original localized appeal', () => {
  const home = read('views/Home.vue')
  assert.match(home, /<button class="home-support-qr" type="button"/)
  assert.doesNotMatch(home, /<a class="home-support-qr"/)
  assert.match(home, /\$t\('home.supportBody'\)/)
  assert.match(home, /width="360" height="360"/)
  assert.match(home, /onClickOutside\(supportQrRef/)
  assert.match(home, /@keydown.esc.stop.prevent/)
})

test('home keeps light save surfaces and the original desktop harbor image', () => {
  const css = read('styles/pageSurfaces.css')
  const saves = css.match(/#app \.tabletop-lobby \.home :is\(\.game, \.box, \.load-game-panel\) \{([^}]+)\}/)[1]
  assert.match(saves, /--page-panel: #eeece3;/)
  assert.match(saves, /--page-title: #20382e;/)
  assert.match(saves, /--page-icon-filter: none;/)
  const archive = read('styles/archiveTheme.css')
  assert.doesNotMatch(archive.slice(0, archive.indexOf('@media')), /\.archive-hero::before/)
  assert.match(archive, /\.archive-hero h1 \{ color: #152e27;/)
})
