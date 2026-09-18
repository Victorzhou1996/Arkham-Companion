import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createServer } from 'vite'
import { createI18n } from 'vue-i18n'
import { baseCompile } from '@intlify/message-compiler'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const { patchCampaignMessages } = createRequire(import.meta.url)('../scripts/prepare-legacy-ui.cjs')

const root = fileURLToPath(new URL('../src/locales/', import.meta.url))
const campaigns = ['theDreamEaters', 'theFeastOfHemlockVale', 'theDrownedCity']

function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const name = join(path, entry.name)
    return entry.isDirectory() ? files(name) : name.endsWith('.json') ? [name] : []
  })
}

function leaves(value, path = '') {
  if (typeof value === 'string') return [[path, value]]
  return Object.entries(value ?? {}).flatMap(([key, entry]) =>
    leaves(entry, Array.isArray(value) ? `${path}[${key}]` : !/^\w+$/.test(key) ? `${path}['${key}']` : path ? `${path}.${key}` : key))
}

function params(text) {
  return [...text.replaceAll("{'{'}", '{').replaceAll("{'}'}", '}').matchAll(/\{([A-Za-z]\w*)\}/g)]
    .map(match => match[1]).sort()
}

function englishWords(text) {
  return (text.replace(/<[^>]*>/g, ' ').replace(/\{'\{'\}\w+\{'\}'\}|\{[^{}]*\}|@:[\w.]+|\$[\w.]+/g, '')
    .match(/[A-Za-z]{2,}/g) ?? []).filter(word => !/^[IVX]+$/.test(word))
}

test('cycles 5, 9 and 10 retain every source key, parameter, image and translated text', () => {
  const issues = []
  for (const campaign of campaigns) {
    for (const file of files(join(root, 'en', campaign))) {
      const zhFile = join(root, 'zh', relative(join(root, 'en'), file))
      const zh = Object.fromEntries(leaves(JSON.parse(readFileSync(zhFile, 'utf8'))))
      for (const [key, en] of leaves(JSON.parse(readFileSync(file, 'utf8')))) {
        const target = zh[key]
        const path = `${campaign}/${basename(file)}:${key}`
        if (typeof target !== 'string' || (en.trim() && !target.trim())) {
          issues.push(`${path}: missing translation`)
          continue
        }
        if (JSON.stringify(params(en)) !== JSON.stringify(params(target))) issues.push(`${path}: parameters differ`)
        if (englishWords(target).length) issues.push(`${path}: English: ${englishWords(target).join(', ')}`)
        const images = value => [...value.matchAll(/<img\b[^>]*\bsrc=['"]([^'"]+)['"]/g)].map(x => x[1]).sort()
        if (JSON.stringify(images(en)) !== JSON.stringify(images(target))) issues.push(`${path}: images differ`)
      }
    }
  }
  assert.deepEqual(issues, [])
})

test('all campaign entries compile and render through the real zh and zh-cn loader without fallback', async t => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom', logLevel: 'silent',
    server: { middlewareMode: true, hmr: false },
  })
  t.after(() => server.close())
  const { loadLocaleMessages } = await server.ssrLoadModule('/src/locales/messages.ts')
  const { formatContent } = await server.ssrLoadModule('/src/arkham/helpers.ts')
  const { messages: en } = await loadLocaleMessages('en')
  for (const language of ['zh', 'zh-cn']) {
    const { locale, messages } = await loadLocaleMessages(language)
    assert.equal(locale, 'zh')
    const historical = { theDreamEaters: { historicalOnly: 'kept' }, otherCampaign: { title: 'kept' } }
    const patched = patchCampaignMessages(`const old=${JSON.stringify(historical)};export{old as default};`, messages)
    const sandbox = {}
    vm.runInNewContext(patched.replace('export{old as default};', 'globalThis.result=old;'), sandbox)
    assert.equal(sandbox.result.theDreamEaters.historicalOnly, 'kept')
    assert.equal(sandbox.result.otherCampaign.title, 'kept')
    for (const campaign of campaigns) {
      const legacy = Object.fromEntries(leaves(sandbox.result[campaign]))
      for (const [key, value] of leaves(messages[campaign])) assert.equal(legacy[key], value, `legacy:${key}`)
    }
    const missing = []
    const translator = createI18n({ legacy: false, locale, fallbackLocale: false, warnHtmlMessage: false,
      missing: (_locale, key) => { missing.push(key); return key }, messages: { [locale]: messages } }).global.t
    const issues = []
    for (const campaign of campaigns) {
      const translated = Object.fromEntries(leaves(messages[campaign], campaign))
      for (const [path, source] of leaves(en[campaign], campaign)) {
        const text = translated[path]
        if (typeof text !== 'string') { issues.push(`${path}: absent from loaded locale`); continue }
        baseCompile(text, { onError: error => issues.push(`${path}: compile: ${error.message}`) })
        const values = Object.fromEntries(params(text).map(name => [name, 7]))
        Object.assign(values, { imgPath: '/img/arkham', setImgPath: '/img/arkham/encounter-sets', token: 'skull' })
        const rendered = formatContent(translator(path, values))
        if (source && !rendered.trim()) issues.push(`${path}: empty render`)
        if (rendered.includes("{'{'}") || rendered.includes('@:')) issues.push(`${path}: unresolved syntax`)
        if (englishWords(rendered).length) issues.push(`${path}: rendered English: ${englishWords(rendered).join(', ')}`)
      }
    }
    assert.deepEqual(issues, [], language)
    assert.deepEqual(missing, [], `${language} references missing keys`)
  }
})
