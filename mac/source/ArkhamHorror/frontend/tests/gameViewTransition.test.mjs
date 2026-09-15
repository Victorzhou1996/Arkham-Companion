import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const vue = readFileSync(new URL('../src/arkham/views/Game.vue', import.meta.url), 'utf8')
const functions = vue.slice(vue.indexOf('function entitiesMoved('), vue.indexOf('function scheduleApplyUpdate('))
const code = ts.transpile(functions, { target: ts.ScriptTarget.ES2022 })
const state = location => ({ investigators: { investigator: { placement: location } }, enemies: {}, question: { player: {} } })

function setup(document) {
  const context = vm.createContext({ document, game: { value: state('old') }, storyAnswerPending: { value: true }, nextTick: async () => {} })
  vm.runInContext(code, context)
  return context
}

test('game updates work without view transition support', async () => {
  const context = setup({})
  const next = state('new')
  context.applyGameUpdate(next, false)
  await new Promise(setImmediate)
  assert.equal(context.game.value, next)
  assert.equal(context.storyAnswerPending.value, false)
})

test('cancelled animations still apply game state exactly once', async () => {
  let applied = 0
  const context = setup({ startViewTransition(callback) {
    applied++
    void callback()
    return { ready: Promise.reject(new DOMException('Transition was aborted because of invalid state', 'InvalidStateError')) }
  } })
  context.applyGameUpdate(state('new'), true)
  await new Promise(setImmediate)
  assert.equal(applied, 1)
  assert.equal(context.game.value.investigators.investigator.placement, 'new')
  assert.equal(Object.keys(context.game.value.question).length, 0)
  assert.equal(context.storyAnswerPending.value, false)
})

test('unchanged placements do not start an animation', () => {
  const context = setup({ startViewTransition() { assert.fail('No movement to animate') } })
  const next = state('old')
  context.applyGameUpdate(next, false)
  assert.equal(context.game.value, next)
})
