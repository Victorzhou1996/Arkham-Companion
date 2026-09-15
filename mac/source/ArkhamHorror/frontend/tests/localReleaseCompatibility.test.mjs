import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

test('local release data remains compatible with upstream additions', async (t) => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false },
  })
  t.after(() => server.close())
  const decks = await server.ssrLoadModule('/src/arkham/types/Deck.ts')
  const helpers = await server.ssrLoadModule('/src/arkham/helpers.ts')
  const original = {
    id: 'local-deck', name: 'Prebuilt Mark', url: null, investigatorName: 'Mark Harrigan',
    list: {
      investigator_code: 'c03001', slots: { '01000': 1 },
      meta: JSON.stringify({ arkham_horror_campaign_status: 'completed', physical_trauma: 2 }),
    },
  }

  await t.test('old decks retain completion and trauma metadata without new fields', async () => {
    const decoded = await decks.deckDecoder.decodePromise(original)
    assert.equal(decks.campaignDeckStatus(decoded), 'completed')
    assert.equal(JSON.parse(decoded.list.meta).physical_trauma, 2)
    assert.equal(decoded.investigatorName, 'Mark Harrigan')
    assert.equal(decks.deckInvestigator(decoded), '03001')
    assert.equal(decks.deckPlayList(decoded), decoded.list)
  })

  await t.test('upstream overlays do not replace stored completion metadata', async () => {
    const decoded = await decks.deckDecoder.decodePromise({
      ...original,
      playList: { investigator_code: 'c01004', slots: { '01071': 2 }, meta: '{"alternate_front":"90017"}' },
      overlay: { investigator: 'c01004', swaps: {}, add: { '01071': 2 }, remove: {} },
      lastUsedAt: '2026-09-13T00:00:00Z',
    })
    assert.equal(decks.deckInvestigator(decoded), '90017')
    assert.equal(decks.campaignDeckStatus(decoded), 'completed')
    assert.deepEqual(decoded.list.slots, original.list.slots)
    assert.deepEqual(decks.deckPlayList(decoded).slots, { '01071': 2 })
    assert.equal(decks.deckMetaAlternateFront({ alternate_front: '90017' }), '90017')
    assert.equal(decks.deckMetaAlternateFront('invalid'), null)
  })

  await t.test('recent sorting is additive and does not mutate the supplied list', () => {
    const entries = [original, { ...original, id: 'recent', lastUsedAt: '2026-09-13T00:00:00Z' }]
    assert.deepEqual(decks.sortDecks(entries, 'recent').map(d => d.id), ['recent', 'local-deck'])
    assert.equal(entries[0].id, 'local-deck')
  })

  await t.test('homebrew paths and printed taboo faces keep their exact identity', () => {
    assert.equal(helpers.cardImgPath('05188-5'), 'cards/05188-5.avif')
    assert.equal(helpers.cardImgPath('11691ab'), 'cards/11691ab.avif')
    assert.equal(helpers.cardImgPath(':circus-ex-mortis:001b'), 'homebrew/circus-ex-mortis/cards/001b.avif')
  })

  await t.test('Chinese regional locale recognizes both full and relative image paths', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true, value: { getItem: () => 'zh-CN' },
    })
    try {
      await helpers.checkImageExists('zh-CN')
      assert.equal(helpers.isLocalized('cards/01001.avif'), true)
      assert.equal(helpers.isLocalized('https://local.example/img/arkham/zh/cards/01001.avif?v=1'), true)
      assert.equal(helpers.isLocalized('cards/nonexistent-release-test.avif'), false)
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
      else delete globalThis.localStorage
    }
  })

  await t.test('shared icon vocabulary retains existing symbols and adds literals', () => {
    const text = helpers.formatContent('{fast}{reaction}{elderThing}{runeA}{asterisk}{underscore}')
    assert.match(text, /fast-icon/)
    assert.match(text, /reaction-icon/)
    assert.match(text, /elder-thing-icon/)
    assert.match(text, /rune-A/)
    assert.ok(text.endsWith('*_'))
  })
})
