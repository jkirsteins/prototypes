import { describe, expect, it } from "vitest";
import {
  GALACTIC_CENTER,
  equatorialToHorizontal,
  galacticToEquatorial,
  localSiderealDegrees,
  projectGalacticPlane,
  projectSouth,
} from "../src/sim/celestial";

describe("the astronomical sky", () => {
  it("orients the sidereal clock from the game date and local solar time", () => {
    expect(localSiderealDegrees(0, 13)).toBeCloseTo(281.392, 3);
    expect(localSiderealDegrees(0, 14) - localSiderealDegrees(0, 13)).toBeCloseTo(15.041, 3);
  });

  it("puts the celestial pole due north at the observer latitude", () => {
    const pole = equatorialToHorizontal({ raDeg: 0, decDeg: 90 }, 0);
    expect(pole.altitudeDeg).toBeCloseTo(62, 6);
    expect(pole.azimuthDeg).toBeCloseTo(0, 6);
  });

  it("puts an equatorial meridian object due south at 28 degrees", () => {
    const meridian = equatorialToHorizontal({ raDeg: 0, decDeg: 0 }, 0);
    expect(meridian.altitudeDeg).toBeCloseTo(28, 6);
    expect(meridian.azimuthDeg).toBeCloseTo(180, 6);
    expect(projectSouth(meridian, 240, 189)).toMatchObject({ visible: true, x: 120 });
  });

  it("maps east to the left and west to the right of the south panorama", () => {
    expect(projectSouth({ altitudeDeg: 30, azimuthDeg: 90 }, 240, 189)).toMatchObject({ visible: true, x: 0 });
    expect(projectSouth({ altitudeDeg: 30, azimuthDeg: 270 }, 240, 189)).toMatchObject({ visible: true, x: 240 });
  });

  it("keeps the real Galactic Center below the horizon at 62 north", () => {
    const fromPlane = galacticToEquatorial(0, 0);
    expect(fromPlane.raDeg).toBeCloseTo(266.405, 3);
    expect(fromPlane.decDeg).toBeCloseTo(-28.936, 3);

    const center = equatorialToHorizontal(GALACTIC_CENTER, GALACTIC_CENTER.raDeg);
    expect(center.altitudeDeg).toBeCloseTo(-0.936, 3);
    expect(center.azimuthDeg).toBeCloseTo(180, 3);
    expect(projectSouth(center, 240, 189).visible).toBe(false);
  });

  it("projects the northern Milky Way high over the real southern horizon in September", () => {
    const sidereal = localSiderealDegrees(243, 20.4);
    const points = projectGalacticPlane(sidereal, 240, 189).flat();
    const center = points.find((point) => point.galacticLongitudeDeg === 0);
    const highest = points.reduce((best, point) => (
      point.horizontal.altitudeDeg > best.horizontal.altitudeDeg ? point : best
    ));

    expect(center?.horizontal.altitudeDeg).toBeCloseTo(-1.057, 3);
    expect(highest.galacticLongitudeDeg).toBe(92);
    expect(highest.horizontal.altitudeDeg).toBeCloseTo(61.315, 3);
    expect(points.every((point) => point.horizontal.azimuthDeg >= 90
      && point.horizontal.azimuthDeg <= 270)).toBe(true);
  });

  it("does not connect across the azimuth singularity at the zenith", () => {
    const sidereal = localSiderealDegrees(270, 0);
    const segments = projectGalacticPlane(sidereal, 240, 189);

    for (const segment of segments) {
      for (let i = 1; i < segment.length; i++) {
        expect(Math.abs(segment[i].projection.x - segment[i - 1].projection.x)).toBeLessThan(80);
      }
    }
  });
});
