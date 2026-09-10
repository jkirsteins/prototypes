# Survidle Local Weather Design

## Goal

Replace the square, globally uniform sight model with spatially coherent moving weather, local persistent ground consequences, and cumulative optical attenuation along sight rays.

## Atmospheric fields

Weather is a deterministic function of world seed, coordinates, terrain and absolute time. Broad pressure, humidity and temperature-anomaly fields use a 12 km lattice with no effective features below 50 km. A subordinate 1.2 km field shapes precipitation edges and terrain fog only where its parent field permits them, yielding coherent 5 to 7 km detail without independent 300 m cell rolls. Fields advect continuously. Elevation applies a 6.5 C/km lapse rate; windward terrain lifts and wets air while lee terrain dries it.

The simulation exposes one `AtmosphereSample` containing temperature, pressure, humidity, cloud, precipitation rate and phase, wind, fog, blowing snow and extinction. Gameplay, sight, the weather panel and rendering use this same sample.

## Ground state

Atmosphere moves; ground does not. Each materialized roughly 4 km region stores last update hour, snow depth, surface water, soil moisture, frost, ice thickness and dry hours. Hourly catch-up integrates local precipitation, settlement, melt, infiltration, evaporation, freeze and thaw. Existing global snow, ice, rain history and drought values migrate into already materialized regions. Unseen regions initialize deterministically from their seasonal history without consuming gameplay RNG.

## Sight

Each 300 m ray segment samples local extinction at its midpoint. Component extinction coefficients add, and a ray stops after optical depth exceeds `-ln(0.05)`. Weather can shorten but not extend the existing terrain, light, eyesight, skill and horizon range. Canopy remains a hard blocker. Euclidean range replaces the square boundary. Mapped ground remains remembered; current wildlife and new mapping use current visibility.

## Presentation and constraints

Map fog, rain and snow use the simulation samples at the glyph coordinates. The sky uses the sample at the player. Artistic amplification may change opacity only, never position, movement, density relationships or timing. Reduced motion disables animation. Weather remains physically inspired rather than CFD; no forecast overlay, shelter aerodynamics or metre-scale turbulence is in scope.
