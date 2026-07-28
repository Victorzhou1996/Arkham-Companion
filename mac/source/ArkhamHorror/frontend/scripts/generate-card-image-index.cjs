const fs = require('node:fs')
const path = require('node:path')

const [sourceDir, outputFile] = process.argv.slice(2)
if (!sourceDir || !outputFile) {
  throw new Error('Usage: node generate-card-image-index.cjs <card-dir> <output-json>')
}

const files = fs
  .readdirSync(sourceDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.avif'))
  .map((entry) => entry.name)
  .sort()

fs.mkdirSync(path.dirname(outputFile), { recursive: true })
fs.writeFileSync(outputFile, `${JSON.stringify(files)}\n`)
console.log(`Wrote ${files.length} card images to ${outputFile}`)
