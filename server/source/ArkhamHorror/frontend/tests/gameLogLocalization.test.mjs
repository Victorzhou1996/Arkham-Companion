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

const modulePath = resolve('src/arkham/gameLogLocalization.ts')
const t = (key, params = {}) => ({
  'gameLog.played': '打出了',
  'gameLog.draws': '抽取了',
  'gameLog.chaosToken': '混乱标记',
  'gameLog.remember': `记住“${params.value}”`,
}[key] ?? key)

test('localizes fixed game log actions and known scenario text', async () => {
  const { buildKnownTranslations, translateGameLogText } = await importTsModule(modulePath)
  const known = buildKnownTranslations(
    { remembered: { distracted: 'Distracted the guards' } },
    { remembered: { distracted: '分散了守卫的注意力' } },
  )

  assert.equal(translateGameLogText(' played ', t, known), ' 打出了 ')
  assert.equal(
    translateGameLogText('Remember "distracted the guards"', t, known),
    '记住“分散了守卫的注意力”',
  )
})

test('ignores translations whose English source is empty', async () => {
  const { buildKnownTranslations, translateGameLogText } = await importTsModule(modulePath)
  const known = buildKnownTranslations(
    { tooltip: '' },
    { tooltip: '不应出现在日志中的文字' },
  )

  assert.equal(known.has(''), false)
  assert.equal(translateGameLogText('', t, known), '')
  assert.equal(translateGameLogText('   ', t, known), '   ')
})
