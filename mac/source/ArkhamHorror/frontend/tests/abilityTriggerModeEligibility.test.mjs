import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

async function importTsModule(path) {
  const source = await readFile(path, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

const modulePath = resolve('src/arkham/abilityTriggerModeEligibility.ts')

test('shows hand play modes for Fast events and assets', async () => {
  const { supportsHandPlayTriggerMode } = await importTsModule(modulePath)

  assert.equal(
    supportsHandPlayTriggerMode({
      type_code: 'event',
      real_text: 'Fast. Play when an enemy attacks.',
    }),
    true,
  )
  assert.equal(
    supportsHandPlayTriggerMode({
      type_code: 'asset',
      real_text: 'Investigator deck only.\nFast.\nYou get +1 [intellect].',
    }),
    true,
  )
})

test('hides hand play modes from ordinary cards and in-play abilities', async () => {
  const { supportsHandPlayTriggerMode } = await importTsModule(modulePath)

  assert.equal(
    supportsHandPlayTriggerMode({
      type_code: 'event',
      real_text: 'Gain 3 resources.',
    }),
    false,
  )
  assert.equal(
    supportsHandPlayTriggerMode({
      type_code: 'asset',
      real_text: '[fast] Spend 1 resource: You get +1 [combat] for this skill test.',
    }),
    false,
  )
  assert.equal(
    supportsHandPlayTriggerMode({
      type_code: 'skill',
      real_text: 'If this test succeeds, draw 1 card.',
    }),
    false,
  )
})

test('ignores stale saved modes that are no longer valid for a hand card', async () => {
  const { handTriggerModeIndexes } = await importTsModule(modulePath)

  assert.deepEqual(handTriggerModeIndexes([-1, 1, 2], [], false), [])
  assert.deepEqual(handTriggerModeIndexes([-1, 1, 2], [2], false), [2])
  assert.deepEqual(handTriggerModeIndexes([-1, 1, 2], [], true), [-1])
})
