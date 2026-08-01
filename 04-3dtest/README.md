# 04 - 3D Test

A Godot 4.7.1 3D prototype, exported to Web and deployed alongside the Vite
prototypes. Currently a hello world: an orange cube spinning under a
directional light, which is enough to prove the whole pipeline renders.

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
paid on every cold load no matter how small the game is. The Vite prototypes
ship roughly 200 KB. If this prototype is ever dropped, the `Detect Godot
prototypes` step in `.github/workflows/pages.yml` notices there is no
`project.godot` anywhere and skips the whole Godot toolchain install.
