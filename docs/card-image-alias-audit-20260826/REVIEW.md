# Card Image Alias Review

Reviewed on 2026-08-26 against the current macOS runtime and the exact images
served by `assets.arkham.build`.

## Approved

- 29 candidates not listed in the exception groups below may copy their local
  Chinese source image to the Build target filename.
- `11537b.avif` may use `11537ab.avif` after rotating it 90 degrees clockwise.
- `11688a.avif` may use `11688c.avif` (The Doom of Arkham Pt II,
  Easy/Standard).
- `11688ab.avif` may use `11688cb.avif` (The Doom of Arkham Pt II,
  Hard/Expert).
- `11691b.avif` may use `11691c.avif` (The Final Seal).
- `11691bb.avif` may use `11691cb.avif` (Ritual of Binding).

## Keep The Exact Official Build Image

- All 45 reviewed targets from `12105.avif` through `12187.avif`: their proposed
  local sources are the corresponding `b` sides, not the requested fronts.
- `82017.avif` through `82021.avif`: no matching Chinese fronts are available,
  so they continue to fall back to the five distinct official English fronts.
  Their local `82017b.avif` through `82021b.avif` files are the correct shared
  Chinese Masked Carnevale-Goer backs and remain enabled.

## Confirmed Side Relationships

- `11688b.avif` is the alternate/art side of Horror in Clay. It is not a source
  for `11688a.avif` or `11688ab.avif`.
- `11691ab.avif` is the back of `11691a.avif`. It is not the back of
  `11691b.avif`; that pair is `11691b.avif` and `11691bb.avif`.

## Fallback Rule

Only an exact local filename or an explicitly approved alias may replace a
Build image. A historical Taboo filename such as `01033-10.avif` must not
silently fall back to `01033.avif`, because the printed rules text may differ.

## Historical Taboo Images

The Build audit also identified 558 historical Taboo filenames (`CODE-N.avif`)
that were absent from the packaged library. They are handled separately from
the front/back aliases above:

- 456 filenames have one unambiguous translated mutation revision and reuse
  that local image under the exact Build filename.
- 36 filenames belong to six cards with multiple historical mutation
  revisions; they retain the exact official Build image rather than guessing
  which translated revision applies.
- 66 filenames have no local mutation image and retain the exact official
  Build image.

All 558 exact filenames are bundled and indexed. This fixes broken historical
Taboo images while preserving the rule-text safety requirement above.
