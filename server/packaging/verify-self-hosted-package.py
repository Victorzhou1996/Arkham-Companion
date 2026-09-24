#!/usr/bin/env python3
"""Read-only verification of a published standalone Linux tar.gz (no extraction)."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import tarfile

def digest(stream):
    h = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b''):
        h.update(block)
    return h.hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('metadata', type=Path, help='server/packages/<version>/PACKAGE.json')
    args = parser.parse_args()
    meta = json.loads(args.metadata.read_text(encoding='utf-8'))
    archive = args.metadata.parent / meta['file']
    assert archive.is_file(), 'Download the tar.gz using Git LFS first'
    assert archive.stat().st_size == meta['bytes'], 'Incorrect size or unhydrated Git LFS pointer'
    with archive.open('rb') as stream:
        assert digest(stream) == meta['sha256'], 'Archive SHA-256 mismatch'
    prefix = meta['file'].removesuffix('.tar.gz')
    hashes = {}
    modes = {}
    manifest = None
    checksums = None
    with tarfile.open(archive, 'r|gz') as tar:
        for entry in tar:
            name = PurePosixPath(entry.name)
            assert not name.is_absolute() and '..' not in name.parts and name.parts[0] == prefix, entry.name
            if entry.isdir():
                assert entry.mode == 0o755
                continue
            assert entry.isfile(), f'Unsupported archive member: {entry.name}'
            rel = str(name.relative_to(prefix))
            assert rel not in hashes, f'Duplicate path: {rel}'
            assert name.suffix.lower() not in {'.bat','.cmd','.ps1','.exe','.dll','.pem','.dump','.log','.pid','.aes'}
            assert not rel.startswith('game/data/') or rel == 'game/data/setup.sql'
            assert 'pgdata' not in name.parts and name.name not in {'server.env','ports.env','lan.env','local-runtime.json','runtime-info.json'}
            executable = name.suffix == '.sh' or rel.startswith(('game/bin/','game/pgsql/bin/'))
            assert entry.mode == (0o755 if executable else 0o644), rel
            stream = tar.extractfile(entry)
            if rel in {'FILES-SHA256.json','SHA256SUMS'}:
                data = stream.read()
                hashes[rel] = hashlib.sha256(data).hexdigest()
                if rel == 'FILES-SHA256.json': manifest = json.loads(data)
                else: checksums = data.decode('utf-8')
            else:
                hashes[rel] = digest(stream)
            modes[rel] = entry.mode
    assert manifest and checksums
    expected = {e['path']: e['sha256'] for e in manifest}
    assert len(expected) == len(manifest) == meta['payloadFiles']
    assert set(hashes) == set(expected) | {'FILES-SHA256.json','SHA256SUMS'}
    assert all(hashes[p] == h for p,h in expected.items())
    sums = dict((line.split('  ',1)[1],line.split('  ',1)[0]) for line in checksums.splitlines())
    assert sums == {p:h for p,h in hashes.items() if p != 'SHA256SUMS'}
    assert len(hashes) == meta['archivedFiles']
    assert hashes['game/bin/arkham-api'] == meta['backendSha256']
    assert sum(p.startswith('cards/') and p.endswith('.avif') for p in hashes) == meta['mainCardFaces']
    assert sum('/audio/bgm/' in p and p.endswith('.mp3') for p in hashes) == meta['musicFiles']
    assert not any(v in p for p in hashes for v in ('legacy-ui-20260826.3/','legacy-ui-20260918.1/','legacy-ui-20260918.2/'))
    print(json.dumps({'version':meta['version'],'bytes':meta['bytes'],'sha256':meta['sha256'],
                      'verifiedFiles':len(hashes),'fileModesVerified':True,'clean':True},indent=2))

if __name__ == '__main__':
    main()
