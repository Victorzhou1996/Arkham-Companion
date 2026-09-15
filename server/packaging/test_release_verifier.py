"""Isolated release-integrity checks; no game or repository state is changed."""
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

VERIFY = Path(__file__).with_name('verify-server-release.py')

class ReleaseVerifierTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='arkham-release-check-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.index = self.root / 'server/release/frontend-dist/index.html'
        self.index.parent.mkdir(parents=True)
        self.index.write_bytes(b'<html>isolated fixture</html>')
        digest = hashlib.sha256(self.index.read_bytes()).hexdigest()
        self.manifest = {'version':'fixture', 'profile':'online', 'onlineMode':True, 'entrySha256':digest,
                         'files':[{'path':self.index.relative_to(self.root).as_posix(), 'sha256':digest, 'size':self.index.stat().st_size}]}
        self.save()

    def save(self):
        (self.root / 'server/release/RELEASE-MANIFEST.json').write_text(json.dumps(self.manifest))

    def check(self, ok, *args):
        result = subprocess.run([sys.executable, str(VERIFY), '--repo-root', str(self.root), *args], capture_output=True, text=True)
        self.assertEqual(result.returncode == 0, ok, result.stdout + result.stderr)
        return result

    def test_matching_release(self): self.check(True)

    def test_changed_entry_is_rejected(self):
        self.index.write_bytes(b'old version')
        self.check(False)

    def test_extra_old_asset_is_rejected(self):
        self.index.with_name('obsolete.js').write_bytes(b'old chunk')
        self.check(False)

    def test_missing_entry_is_rejected(self):
        self.index.unlink()
        self.check(False)

    def test_lfs_pointer_never_passes_deployment_check(self):
        binary = self.root / 'server/release/bin/arkham-api'
        binary.parent.mkdir()
        data = b'isolated binary fixture'
        digest = hashlib.sha256(data).hexdigest()
        binary.write_text(f'version https://git-lfs.github.com/spec/v1\noid sha256:{digest}\nsize {len(data)}\n')
        self.manifest['files'].append({'path':binary.relative_to(self.root).as_posix(), 'sha256':digest, 'size':len(data)})
        self.save()
        self.check(False)
        report = json.loads(self.check(True, '--allow-lfs-pointers').stdout)
        self.assertFalse(report['deployable'])
        binary.write_bytes(data)
        self.check(True)

if __name__ == '__main__': unittest.main()
