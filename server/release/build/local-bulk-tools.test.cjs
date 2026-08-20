const assert = require('node:assert/strict')

global.window = global
global.document = { readyState: 'loading', addEventListener() {} }
global.localStorage = { getItem() { return 'test-token' } }

require('./local-bulk-tools.js')

const tools = global.ArkhamLocalBulkTools
assert.ok(tools, 'bulk tool helpers should be exposed')

assert.deepEqual(
  tools.extractExternalUrls(`
    12345
    Arkham Build: https://arkham.build/deck/view/abc-def?foo=1，
    Duplicate https://arkham.build/deck/view/abc-def?foo=1
    Shared deck https://arkham.build/share/LCfRwHWV4taJzGO
    Published deck https://arkham.build/decklist/view/54321
    https://arkhamdb.com/decklist/view/9876
  `),
  [
    'https://api.arkham.build/v1/public/share/abc-def',
    'https://api.arkham.build/v1/public/share/LCfRwHWV4taJzGO',
    'https://arkham.build/decklist/view/54321',
    'https://arkhamdb.com/api/public/decklist/9876',
    'https://arkhamdb.com/api/public/decklist/12345',
  ],
)

const deck = {
  id: 'deck-1',
  name: 'Test deck',
  list: { investigator_code: '01001', slots: { '01002': 2, '01001': 1 } },
}
const fromBundle = tools.collectDecks({ format: 'arkham-horror-local-deck-bundle', decks: [deck] })
assert.equal(fromBundle.length, 1)
assert.equal(fromBundle[0].deckName, 'Test deck')
assert.equal(fromBundle[0].deckList.investigator_code, '01001')

const direct = tools.normalizeDeck({ investigator_code: '01001', name: 'Direct', slots: { '01001': 1 } })
assert.equal(direct.deckName, 'Direct')

const reordered = {
  id: 'deck-2',
  name: 'Test deck',
  list: { investigator_code: '01001', slots: { '01001': 1, '01002': 2 } },
}
assert.equal(tools.deckFingerprint(deck), tools.deckFingerprint(reordered))

console.log('local-bulk-tools tests passed')
