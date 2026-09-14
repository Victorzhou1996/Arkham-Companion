import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileStyle } from '@vue/compiler-sfc'

test('special decks and victory display share one horizontal group without changing events', () => {
  const source = readFileSync(new URL('../src/arkham/components/Scenario.vue', import.meta.url), 'utf8')
  const { descriptor, errors } = parse(source)
  assert.equal(errors.length, 0)
  const groups = [...descriptor.template.content.matchAll(/<ScenarioPileRow>([\s\S]*?)<\/ScenarioPileRow>/g)]
  assert.equal(groups.length, 1)
  assert.match(groups[0][1], /<ScenarioDeck[\s\S]*?@choose="choose"[\s\S]*?@show="doShowCards"/)
  assert.match(groups[0][1], /<VictoryDisplay[^>]*@choose="choose"/)
  assert.doesNotMatch(groups[0][1], /<Agenda|<Act|<SkillTest|ScenarioReferenceCards/)
  assert.match(groups[0][1], /ref="scenarioReferenceSlot" class="scenario-reference-slot"/)
  assert.match(source, /<Teleport :to="scenarioReferenceSlot \|\| 'body'" :disabled="!tabletopDesktop \|\| !scenarioReferenceSlot"/)
  assert.match(source, /'scenario-guide--pile': tabletopDesktop/)
  assert.match(source, /:spent-keys="JSON.stringify\(spentKeys\)" :depth="currentDepth"/)
})
test('auxiliary rows wrap in desktop only and retain a transparent mobile wrapper', () => {
  const source = readFileSync(new URL('../src/arkham/components/ScenarioPileRow.vue', import.meta.url), 'utf8')
  assert.match(source, /display: contents/)
  assert.match(source, /@media \(min-width: 801px\)/)
  assert.match(source, /flex-flow: row wrap/)
  assert.match(source, /align-items: flex-start/)
  assert.match(source, /100cqw/)
  assert.match(source, /\(100cqw - 62px\) \/ 3/)
  const rowRules = source.match(/:global\(#game\.tabletop-game \.scenario-pile-row\) \{([^}]+)\}/)?.[1]
  assert.ok(rowRules)
  assert.doesNotMatch(rowRules, /overflow:\s*(hidden|clip)|position:\s*absolute/)
  const { descriptor } = parse(source)
  const { code, errors } = compileStyle({ source: descriptor.styles[0].content, id: 'data-v-test', scoped: true })
  assert.deepEqual(errors, [])
  assert.match(code, /#game\.tabletop-game \.scenario-pile-row:empty/)
  assert.doesNotMatch(code, /#game\.tabletop-game\s*\{/)
  assert.match(readFileSync(new URL('../src/arkham/components/ScenarioDeck.vue', import.meta.url),'utf8'), /\.deck-label \{\s*pointer-events: none/)
})
