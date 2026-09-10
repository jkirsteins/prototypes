# Simulation-backed local weather references

Regenerate with `npm run dev` in one shell and `npm run shots` in another.
Every image is normal simulation and rendering output selected by the deterministic scenario catalog in `src/sim/weather-scenarios.ts`.
The harness does not assign weather classes, variables, glyphs, or visibility.

- **clear** - 323 cells in the actual current-visibility footprint.

  ![clear](clear.png)
- **sunny-clouds** - 936 cells in the actual current-visibility footprint.

  ![sunny-clouds](sunny-clouds.png)
- **approaching-rain** - 164 cells in the actual current-visibility footprint.

  ![approaching-rain](approaching-rain.png)
- **local-rain** - 84 cells in the actual current-visibility footprint.

  ![local-rain](local-rain.png)
- **persisted-snow** - 1 cells in the actual current-visibility footprint.

  ![persisted-snow](persisted-snow.png)
- **frozen-water** - 217 cells in the actual current-visibility footprint.

  ![frozen-water](frozen-water.png)
- **valley-fog** - 39 cells in the actual current-visibility footprint.

  ![valley-fog](valley-fog.png)
- **windward-lee** - 421 cells in the actual current-visibility footprint.

  ![windward-lee](windward-lee.png)
- **obscured** - 1 cells in the actual current-visibility footprint.

  ![obscured](obscured.png)

The two fog frames hold the same simulation minute and visibility while one deterministic ASCII state hard-switches to the next.

![fog frame A](fog-frame-a.png)

![fog frame B](fog-frame-b.png)

The same approaching-rain simulation is also captured in both persisted display modes. Cloud shadows are the default; ASCII cloud flavor is the optional setting.

![cloud shadows](cloud-shadows.png)

![ASCII cloud flavor](cloud-glyphs.png)

The sunny pair advances the normal simulation by 60 game minutes between frames. The changing cell-owned shadow field comes from the moving simulated cloud field, not screenshot styling.

![sunny cloud shadows A](sunny-cloud-shadows-a.png)

![sunny cloud shadows B](sunny-cloud-shadows-b.png)
