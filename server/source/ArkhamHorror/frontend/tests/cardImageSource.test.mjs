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

const modulePath = resolve('src/arkham/cardImageSource.ts')
const server = 'https://arkham.example/img/arkham/zh/cards/01001.avif'
const original = 'https://arkham.example/img/arkham/cards/01001.avif'
const cdn = 'https://cards.example'
const companion = 'https://localhost:8688'

test('uses companion, then CDN, then the server for Chinese AVIF cards', async () => {
  const { cardImageSource } = await importTsModule(modulePath)
  globalThis.window = { location: { origin: 'https://arkham.example' } }

  const result = cardImageSource('cards/01001.avif', server, companion, cdn, 'zh', original)
  const companionUrl = new URL(result)
  const cdnUrl = new URL(companionUrl.searchParams.get('fallback'))
  const serverUrl = new URL(cdnUrl.searchParams.get('fallback'))

  assert.equal(companionUrl.origin, companion)
  assert.equal(companionUrl.pathname, '/img/arkham/zh/cards/01001.avif')
  assert.equal(cdnUrl.origin, cdn)
  assert.equal(cdnUrl.pathname, '/img/arkham/zh/cards/01001.avif')
  assert.equal(serverUrl.origin, 'https://arkham.example')
  assert.equal(serverUrl.pathname, '/img/arkham/zh/cards/01001.avif')
  assert.equal(serverUrl.searchParams.get('fallback'), original)
  delete globalThis.window
})

test('uses CDN directly when companion is unavailable', async () => {
  const { cardImageSource } = await importTsModule(modulePath)
  const result = new URL(cardImageSource('cards/01001.avif', server, '', cdn, 'zh', original))

  assert.equal(result.origin, cdn)
  const serverResult = new URL(result.searchParams.get('fallback'))
  assert.equal(serverResult.pathname, '/img/arkham/zh/cards/01001.avif')
  assert.equal(serverResult.searchParams.get('fallback'), original)
})

test('keeps server URLs for English and non-card images', async () => {
  const { cardImageSource } = await importTsModule(modulePath)

  assert.equal(cardImageSource('cards/01001.avif', server, companion, cdn, 'en'), server)
  assert.equal(cardImageSource('portraits/01001.jpg', server, companion, cdn, 'zh'), server)
})
