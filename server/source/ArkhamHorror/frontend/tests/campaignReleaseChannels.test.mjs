import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const newCampaignPath = resolve('src/arkham/views/NewCampaign.vue')

test('Cycle 9 is stable and Cycle 10 is beta-only', () => {
  const source = readFileSync(newCampaignPath, 'utf8')

  assert.match(
    source,
    /campaign\.id === '10'[^\n]+alpha: false, beta: false, dev: false/,
  )
  assert.match(
    source,
    /campaign\.id === '11'[^\n]+alpha: false, beta: true, dev: false/,
  )
  assert.match(source, /gate\(campaignDefinitions\)/)
})
