import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = file => readFileSync(new URL(file, import.meta.url), 'utf8')
const compiled = ts.transpileModule(source('../src/arkham/undoShortcut.ts'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {undoShortcut,allowsUndoInput} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
test('plain U and Caps Lock U undo once; only intentional Shift+U arms a chord', () => {
  assert.equal(undoShortcut({key:'u',code:'KeyU'}),'undo')
  assert.equal(undoShortcut({key:'U',code:'KeyU'}),'undo')
  assert.equal(undoShortcut({key:'U',code:'KeyU',shiftKey:true}),'chord')
  assert.equal(undoShortcut({key:'u',code:'KeyU',shiftKey:true}),'chord')
  assert.equal(undoShortcut({key:'г',code:'KeyU'}),'undo')
  assert.equal(undoShortcut({key:'U'}),'undo')
  assert.equal(undoShortcut({key:'a',code:'KeyA'}),null)
})
test('typing, IME, browser shortcuts and key auto-repeat never undo', () => {
  for (const flag of ['ctrlKey','metaKey','altKey','repeat','isComposing']) assert.equal(undoShortcut({key:'u',code:'KeyU',[flag]:true}),null)
  for (const type of ['text','password','email','number','search','date']) assert.equal(allowsUndoInput(type),false)
  for (const type of ['range','checkbox','radio']) assert.equal(allowsUndoInput(type),true)
})
test('focused divider only consumes its handled navigation keys, not U', () => {
  const divider = source('../src/arkham/components/TabletopLayoutControls.vue')
  assert.doesNotMatch(divider,/@keydown\.stop/)
  assert.match(divider,/else return\s+event.preventDefault\(\)\s+event.stopPropagation\(\)/)
})
test('phone undo is a direct visible action using the same guarded game command', () => {
  const header = source('../src/arkham/mobile/MobileGameHeader.vue')
  assert.match(header,/inject\(tabletopUndoKey, null\)/)
  assert.match(header,/v-if="undo\?\.enabled.value"/)
  assert.match(header,/:disabled="undo.locked.value" @click="undo.run\(\)"/)
  const game = source('../src/arkham/views/Game.vue')
  assert.match(game,/provide\(tabletopUndoKey, \{ enabled: canUseUndo, locked: undoLock, run: undo \}\)/)
  assert.match(game,/if \(!canUseUndo.value \|\| undoLock.value\) return/)
  assert.match(game,/touch-undo:not\(\.touch-undo--tablet\)/)
  assert.match(game,/toast.error\('撤回失败/)
})
