import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

test('external localized images and homebrew merge without losing existing aliases', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'arkham-digest-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const script = join(root, 'frontend/scripts/digest.cjs')
  const digest = join(root, 'frontend/src/digests/zh.json')
  const images = join(root, 'external-images')
  for (const dir of ['frontend/scripts', 'frontend/src/digests', 'external-images/cards',
    'external-images/tarot', 'external-images/homebrew/circus/cards']) {
    mkdirSync(join(root, dir), { recursive: true })
  }
  copyFileSync(resolve('scripts/digest.cjs'), script)
  for (const file of ['cards/01001.avif', 'cards/01002.avif', 'cards/ignored.txt',
    'tarot/01.jpg', 'homebrew/circus/cards/81019.avif']) {
    writeFileSync(join(images, file), '')
  }
  writeFileSync(digest, JSON.stringify(['cards/05188-5.avif', 'cards/01001.avif']))
  execFileSync(process.execPath, [script, 'zh', images, '--merge'])
  assert.deepEqual(JSON.parse(readFileSync(digest, 'utf8')), [
    'cards/05188-5.avif', 'cards/01001.avif', 'cards/01002.avif',
    'homebrew/circus/cards/81019.avif', 'tarot/01.jpg',
  ])
  execFileSync(process.execPath, [script, 'zh', images])
  assert.deepEqual(JSON.parse(readFileSync(digest, 'utf8')), [
    'cards/01001.avif', 'cards/01002.avif',
    'homebrew/circus/cards/81019.avif', 'tarot/01.jpg',
  ])
})
