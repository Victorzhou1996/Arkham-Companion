# Server Sidecar

This small API handles server-only features such as registration verification,
bug reports, and archive helpers. Some deployments route `/api/v1/register`
through it instead of the Haskell backend, so it must be installed for new
accounts to receive the bundled starter decks.

## Install

1. Create a Python virtual environment in the deployment's `online-api` folder.
2. Install `requirements.txt`.
3. Copy `online_api.py` and `layout_preferences.py` into that folder.
4. Apply `server/deploy/setup-arkham-sidecar-role.sql` as the database owner.
5. Install the matching service file from `server/deploy/` and restart it.

Configuration is supplied by the service's environment file. Do not commit the
environment file, database password, mail credentials, or JWT secret.

## Account layout preferences (2026-09-15)

The optional authenticated GET/PUT `/api/v1/account/tabletop-layout` endpoint stores panel preferences in a separate SQLite file, not the game database. Set `ARKHAM_LAYOUT_DB` to an absolute private path writable by the sidecar service user; do not publish or commit this file. User identity comes from the existing session and is checked against the account table. The payload permits bounded panel sizes only, not arbitrary game state.

Route this exact API path through the existing sidecar upstream, preserving the Authorization header. Do not assume every deployment uses the same sidecar port, overwrite unrelated nginx configuration, or redirect all game API requests to this service. Back up existing configuration and check nginx syntax before a separately authorized deployment. Missing preferences service falls back to browser cache and must not block gameplay. The right-bottom pile grid is deliberately not persisted.

These files update source only; ordinary Windows/Linux self-hosted packages do not include this online-only sidecar. Their standard-library socket helper lives with the platform scripts. Unit tests: `python -m unittest test_layout_preferences` (with the requirements installed).
