# 04 - Tevzeme (3D test)

A Godot 4.7.1 3D prototype, exported to Web and deployed alongside the Vite
prototypes: a cinematic third-person walk through a Baltic countryside
homestead at golden hour. Click to begin; the camera rises out of the grass,
a TEVZEME title card fades in and out over letterbox bars, then control
blends to the player. WASD walks, Shift runs, mouse looks, Esc releases the
pointer. Footsteps, meadow ambience and a title theme are in. The scene is a
procedural meadow (simplex-noise terrain, 11k grass cards, scattered pines,
birches, ferns and boulders) around a hand-placed farmstead: cabin, barn,
wagon, log fence, barrel, bucket, lantern.

The design doc lives at
`docs/superpowers/specs/2026-08-01-baltic-countryside-design.md`.

This is the first prototype in the repo that is **not** Vite + TypeScript, so
several of the repo-wide conventions in the root `CLAUDE.md` do not apply here.
What replaces them is below.

## Building

There is no `package.json`, so `npm run build` and `npm test` do not exist.
Build with the editor binary in headless mode:

```bash
godot --headless --import                            # populates .godot/
godot --headless --export-release Web dist/index.html
```

On macOS the binary lives at `/Applications/Godot.app/Contents/MacOS/Godot`.
Export templates for the **exact** editor version must be installed, or the
export fails; the editor installs them from *Editor -> Manage Export Templates*.

`.godot/` and `dist/` are both gitignored. CI installs Godot and re-exports on
every deploy rather than committing the 38 MB `index.wasm` into git.

## Serving it locally

`vite.config.ts` and its `base: "/prototypes/NN/"` have no equivalent here, and
none is needed: the Godot web export references its assets relatively
(`"index.js"`, `"index.wasm"`), so the build works unchanged at any path. Any
static server over `dist/` will do:

```bash
python3 -m http.server 8899 --bind 127.0.0.1 -d dist
```

The root `npm run dev` front door does not know about this prototype.

## Two settings that must not change

Both are load-bearing for GitHub Pages specifically, and both fail in ways that
look unrelated to the setting that caused them.

**`variant/thread_support=false`** in `export_presets.cfg`. Threaded web builds
need `SharedArrayBuffer`, which browsers only expose to cross-origin isolated
pages, which requires `Cross-Origin-Opener-Policy` and
`Cross-Origin-Embedder-Policy` response headers. GitHub Pages serves static
files and cannot set headers. A threaded build therefore exports fine, passes
every local check served from a server that does set them, and then fails to
boot on the deployed site.

**`renderer/rendering_method="gl_compatibility"`** in `project.godot`. The web
platform has no Vulkan, so Forward+ and Mobile are not available. This caps what
the prototype can use: no SDFGI, no volumetric fog, no SSIL/SSAO, and lower
limits on real-time lights and shadows.

## Size

The engine `.wasm` is 38 MB uncompressed, 9.6 MB gzipped, and that is a floor
paid on every cold load no matter how small the game is. The asset pack adds
about 75 MB on top (PBR vegetation and buildings, HDRI sky, audio). The Vite
prototypes ship roughly 200 KB. If this prototype is ever dropped, the `Detect
Godot prototypes` step in `.github/workflows/pages.yml` notices there is no
`project.godot` anywhere and skips the whole Godot toolchain install.

## Asset credits

Every asset directory has a `manifest.md` with exact sources. Summary:

- Character: "Monk" model and rig by CDmir (CC0) with animations by
  hwoarangmy (CC-BY-SA 3.0), via OpenGameArt.
- Trees: pine by evolveduk (CC-BY 4.0), birch by restlessmonkey (CC-BY 4.0),
  via Sketchfab.
- Fence: "Wooden Fences" by minime453 (CC-BY 4.0), via OpenGameArt.
- Cabin: "medieval_house_1" by Paul Wortmann (CC0). Barn: "Old Wood Barn" by
  carlosjorgereis (CC0). Wagon: 3TD Starter Pack by Ron Kapaun / 3TD Studios
  (CC0). All via OpenGameArt.
- Ferns, shrubs, boulders, mossy rocks, ground-cover grass, barrel, bucket,
  lantern and the birchwood HDRI sky: Poly Haven (CC0).
- Ground and roof textures: ambientCG (CC0). Title font: Cinzel (OFL).
- Audio (footsteps, meadow ambience, title theme): sourced CC0/CC-BY, see
  `assets/audio/manifest.md`.
