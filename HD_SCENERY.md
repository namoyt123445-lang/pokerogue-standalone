# High-definition biome scenery

Every one of the 35 native biome IDs has a distinct original illustrated
background. The shipped 1280×720 PNGs are tracked in
`standalone-public/scenery/biomes/`; they are not 320×180 pixel-art thumbnails.
The title/account/page background uses the same smooth lakeside art.

`src/fan/biome-scenery.ts` is the catalog. Build preparation copies each picture
over its native `<biome>_bg.png` URL, preserving normal loading, transitions, time
of day, weather, Pokémon sprites, battle platforms, menus, and controls.
Only scenery textures use linear filtering.

`setArenaBackgroundTexture` separates source pixels from world coordinates.
A 1280×720 picture is rendered at 1920×1080, while the original 320×240 logical
size is retained for field-zoom calculations. It is applied during initialization,
run loading, biome transitions, and mystery-encounter teleports. Non-standalone
builds do not enable HD scaling.

The gallery at `/biome-gallery.html` includes full-size links and three labeled
overview pictures. These are artwork previews, not gameplay screenshots.

Regenerate the gallery with:

```sh
node scripts/prepare-biome-gallery.mjs
```

On Windows, `scripts/prepare-hd-scenery.ps1` can resize local full-resolution
generation masters and rebuild overview pictures. Masters in `art/biomes` are
ignored to avoid duplicating large files; the complete shipped artwork is in Git.
If masters are absent, the script uses existing shipped pictures for overviews.
Do not rerun the older `prepare-scenery.ps1` to downsample these HD images.

Tests:

```sh
node --test scripts/test-biome-scenery.mjs
node node_modules/vitest/vitest.mjs run test/tests/ui/hd-background.test.ts test/tests/ui/owned-starter-native.test.ts
node scripts/test-standalone.mjs
```
