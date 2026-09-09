# Astronomical sky model

The weather widget is a fixed 180-degree panorama facing due south from
latitude 62 north. Its horizontal axis runs from east through south to west.
Its vertical axis runs from the astronomical horizon to the zenith.

**Sky position and visibility are astronomical; Milky Way brightness and
texture are intentionally exaggerated for readability.**

## Time

Game 13:00 is local solar noon. The celestial clock therefore treats game
12:00 as solar 11:00, game 13:00 as solar 12:00, and so on. This lets local
longitude cancel out and avoids inventing a timezone the simulation does not
have.

Local mean sidereal time follows the US Naval Observatory approximation. The
first game year uses 1 January 2025 as its equinox reference, while subsequent
game days continue without a year-boundary jump. The reference year changes
only the sub-degree precession alignment, not seasonal or nightly motion.

Reference: https://aa.usno.navy.mil/faq/GAST

## Geometry

The Milky Way centerline is the IAU J2000 galactic equator. Samples along that
great circle are transformed into equatorial right ascension and declination,
then into local altitude and azimuth at latitude 62 north. Only azimuths in the
south-facing half of the sky are drawn, and an SVG clip ends every band, lane,
and star exactly at the altitude-zero horizon.

The Galactic Center has declination about -28.94 degrees. At latitude 62 north
its greatest possible altitude is about -0.94 degrees, so it never rises. The
visually important portions are instead the northern Milky Way through Cygnus
and Cassiopeia.

Reference: https://aa.usno.navy.mil/faq/alt_az

## Rendering and performance

Decorative field stars have deterministic RA/Dec coordinates and use the same
horizontal projection as the galactic plane. Milky Way dust stars also have
deterministic coordinates clustered around the real plane, with extra visual
density in its northern longitudes. Their precise identities and magnitudes are
artistic rather than catalog data.

Broad translucent strokes, procedural displacement, dark lanes, filaments,
and boosted star counts make the band survive the small weather-widget scale.
They do not alter its position or visibility.

The projected paths and star positions are cached by displayed game minute.
Normal frame updates therefore change weather opacity and lighting without
repeating any celestial trigonometry or coordinate writes.
