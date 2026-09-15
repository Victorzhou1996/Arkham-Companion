import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computed, effectScope, nextTick, ref, watch } from 'vue'
import ts from 'typescript'

// Execute the production watcher and eligibility expression, not a test copy.
const component = readFileSync(new URL('../src/arkham/views/Game.vue', import.meta.url), 'utf8')
const script = component.match(/<script\b[^>]*\bsetup[^>]*>([\s\S]*?)<\/script>/)[1]
const ast = ts.createSourceFile('Game.ts', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const archiveWatch = ast.statements.find(node => ts.isExpressionStatement(node)
  && ts.isCallExpression(node.expression)
  && node.expression.expression.getText(ast) === 'watch'
  && node.expression.arguments[0]?.getText(ast) === 'gameOver').getText(ast)
const eligibility = ast.statements.flatMap(node => ts.isVariableStatement(node)
  ? [...node.declarationList.declarations] : [])
  .find(node => node.name.getText(ast) === 'canUseUndo').initializer.getText(ast)

function setup({ online = true, expert = false, ended = false, spectate = false, fetchStatus = async () => false } = {}) {
  const scope = effectScope()
  const gameOver = ref(ended)
  const archived = ref(false)
  const archiveChecking = ref(online)
  const isExpertMode = ref(expert)
  const canUseUndo = scope.run(() => new Function('computed', 'isExpertMode', 'onlineMode', 'archiveChecking', 'archived', `return ${eligibility}`)(computed, isExpertMode, online, archiveChecking, archived))
  scope.run(() => new Function('watch', 'gameOver', 'onlineMode', 'props', 'archiveChecking', 'archived', 'fetchArchiveStatus', archiveWatch)(watch, gameOver, online, { gameId: 'isolated-test-game', spectate }, archiveChecking, archived, fetchStatus))
  return { scope, gameOver, archived, archiveChecking, isExpertMode, canUseUndo }
}

test('online ongoing entry unlocks undo even when gameOver never changes', async t => {
  let calls = 0
  const state = setup({ fetchStatus: async () => { calls++; return false } })
  t.after(() => state.scope.stop())
  await nextTick()
  assert.equal(state.gameOver.value, false)
  assert.equal(state.archiveChecking.value, false)
  assert.equal(state.canUseUndo.value, true)
  assert.equal(calls, 0)
  // The same gate feeds mobile/tablet/desktop buttons and the U shortcut.
  assert.match(script, /if \(canUseUndo.value\) undo\(\)/)
  state.isExpertMode.value = true
  assert.equal(state.canUseUndo.value, false)
})

test('finished online entry checks archive status and keeps archived undo disabled', async t => {
  let resolve
  const state = setup({ ended: true, fetchStatus: () => new Promise(done => { resolve = done }) })
  t.after(() => state.scope.stop())
  assert.equal(state.archiveChecking.value, true)
  assert.equal(state.canUseUndo.value, false)
  resolve(true)
  await nextTick()
  assert.equal(state.archiveChecking.value, false)
  assert.equal(state.archived.value, true)
  assert.equal(state.canUseUndo.value, false)
})

test('unarchived and failed checks release the pending gate as before', async t => {
  for (const fetchStatus of [async () => false, async () => { throw new Error('offline') }]) {
    const state = setup({ ended: true, fetchStatus })
    t.after(() => state.scope.stop())
    await nextTick()
    assert.equal(state.archiveChecking.value, false)
    assert.equal(state.canUseUndo.value, true)
  }
})

test('local mode and spectator policy remain unchanged', async t => {
  for (const options of [{ online: false }, { ended: true, spectate: true }]) {
    const state = setup({ ...options, fetchStatus: () => assert.fail('must not query archive') })
    t.after(() => state.scope.stop())
    await nextTick()
    assert.equal(state.canUseUndo.value, true)
    state.isExpertMode.value = true
    assert.equal(state.canUseUndo.value, false)
  }
})
