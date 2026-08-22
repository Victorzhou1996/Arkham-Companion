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

test('recognizes customizations that grant Fast play', async () => {
  const { supportsCustomizedFastPlay, supportsHandPlayTriggerMode } =
    await importTsModule(modulePath)
  const customizations = [[2, [2, []]]]

  assert.equal(supportsCustomizedFastPlay('c09100', customizations), true)
  assert.equal(
    supportsHandPlayTriggerMode(
      { type_code: 'event', real_text: 'Attach to your location.' },
      '09100',
      customizations,
    ),
    true,
  )
  assert.equal(supportsCustomizedFastPlay('09100', [[2, [1, []]]]), false)
})

test('collects proxy and attached abilities by controller and card code', async () => {
  const { triggerModeAbilitiesForCard } = await importTsModule(modulePath)
  const choices = [
    {
      tag: 'AbilityLabel',
      investigatorId: 'controller',
      ability: { cardCode: 'c03232', index: 1 },
    },
    {
      tag: 'AbilityLabel',
      investigatorId: 'owner',
      ability: { cardCode: '03232', index: 1 },
    },
    {
      tag: 'AbilityLabel',
      investigatorId: 'controller',
      ability: { cardCode: '07161', index: 1 },
    },
  ]

  assert.deepEqual(
    triggerModeAbilitiesForCard(choices, '03232', 'controller').map(({ index }) => index),
    [0],
  )
})

test('keeps same-code hand and in-play trigger modes on their own instances', async () => {
  const { triggerModeAbilitiesForCard } = await importTsModule(modulePath)
  const choices = [
    {
      tag: 'AbilityLabel',
      investigatorId: 'owner',
      ability: {
        cardCode: '09100',
        index: -1,
        source: { tag: 'EventSource', contents: 'hand-copy' },
      },
    },
    {
      tag: 'AbilityLabel',
      investigatorId: 'owner',
      ability: {
        cardCode: '09100',
        index: 1,
        source: { tag: 'EventSource', contents: 'in-play-copy' },
      },
    },
  ]

  const handAbilities = triggerModeAbilitiesForCard(
    choices,
    '09100',
    'owner',
    (choice) => choice.ability.source.contents === 'hand-copy',
  )

  assert.deepEqual(
    handAbilities.map(({ contents }) => contents.ability.index),
    [-1],
  )
})
