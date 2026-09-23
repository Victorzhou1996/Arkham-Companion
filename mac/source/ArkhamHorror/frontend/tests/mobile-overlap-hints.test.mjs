import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const css = readFileSync(new URL('../src/styles/mobileGame.css', import.meta.url), 'utf8')

test('phone cards and full-size hints overlap as one layer, including non-actionable cards', () => {
  assert.match(css, /#game\.mobile-game \.adaptive-hand \.adaptive-hand-row > \* \{ isolation: isolate; \}/)
  assert.doesNotMatch(css, /\.adaptive-hand--overlap[^{}]*::after\s*\{/)
  assert.doesNotMatch(css, /width:\s*max\(0px,\s*calc\(var\(--hand-step\)/)
  const layer = css.match(/#game\.mobile-game \.adaptive-hand \.adaptive-hand-row > \* \{([^}]+)\}/)?.[1]
  assert.doesNotMatch(layer, /width|overflow|pointer-events|animation|transition|transform|z-index/)
})

test('mobile action frame resets inherited leader-badge geometry', () => {
  const rule = css.match(/\.card-frame-inner:not\(\.blocked--selectable\):has\(> img.location--can-interact\)\)::after \{([^}]+)\}/)?.[1]
  assert.ok(rule)
  for (const value of ['width: auto', 'height: auto', 'margin: 0', 'pointer-events: none', 'border-radius: 10px', 'border: 4px']) assert.ok(rule.includes(value), value)
})
