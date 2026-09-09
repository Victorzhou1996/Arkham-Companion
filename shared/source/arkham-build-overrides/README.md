# Embedded arkham.build source overlay

This directory contains the modified and added frontend source files used to
build the bundled `/build/` application. Apply the directory over
`arkham-build/arkham.build` commit
`caa9bbfc53570daa1ca48ada7a9d179b160cd4e8`, then configure `frontend/.env`
with embedded mode enabled:

```dotenv
VITE_API_LEGACY_URL="/build-api"
VITE_API_URL="/build-api"
VITE_CARD_IMAGE_URL=""
VITE_ARKHAM_HORROR_MODE="true"
VITE_ARKHAM_HORROR_API_URL=""
```

Run `npm ci`, `npm --workspace frontend run check`, and
`npm --workspace frontend run build`. The resulting `frontend/dist/` directory
is the `build/` directory shipped by the Mac and Server branches.

The 2026-09-09 change replaces the invalid local-to-arkham.build API upload
with a JSON export plus a link to the official site. The generated JSON was
successfully imported by the live `https://arkham.build/` frontend.
