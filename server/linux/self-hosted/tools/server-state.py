"""Generate private instance secrets and create an offline server-state archive."""
import hashlib
import os
from pathlib import Path
import re
import secrets
import sys
import tarfile

def check_stopped(state):
    for name in ('run/arkham-api.pid', 'run/nginx.pid', 'run/layout.pid', 'pgdata/postmaster.pid'):
        file = state / name
        if not file.exists():
            continue
        try:
            pid = int(file.read_text().splitlines()[0])
            os.kill(pid, 0)
        except (ValueError, ProcessLookupError, FileNotFoundError):
            continue
        except PermissionError:
            pass
        raise SystemExit(f'Stop the server before backup; a live PID remains in {name}.')

def main():
    command, directory, *args = sys.argv[1:]
    state = Path(directory).resolve()
    private = state / 'secrets'
    if command == 'init':
        specs = {'jwt-secret': lambda: secrets.token_hex(48).encode(),
                 'pg-password': lambda: secrets.token_hex(32).encode(),
                 'client_session_key.aes': lambda: secrets.token_bytes(96)}
        existing = (state / 'pgdata' / 'PG_VERSION').exists()
        if (state / 'backups' / 'force_init.dump').exists():
            raise SystemExit('Automatic forced restore is disabled on servers. Follow UPDATE.md for a reviewed recovery.')
        if existing and (not all((state / 'pgdata' / p).is_file() for p in ('global/pg_control', 'postgresql.conf', 'pg_hba.conf'))
                         or not all((state / 'pgdata' / p).is_dir() for p in ('base', 'pg_wal'))):
            raise SystemExit('Incomplete existing database found; manual recovery is required. No files were removed.')
        if existing and any(not (private / name).is_file() for name in specs):
            raise SystemExit('Database exists but secrets are missing. Restore its original secrets; do not generate replacements.')
        if (state / 'pgdata').exists() and not existing and any((state / 'pgdata').iterdir()):
            raise SystemExit('Non-empty invalid database directory found; manual recovery is required.')
        for name, generator in specs.items():
            target = private / name
            if target.exists():
                if target.is_symlink() or not target.is_file():
                    raise SystemExit(f'Invalid secret path: {name}')
                expected = 96 if name != 'pg-password' else 64
                if target.stat().st_size != expected:
                    raise SystemExit(f'Unexpected secret length: {name}')
                if name != 'client_session_key.aes' and not re.fullmatch(b'[0-9a-f]+', target.read_bytes()):
                    raise SystemExit(f'Unexpected secret format: {name}')
                target.chmod(0o600)
                continue
            with target.open('xb') as handle:
                os.chmod(target, 0o600)
                handle.write(generator())
        print('[SERVER] Instance secrets ready (values not displayed).')
    elif command == 'backup':
        check_stopped(state)
        output = Path(args[0]).resolve()
        if output == state or state in output.parents:
            raise SystemExit('Backup output must be outside the data directory.')
        if not (state / 'pgdata' / 'PG_VERSION').is_file():
            raise SystemExit('No initialized database found.')
        output.parent.mkdir(parents=True, exist_ok=True)
        paths = []
        for root in ('pgdata', 'pgdata_version', 'custom-card-art', 'tabletop-layout.sqlite3',
                     'tabletop-layout.sqlite3-wal', 'tabletop-layout.sqlite3-shm', 'secrets', 'backups'):
            base = state / root
            if not base.exists():
                continue
            paths.extend([base] + (list(base.rglob('*')) if base.is_dir() else []))
        for file in paths:
            if file.is_symlink() or not (file.is_dir() or file.is_file()):
                raise SystemExit(f'Unsafe file in data directory: {file.relative_to(state)}')
        # Exclusive create avoids replacing an earlier backup; no logs/PIDs/sockets.
        with output.open('xb') as handle:
            os.chmod(output, 0o600)
            with tarfile.open(fileobj=handle, mode='w:gz') as archive:
                for file in paths:
                    archive.add(file, arcname='arkham-server-state/' + str(file.relative_to(state)), recursive=False)
        with output.open('rb') as handle:
            digest = hashlib.file_digest(handle, 'sha256').hexdigest()
        print(f'[SERVER] Offline state backup: {output}\nSHA256: {digest}')
    else:
        raise SystemExit('Unknown state command')

if __name__ == '__main__':
    main()
