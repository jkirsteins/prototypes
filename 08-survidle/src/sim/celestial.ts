import { LATITUDE_DEG } from "./calendar";

export interface EquatorialCoordinate {
  /** Right ascension, degrees east from the equinox. */
  raDeg: number;
  /** Declination, degrees north of the celestial equator. */
  decDeg: number;
}

export interface HorizontalCoordinate {
  /** Degrees above the astronomical horizon. */
  altitudeDeg: number;
  /** Degrees clockwise from north: east 90, south 180, west 270. */
  azimuthDeg: number;
}

export interface SouthProjection {
  x: number;
  y: number;
  visible: boolean;
}

export interface ProjectedGalacticPoint {
  galacticLongitudeDeg: number;
  horizontal: HorizontalCoordinate;
  projection: SouthProjection;
}

const DEG = Math.PI / 180;
const DAYS_FROM_J2000_TO_GAME_YEAR = 9131.5;

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/**
 * Local mean sidereal angle for the game's solar clock.
 *
 * Game 13:00 is local solar noon, so its solar time is 12:00. Treating
 * that local meridian as Greenwich makes longitude cancel out instead of
 * inventing a civil timezone the simulation does not have. The epoch is
 * 1 January 2025, used only to orient the equinox against the calendar.
 */
export function localSiderealDegrees(absoluteDay: number, gameHour: number): number {
  const localSolarHour = gameHour - 1;
  const daysFromJ2000 = DAYS_FROM_J2000_TO_GAME_YEAR + absoluteDay + localSolarHour / 24;
  const gmstHours = 18.697375 + 24.065709824279 * daysFromJ2000;
  return wrap(gmstHours, 24) * 15;
}

/** Converts a fixed celestial coordinate to the observer's local sky. */
export function equatorialToHorizontal(
  coordinate: EquatorialCoordinate,
  siderealDeg: number,
  latitudeDeg = LATITUDE_DEG,
): HorizontalCoordinate {
  const hourAngle = wrap(siderealDeg - coordinate.raDeg + 180, 360) - 180;
  const h = hourAngle * DEG;
  const dec = coordinate.decDeg * DEG;
  const lat = latitudeDeg * DEG;
  const sinAltitude = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(h);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAltitude)));
  const cosAltitude = Math.max(1e-12, Math.cos(altitude));
  const sinAzimuth = -Math.sin(h) * Math.cos(dec) / cosAltitude;
  const cosAzimuth = (Math.sin(dec) - Math.sin(altitude) * Math.sin(lat))
    / (cosAltitude * Math.cos(lat));
  const azimuth = Math.atan2(sinAzimuth, cosAzimuth) / DEG;
  return { altitudeDeg: altitude / DEG, azimuthDeg: wrap(azimuth, 360) };
}

/** Converts IAU J2000 galactic longitude and latitude to RA and declination. */
export function galacticToEquatorial(longitudeDeg: number, latitudeDeg: number): EquatorialCoordinate {
  const longitude = longitudeDeg * DEG;
  const latitude = latitudeDeg * DEG;
  const galactic = [
    Math.cos(latitude) * Math.cos(longitude),
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
  ];
  // Transpose of the standard J2000 equatorial-to-galactic rotation matrix.
  const x = -0.0548755604 * galactic[0] + 0.4941094279 * galactic[1] - 0.8676661490 * galactic[2];
  const y = -0.8734370902 * galactic[0] - 0.4448296300 * galactic[1] - 0.1980763734 * galactic[2];
  const z = -0.4838350155 * galactic[0] + 0.7469822445 * galactic[1] + 0.4559837762 * galactic[2];
  return { raDeg: wrap(Math.atan2(y, x) / DEG, 360), decDeg: Math.asin(z) / DEG };
}

export const GALACTIC_CENTER = galacticToEquatorial(0, 0);

/** Equirectangular 180-degree panorama facing due south, horizon to zenith. */
export function projectSouth(
  coordinate: HorizontalCoordinate,
  width: number,
  groundY: number,
): SouthProjection {
  const visible = coordinate.altitudeDeg >= 0
    && coordinate.azimuthDeg >= 90
    && coordinate.azimuthDeg <= 270;
  return {
    x: (coordinate.azimuthDeg - 90) / 180 * width,
    y: groundY * (1 - coordinate.altitudeDeg / 90),
    visible,
  };
}

/**
 * The real J2000 galactic equator sampled through the south-facing view.
 * Points below the horizon remain in the path so the renderer can clip the
 * stroke precisely at altitude zero instead of ending it at a sample.
 */
export function projectGalacticPlane(
  siderealDeg: number,
  width: number,
  groundY: number,
): ProjectedGalacticPoint[][] {
  const segments: ProjectedGalacticPoint[][] = [];
  let segment: ProjectedGalacticPoint[] = [];
  let previousX: number | undefined;
  for (let longitude = 0; longitude < 360; longitude += 2) {
    const horizontal = equatorialToHorizontal(galacticToEquatorial(longitude, 0), siderealDeg);
    const inSouthView = horizontal.azimuthDeg >= 90 && horizontal.azimuthDeg <= 270;
    if (!inSouthView) {
      if (segment.length > 1) segments.push(segment);
      segment = [];
      previousX = undefined;
      continue;
    }
    const point = {
      galacticLongitudeDeg: longitude,
      horizontal,
      projection: projectSouth(horizontal, width, groundY),
    };
    // Azimuth is undefined exactly at the zenith. On either side of that
    // singularity adjacent samples can land on opposite sides of this
    // equirectangular panorama, so joining them would draw a false cap across
    // the top of the sky. Start another stroke when that wrap is detected.
    if (previousX !== undefined && Math.abs(point.projection.x - previousX) >= width / 3) {
      if (segment.length > 1) segments.push(segment);
      segment = [];
    }
    segment.push(point);
    previousX = point.projection.x;
  }
  if (segment.length > 1) segments.push(segment);
  return segments;
}
