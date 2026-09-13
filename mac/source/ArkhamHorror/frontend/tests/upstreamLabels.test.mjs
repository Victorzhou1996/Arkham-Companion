import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Untimely Transaction labels match the backend namespace in both locales', async () => {
  for (const language of ['en', 'zh']) {
    const cards = JSON.parse(await readFile(`src/locales/${language}/cards.json`, 'utf8'))
    assert.ok(cards.label.untimelyTransaction1.noOnePays)
    assert.ok(cards.label.untimelyTransaction1.playCard)
  }
})

test('Drowned City task failure text matches the current chaos token rules', async () => {
  for (const language of ['en', 'zh']) {
    const interludes = JSON.parse(await readFile(`src/locales/${language}/theDrownedCity/interludes.json`, 'utf8'))
    const tasks = interludes.returnToArkham.tasks
    assert.match(tasks.walkInFaith.failedEffect, /elderThing/)
    assert.match(tasks.walkInFaith.failedEffect, /autoFail/)
    assert.doesNotMatch(tasks.walkInFaith.failedEffect, /tablet/)
    assert.match(tasks.dreamsOfDestruction.failedEffect, /elderSign/)
    assert.doesNotMatch(tasks.dreamsOfDestruction.failedEffect, /autoFail/)
  }
})
