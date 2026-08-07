# Server Sidecar

This small API handles server-only features such as registration verification,
bug reports, and archive helpers. Some deployments route `/api/v1/register`
through it instead of the Haskell backend, so it must be installed for new
accounts to receive the bundled starter decks.

## Install

1. Create a Python virtual environment in the deployment's `online-api` folder.
2. Install `requirements.txt`.
3. Copy `online_api.py` into that folder.
4. Apply `server/deploy/setup-arkham-sidecar-role.sql` as the database owner.
5. Install the matching service file from `server/deploy/` and restart it.

Configuration is supplied by the service's environment file. Do not commit the
environment file, database password, mail credentials, or JWT secret.
