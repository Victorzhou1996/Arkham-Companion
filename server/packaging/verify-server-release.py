#!/usr/bin/env python3
"""Read-only verification of the pinned Server artifacts before packaging/deployment."""
import argparse
import hashlib
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo-root', type=Path, default=Path(__file__).resolve().parents[2])
parser.add_argument('--allow-lfs-pointers', action='store_true', help='Metadata audit only; NOT sufficient for deployment')
args = parser.parse_args()
root = args.repo_root.resolve()
manifest = json.loads((root / 'server/release/RELEASE-MANIFEST.json').read_text())
assert manifest['profile'] == 'online' and manifest['onlineMode'] is True
seen = set()
pointers = 0
for entry in manifest['files']:
    rel = entry['path']
    file = root / rel
    assert rel not in seen and file.resolve().is_relative_to(root) and not file.is_symlink(), rel
    seen.add(rel)
    assert file.is_file(), f'Missing release file: {rel}'
    size = file.stat().st_size
    pointer = re.fullmatch(rb'version https://git-lfs.github.com/spec/v1\r?\noid sha256:([a-f0-9]{64})\r?\nsize (\d+)\r?\n?', file.read_bytes()) if size < 200 else None
    if pointer:
        assert args.allow_lfs_pointers, f'Run git lfs pull before deployment: {rel}'
        assert pointer[1].decode() == entry['sha256'] and int(pointer[2]) == entry['size'], rel
        pointers += 1
        continue
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''): digest.update(block)
    assert size == entry['size'] and digest.hexdigest() == entry['sha256'], f'Release hash/size mismatch: {rel}'
frontend = root / 'server/release/frontend-dist'
actual = {p.relative_to(root).as_posix() for p in frontend.rglob('*') if p.is_file()}
expected = {p for p in seen if p.startswith('server/release/frontend-dist/')}
assert actual == expected, 'Unexpected or missing frontend artifact; do not mix releases'
assert next(e['sha256'] for e in manifest['files'] if e['path'] == 'server/release/frontend-dist/index.html') == manifest['entrySha256']
print(json.dumps(dict(version=manifest['version'], checkedFiles=len(seen), frontendFiles=len(actual), lfsPointers=pointers, deployable=pointers == 0, allHashesMatch=True)))
