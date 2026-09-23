import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('every manifest portrait is bundled for offline and same-origin serving', async () => {
  const root = new URL('../', import.meta.url)
  const manifest = JSON.parse(await readFile(new URL('image-manifest.json', root), 'utf8'))
  const portraits = manifest['img/arkham/portraits']
  assert.ok(portraits?.length > 0, 'Portrait manifest must not be empty')
  for (const path of portraits) {
    assert.match(path, /^img\/arkham\/portraits\/[^/]+\.jpg$/)
    const bytes = await readFile(new URL(`public/${path}`, root))
    assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff', path)
  }
})

test('development serves portraits from public files instead of a backend proxy', async () => {
  const { default: config } = await import('../vite.config.js')
  for (const rule of Object.keys(config.server.proxy)) {
    assert.equal(new RegExp(rule).test('/img/arkham/portraits/03001.jpg'), false, rule)
  }
})
