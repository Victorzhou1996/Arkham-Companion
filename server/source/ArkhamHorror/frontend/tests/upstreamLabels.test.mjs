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
