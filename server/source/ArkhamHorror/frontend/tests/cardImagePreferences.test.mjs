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

test('reads card codes from base and localized image paths', async () => {
  const { CARD_HOVER_ZOOM_DEFAULT, cardCodeFromImagePath, cardHoverScale } = await importTsModule(
    resolve('src/cardImagePreferences.ts'),
  )

  assert.equal(cardCodeFromImagePath('/v2/img/arkham/cards/01001.avif'), '01001')
  assert.equal(cardCodeFromImagePath('/v2/img/arkham/zh/cards/01001b.avif'), '01001b')
  assert.equal(CARD_HOVER_ZOOM_DEFAULT, 40)
  assert.equal(cardHoverScale(40), 1.4)
})
