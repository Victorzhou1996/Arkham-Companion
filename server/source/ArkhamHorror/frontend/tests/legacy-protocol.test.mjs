import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const { patchLegacyProtocol, patchLegacyTokenArt } = createRequire(import.meta.url)('../scripts/legacy-protocol.cjs')
const original = fs.readFileSync(new URL('../../legacy-ui-v20260826.3/prepared/assets/api-BQ1BYW-_.js', import.meta.url), 'utf8')
function decodeToken(source, face) {
  const context = vm.createContext({ M: path => path, Tt() {}, he() {}, kt() {}, m: {} })
  vm.runInContext(source.slice(source.indexOf(';') + 1, source.lastIndexOf('export{')), context)
  context.face = face
  return vm.runInContext('O.decode({chaosTokenId:"test",chaosTokenFace:face})', context)
}
test('classic protocol accepts blood tokens without weakening validation', () => {
  assert.equal(decodeToken(original, 'BloodToken').isOk(), false)
  const patched = patchLegacyProtocol(original)
  for (const face of ['BloodToken', 'FrostToken', 'Zero']) assert.equal(decodeToken(patched, face).isOk(), true, face)
  assert.equal(decodeToken(patched, 5).isOk(), false)
  assert.equal(decodeToken(patched, 'invalid-token').isOk(), false)
  assert.throws(() => patchLegacyProtocol(patched), /Unknown legacy/)
})
test('both classic token picker and game log display the blood token art', () => {
  const original = fs.readFileSync(new URL('../../legacy-ui-v20260826.3/prepared/assets/GameLog-Cf4LRTFm.js', import.meta.url), 'utf8')
  const patched = patchLegacyTokenArt(original)
  assert.equal(patched.split('case"BloodToken":return imgsrc("ct_blood.png");').length, 3)
})

test('classic location shroud supports ValueX without accepting unknown game values', () => {
  const patched = patchLegacyProtocol(original)
  const context = vm.createContext({ M: path => path, Tt() {}, he() {}, kt() {}, m: {} })
  vm.runInContext(patched.slice(patched.indexOf(';') + 1, patched.lastIndexOf('export{')), context)
  assert.equal(vm.runInContext('Dn.decode({tag:"ValueX"}).isOk()', context), true)
  assert.equal(vm.runInContext('Dn.decode({tag:"ValueX"}).value.contents', context), 0)
  assert.equal(vm.runInContext('Dn.decode({tag:"Invalid"}).isOk()', context), false)
})
