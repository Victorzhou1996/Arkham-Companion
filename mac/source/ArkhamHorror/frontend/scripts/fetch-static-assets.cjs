const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'image-manifest.json'), 'utf8'));
  // Card libraries have separate Chinese aliases and must never be overwritten here.
  const files = [...new Set(Object.values(manifest).flat())].filter(file =>
    !file.split('/').some(part => part.startsWith('.')) &&
    !file.includes('/cards/') && !file.includes('/custom/') &&
    !/^img\/arkham\/(es|fr|ita?|ko|ja|pl|po)\//.test(file));
  let downloaded = 0;
  const failures = [];
  for (const file of files) {
    const target = path.resolve(publicDir, file);
    if (!target.startsWith(publicDir + path.sep)) throw new Error('Unsafe manifest path');
    if (await fs.stat(target).then(s => s.isFile() && s.size > 0, () => false)) continue;
    try {
      const url = 'https://assets.arkhamhorror.app/' + file.split('/').map(encodeURIComponent).join('/');
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
        throw new Error(`HTTP ${response.status}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('Unexpected image size');
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target + '.tmp', bytes);
      await fs.rename(target + '.tmp', target);
      downloaded++;
    } catch (error) {
      failures.push(`${file}: ${error.message}`);
      await fs.rm(target + '.tmp', { force: true });
    }
  }
  console.log(`Static assets: ${files.length} checked, ${downloaded} downloaded, ${failures.length} failed`);
  if (failures.length) throw new Error(failures.join('\n'));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
