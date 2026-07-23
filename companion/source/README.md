# Arkham Companion for macOS

Unsigned, standalone card-image library manager and web launcher for Arkham Horror.

## Build

```bash
bash build.sh /path/to/ArkhamHorror-runtime /path/to/cards
```

The build copies the card image manifest and the complete card image library
into the application bundle. The generated application does not start or
depend on the local game backend.

## Features

- Ship the complete card image library inside the application.
- Import replacement images into the user's Application Support folder.
- Resolve replacements before bundled images without modifying the app bundle.
- Scan effective card image coverage against `card-image-index.json`.
- Open the configured remote web game in the default browser.
- Serve bundled and replacement card images from `127.0.0.1:8688`.
- Show local image request counts and the latest image source.
- Provide a local verification page without starting a game backend.

The local service contains no game logic, database, Haskell runtime, Docker,
or virtual machine. The companion-aware web frontend automatically detects the
loopback service and sends only Chinese `cards/*.avif` requests to it. Missing
files redirect to the original remote image URL. API requests, WebSockets,
accounts, multiplayer state, and saves continue to use the remote server.

The app is intentionally unsigned. On first launch, right-click it and choose
**Open** if Gatekeeper blocks a normal double-click.
