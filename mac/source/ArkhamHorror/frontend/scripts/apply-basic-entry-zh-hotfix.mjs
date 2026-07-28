import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = path.join(frontendRoot, 'dist')
const assetsRoot = path.join(distRoot, 'assets')

const sourceRuntime = path.join(frontendRoot, 'public', 'basic-entry-zh-runtime.js')
const sourceMap = path.join(frontendRoot, 'public', 'basic_entry_zh_map.min.json')
const distRuntime = path.join(distRoot, 'basic-entry-zh-runtime.js')
const distMap = path.join(distRoot, 'basic_entry_zh_map.min.json')
const distIndex = path.join(distRoot, 'index.html')
const hotfixVersion = 'cycle5zh-20260725-2'

fs.copyFileSync(sourceRuntime, distRuntime)
fs.copyFileSync(sourceMap, distMap)

let indexHtml = fs.readFileSync(distIndex, 'utf8')
if (!indexHtml.includes('/basic-entry-zh-runtime.js')) {
  indexHtml = indexHtml.replace(
    /(\s*<script type="module" crossorigin src="\/assets\/index-[^"]+\.js"><\/script>)/,
    '\n    <script src="/basic-entry-zh-runtime.js"></script>$1',
  )
}

const oldExpression =
  'case"BasicEntry":return O("p",{innerHTML:E(A.text.startsWith("$")?e(A.text.slice(1)):A.text)})'
const newExpression =
  'case"BasicEntry":{const g=A.text.startsWith("$")?e(A.text.slice(1)):A.text;return O("p",{innerHTML:E(globalThis.__translateBasicEntryZh?globalThis.__translateBasicEntryZh(g):g)})}'

const assetNames = fs.readdirSync(assetsRoot)
const candidates = assetNames
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(assetsRoot, name))
  .filter((file) => fs.readFileSync(file, 'utf8').includes(oldExpression))

let rendererFile
if (candidates.length === 0) {
  const alreadyPatched = assetNames
    .filter((name) => /^XpBreakdown-.*\.js$/.test(name) && !name.includes(hotfixVersion))
    .map((name) => path.join(assetsRoot, name))
    .filter((file) => fs.readFileSync(file, 'utf8').includes('__translateBasicEntryZh'))

  if (alreadyPatched.length !== 1) {
    throw new Error('Could not locate the compiled BasicEntry renderer')
  }
  rendererFile = alreadyPatched[0]
} else if (candidates.length === 1) {
  rendererFile = candidates[0]
  const source = fs.readFileSync(rendererFile, 'utf8')
  fs.writeFileSync(rendererFile, source.replace(oldExpression, newExpression))
  console.log(`patched ${path.relative(frontendRoot, rendererFile)}`)
} else {
  throw new Error(`Found ${candidates.length} compiled BasicEntry renderers; expected one`)
}

const rendererName = path.basename(rendererFile)
const versionedRendererName = rendererName.replace(/\.js$/, `-${hotfixVersion}.js`)
fs.copyFileSync(rendererFile, path.join(assetsRoot, versionedRendererName))

const importMap = [
  '    <script type="importmap" id="basic-entry-zh-importmap">',
  `      {"imports":{"/assets/${rendererName}":"/assets/${versionedRendererName}"}}`,
  '    </script>',
].join('\n')

indexHtml = indexHtml.replace(
  /\s*<script type="importmap" id="basic-entry-zh-importmap">[\s\S]*?<\/script>/,
  '',
)
indexHtml = indexHtml.replace(
  /(\s*<script type="module" crossorigin src="\/assets\/index-[^"]+\.js"><\/script>)/,
  `\n${importMap}$1`,
)
fs.writeFileSync(distIndex, indexHtml)

const entryCount = Object.keys(JSON.parse(fs.readFileSync(sourceMap, 'utf8'))).length
console.log(`mapped ${rendererName} to ${versionedRendererName}`)
console.log(`copied BasicEntry Chinese runtime and ${entryCount}-entry story map`)
