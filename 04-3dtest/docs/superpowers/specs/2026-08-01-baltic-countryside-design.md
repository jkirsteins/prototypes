# Baltic Countryside Cinematic Prototype - Design

2026-08-01. Replaces the spinning-cube hello world in `04-3dtest` with a
cinematic third-person walking prototype. The user asked for an unassisted
end-to-end run, so decisions below were made without approval gates.

## Concept

"Ghost of Yotei"-style cinematic vignette set in the historical Latvian
countryside (a viensēta - an isolated farmstead - at golden hour). The player
walks a rolling meadow bordered by forest, with a log cabin and wooden fence
as the only human presence. No modern objects. Lean into cinematic cliches:
slow rising camera through grass, letterbox bars, a big title card in Latvian
("TEVZEME" styled as TĒVZEME - "fatherland"), fade in/out, then control is
handed to the player.

## Constraints (inherited, load-bearing)

- Godot 4.7.1, Web export, `gl_compatibility` renderer: no SDFGI, no
  volumetric fog, no SSAO. Atmosphere must come from sky, fog, directional
  light, color grading and a vignette overlay.
- `variant/thread_support=false` stays false (GitHub Pages cannot send
  COOP/COEP headers).
- Assets ship in the pck; keep the total under ~40 MB on top of the engine's
  38 MB wasm so cold load stays tolerable.

## Scene contents

- **Terrain**: procedural heightmap mesh (~200x200 m, gentle 2-4 m rolls)
  from FastNoiseLite with a fixed seed, ConcavePolygonShape3D collision,
  tiled grass albedo texture. Flat-ish clearing at the center for the cabin.
- **Vegetation**: scattered birch/pine-ish low-poly trees, bushes and rocks
  (deterministic seeded scatter, denser toward the edges to read as forest
  boundary); MultiMesh tall-grass tufts near the player spawn for the intro
  shot through grass.
- **Human presence**: one log cabin and a run of wooden fence in the
  clearing. Nothing else.
- **Player**: third-person CharacterBody3D, rigged humanoid with
  idle/walk/run animations, SpringArm3D orbit camera, pointer-lock mouse
  look, WASD + Shift to run. Footsteps timed to gait.
- **Audio**: grass footsteps, looping wind/birdsong ambient, a title-card
  music cue. Web autoplay policy means audio starts on first input; the
  intro waits for a click ("Click to begin") which also satisfies pointer
  lock and autoplay in one gesture.
- **Cinematic intro**: black -> fade in on a low camera in the grass ->
  slow rise and push toward the character -> letterbox bars + title card
  fades in -> holds -> fades out -> camera blends to the shoulder camera and
  bars retract -> movement hint appears briefly. Any key/click skips.

## Asset sourcing

Preference order per category; every downloaded asset gets a line in
`assets/LICENSES.md` (source URL, author, license):

1. **Character**: CC0 rigged+animated GLB from KayKit (GitHub releases) or
   Quaternius; must be downloadable non-interactively. Fallback: Mixamo is
   excluded (login); last resort is a stylized capsule-person with procedural
   bob, but treat that as failure-of-sourcing, not the plan.
2. **Nature + cabin**: Quaternius/KayKit/Kenney CC0 packs (GLB). Cabin may
   also be assembled from textured boxes if no fitting model is found.
3. **Textures/sky**: ambientCG (CC0, direct `ambientcg.com/get` URLs) for
   grass/dirt/wood/bark; Poly Haven 2K HDRI for the golden-hour sky, or
   Godot ProceduralSkyMaterial if the HDRI costs too many MB.
4. **Audio**: Kenney CC0 audio packs for footsteps; ambient loop and music
   from CC0 sources if curl-able, otherwise procedurally synthesized to OGG
   (wind noise + filtered birds; slow kokle-like plucked drone for the
   title) - synthesis is an acceptable outcome for audio, unlike character.

## Verification

- Local: headless import + Web export, serve `dist/`, open in Chrome via
  MCP; screenshot the fade-in, title card, and gameplay; read the console
  for errors; drive the character with synthetic key events and confirm the
  camera/animation/footsteps react.
- Live: push, watch the Pages workflow, open the deployed URL in Chrome and
  repeat the visual pass.

## Out of scope

Combat, NPCs, quests, save state, mobile touch controls, localization
beyond the title card, day/night cycle.
