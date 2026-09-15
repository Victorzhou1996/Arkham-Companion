import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

test('local-only preference requests use the account cache without HTTP', async () => {
  const source = readFileSync(new URL('../src/arkham/composables/useAccountPanels.ts', import.meta.url), 'utf8')
  const request = source.slice(source.indexOf('const request = async'), source.indexOf('    session = accountPanelPreferences'))
    .replaceAll("import.meta.env.VITE_LOCAL_LAYOUT_ONLY", "'true'")
  const js = ts.transpileModule(request, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const fn = new Function('localStorage', 'key', 'fetch', `${js}; return request`)(
    { getItem: key => JSON.stringify({ panels: { left: key === 'account-a' ? 27 : 18 } }) },
    'account-a', () => { throw Error('Unexpected HTTP request') })
  assert.deepEqual(await fn(), { left: 27 })
  assert.deepEqual(await fn({ left: 27 }, true), { left: 27 })
})

test('disabled Companion detection returns before probing any port', async () => {
  const source = readFileSync(new URL('../src/stores/site_settings.ts', import.meta.url), 'utf8')
  const detect = source.slice(source.indexOf('async function detectCompanion'), source.indexOf('export const useSiteSettingsStore'))
    .replaceAll('import.meta.env.VITE_DISABLE_COMPANION', "'true'")
  const js = ts.transpileModule(detect, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const fn = new Function('fetch', `${js}; return detectCompanion`)(() => { throw Error('Unexpected probe') })
  assert.equal(await fn(), '')
})
