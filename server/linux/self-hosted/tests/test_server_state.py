"""Isolated tests of server secret/backup safeguards; never touch installed state."""
from pathlib import Path
import os
import subprocess
import sys
import tarfile
import tempfile
import unittest

HELPER = Path(__file__).resolve().parent.parent / 'tools/server-state.py'

class ServerStateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='arkham-server-unit-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = self.root / 'state'
        (self.state / 'secrets').mkdir(parents=True)

    def call(self, command, *args, ok=True):
        result = subprocess.run([sys.executable, str(HELPER), command, str(self.state), *map(str,args)], capture_output=True, text=True)
        self.assertEqual(result.returncode == 0, ok, result.stdout + result.stderr)
        return result

    def cluster(self):
        for name in ('base', 'pg_wal'):
            (self.state / 'pgdata' / name).mkdir(parents=True)
        for name in ('PG_VERSION', 'global/pg_control', 'postgresql.conf', 'pg_hba.conf'):
            file = self.state / 'pgdata' / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text('16' if name == 'PG_VERSION' else 'test')

    def test_secrets_private_and_stable(self):
        self.call('init')
        before = {p.name: p.read_bytes() for p in (self.state / 'secrets').iterdir()}
        self.call('init')
        self.assertEqual(before, {p.name: p.read_bytes() for p in (self.state / 'secrets').iterdir()})
        self.assertEqual({k: len(v) for k,v in before.items()}, {'jwt-secret':96, 'pg-password':64, 'client_session_key.aes':96})
        for p in (self.state / 'secrets').iterdir(): self.assertEqual(p.stat().st_mode & 0o777, 0o600)

    def test_existing_database_requires_original_secrets(self):
        self.cluster()
        self.call('init', ok=False)
        self.assertFalse(list((self.state / 'secrets').iterdir()))

    def test_invalid_database_never_deleted(self):
        (self.state / 'pgdata').mkdir()
        (self.state / 'pgdata/precious').write_text('keep')
        self.call('init', ok=False)
        self.assertEqual((self.state / 'pgdata/precious').read_text(), 'keep')

    def test_incomplete_database_refused(self):
        self.call('init')
        (self.state / 'pgdata').mkdir()
        (self.state / 'pgdata/PG_VERSION').write_text('16')
        self.call('init', ok=False)

    def test_force_restore_refused(self):
        (self.state / 'backups').mkdir()
        (self.state / 'backups/force_init.dump').write_text('keep')
        self.call('init', ok=False)

    def test_bad_secret_length_refused(self):
        (self.state / 'secrets/jwt-secret').write_text('bad')
        self.call('init', ok=False)

    def test_backup_includes_state_not_runtime(self):
        self.call('init')
        self.cluster()
        for name in ('tabletop-layout.sqlite3', 'custom-card-art/a.jpg', 'backups/latest.dump', 'run/nginx.log'):
            file = self.state / name
            file.parent.mkdir(exist_ok=True)
            file.write_text('fixture')
        output = self.root / 'backup.tar.gz'
        self.call('backup', output)
        self.assertEqual(output.stat().st_mode & 0o777, 0o600)
        with tarfile.open(output) as archive: names = archive.getnames()
        for name in ('tabletop-layout.sqlite3', 'custom-card-art/a.jpg', 'secrets/client_session_key.aes', 'pgdata/global/pg_control'):
            self.assertIn('arkham-server-state/' + name, names)
        self.assertFalse(any('/run/' in n for n in names))

    def test_backup_refuses_active_instance(self):
        self.cluster()
        (self.state / 'run').mkdir()
        (self.state / 'run/arkham-api.pid').write_text(str(os.getpid()))
        self.call('backup', self.root / 'backup.tar.gz', ok=False)
        self.assertFalse((self.root / 'backup.tar.gz').exists())

    def test_backup_never_overwrites(self):
        self.cluster()
        output = self.root / 'backup.tar.gz'
        output.write_bytes(b'keep')
        self.call('backup', output, ok=False)
        self.assertEqual(output.read_bytes(), b'keep')

    def test_backup_inside_state_refused(self):
        self.cluster()
        self.call('backup', self.state / 'backup.tar.gz', ok=False)

    def test_backup_symlink_refused(self):
        self.cluster()
        (self.state / 'pgdata/link').symlink_to('/etc/passwd')
        self.call('backup', self.root / 'backup.tar.gz', ok=False)

if __name__ == '__main__': unittest.main(verbosity=2)
