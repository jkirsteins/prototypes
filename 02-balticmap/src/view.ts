import { realmRootOf, type Incorporated, type Overlords } from "./relations";
import { faction, t, type Segment } from "./segments";
import type { StandingChange } from "./standings";

export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_ZOOM = 8;

/** The most zoomed-out view allowed, as a factor of the whole-map fit.
 *  Above 1 the whole map never fits on screen and the player pans instead,
 *  so lands keep their size as the map grows. Measured against the map
 *  before the Prussian lands were added: extending it shrank every land to
 *  0.840 of its old canvas size, so 1.3 leaves them 9 percent larger than
 *  they were rather than 16 percent smaller. */
export const MIN_ZOOM = 1.3;

/** One row of the victory scoreboard. */
export interface StandingRow {
  factionId: string;
  lands: number;
  needed: number;
  /** Whole percent of the way to victory, floored, capped at 100. */
  percent: number;
  isHuman: boolean;
}

/** The scoreboard: one row per faction that ACTS, best realm first.
 *
 *  Every player fits now - five of them, not twenty-six factions - so there is
 *  no top-N cut and no separate row for a human who fell outside it. A land
 *  that takes no turns gets no row: it is ground to be taken, not a
 *  contender, and twenty-one rows of 1/13 would bury the five that matter.
 *
 *  Only factions that could actually win are ranked, which is the same test
 *  the victory check applies - not incorporated. A vassal stays in the
 *  ranking because the rules let one win.
 *
 *  Ties on land count resolve by seat order: `acting` arrives in seat order
 *  and `sort` is stable, so equal realms keep a fixed order and the board does
 *  not reshuffle itself from one turn to the next. */
export function standingsFor(args: {
  acting: string[];
  humanFactionId: string | undefined;
  realmSize(factionId: string): number;
  incorporated: Incorporated;
  needed: number;
}): StandingRow[] {
  const { acting, humanFactionId, realmSize, incorporated, needed } = args;
  const pct = (lands: number): number =>
    Math.min(100, Math.floor((lands / needed) * 100));
  return acting
    .filter((f) => !(f in incorporated))
    .sort((a, b) => realmSize(b) - realmSize(a))
    .map((factionId) => ({
      factionId,
      lands: realmSize(factionId),
      needed,
      percent: pct(realmSize(factionId)),
      isHuman: factionId === humanFactionId,
    }));
}

export function politicalFactionForPolygon(
  polygonFactionId: string,
  incorporated: Incorporated,
): string {
  return incorporated[polygonFactionId] ?? polygonFactionId;
}

/** "A", "A and B", "A, B and C" over faction NODES. Its own spelling rather
 *  than `joinSegments` from rich-text.ts: that module imports this one for
 *  `withArticle`, and reaching back would close a cycle for four lines of
 *  comma. */
function andFactions(ids: string[]): Segment[] {
  return ids.flatMap((id, i) => {
    if (i === 0) return [faction(id)];
    return [t(i === ids.length - 1 ? " and " : ", "), faction(id)];
  });
}

/** How a polygon stands to the human, from the polygon's OWN faction id.
 *
 *  Pass the polygon's own faction, never the politically resolved one: an
 *  incorporated land resolves to its absorber, whose own `incorporated` entry
 *  is empty, so resolving first makes the absorption invisible and the land
 *  reads as independent. Leads still come from the resolved faction - an
 *  absorbed land has no relations of its own - but its allegiance does not.
 *
 *  Null when the land answers to nobody. The map hover shows this line only
 *  when somebody holds the land, so it needs the absence as a value rather
 *  than as a string it would have to compare against. */
export function relationshipLine(
  polygonFactionId: string,
  humanFactionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
): Segment[] | null {
  const owner = incorporated[polygonFactionId];
  const lord = overlords.get(polygonFactionId);
  // The chain can run deeper than one link. Name the direct lord and, when
  // the chain's root is somebody further up, the root - the two ends are what
  // the player can act on; spelling every middle link is noise.
  const ultimately = (of: string): Segment[] => {
    const root = realmRootOf(of, overlords, incorporated);
    const direct = overlords.get(of);
    if (direct === undefined || root === direct) return [];
    return root === humanFactionId
      ? [t(", ultimately your vassal")]
      : [t(", ultimately a vassal of "), faction(root)];
  };
  if (owner === humanFactionId) return [t("Part of your realm (incorporated)")];
  if (owner !== undefined) {
    // Follow the chain. Every land of a vassal's realm carries the overlord's
    // stripes, so naming only the absorber leaves the stripes unexplained and
    // makes one realm read as two unrelated stories.
    const ownersLord = overlords.get(owner);
    const suffix: Segment[] =
      ownersLord === undefined
        ? []
        : ownersLord === humanFactionId
          ? [t(", itself your vassal")]
          : [t(", itself a vassal of "), faction(ownersLord)];
    return [
      t("Incorporated into "), faction(owner), ...suffix, ...ultimately(owner),
    ];
  }
  // Who this land holds, on top of who holds it. Without it the fealty only
  // ever read one way: a vassal's hover named its lord while the lord's own
  // hover said nothing back, so the land carrying the stripes everybody else
  // wears was the one land that never explained them. The human is left out -
  // "Your overlord" below already says that better than a name in a list would.
  const held = [...overlords]
    .filter(([v, l]) => l === polygonFactionId && v !== humanFactionId && !(v in incorporated))
    .map(([v]) => v)
    .sort();
  const holds: Segment[] | null =
    held.length > 0
      ? [t("overlord of "), ...andFactions(held)]
      : null;
  if (lord === humanFactionId) {
    return holds === null ? [t("Your vassal")] : [t("Your vassal, "), ...holds];
  }
  if (overlords.get(humanFactionId) === polygonFactionId) {
    // The human is deliberately absent from `held`, so this reads as "yours and
    // theirs" rather than repeating you back at yourself.
    return holds === null
      ? [t("Your overlord")]
      : [t("Your overlord, and "), ...holds];
  }
  if (lord === undefined) {
    // Capitalized by hand: the run starts with a common noun here and with a
    // name everywhere else, and a name is a node whose text nobody may edit.
    return holds === null ? null : [t("Overlord of "), ...holds.slice(1)];
  }
  return [
    t("Vassal of "), faction(lord), ...ultimately(polygonFactionId),
    ...(holds === null ? [] : [t(", "), ...holds]),
  ];
}

/** The faction whose OWN polygon holds this land: the realm that absorbed it,
 *  or the overlord it owes fealty to. Null when it answers to nobody.
 *
 *  Deliberately the immediate holder, not the top of the chain: hovering a
 *  land marks one polygon - who took this - while the tooltip spells out any
 *  further fealty above it. */
export function holderOf(
  polygonFactionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
): string | null {
  return incorporated[polygonFactionId] ?? overlords.get(polygonFactionId) ?? null;
}

/** "the Ugandians", but "Lietuva" - the one faction named for a land rather
 *  than a people takes no article. Both the activity log and the notices use
 *  this, so the two surfaces cannot drift apart. */
export function withArticle(name: string, placeName: boolean): string {
  return placeName ? name : `the ${name}`;
}

/** "Defense 6 -> 5 (-1)" / "Disease 2 -> 3 (+1)" for the round summary and
 *  the activity log: where the score stood, where it landed, and the movement
 *  in brackets. One spelling for both surfaces, so they cannot quote different
 *  numbers for the same event. ASCII "->", never a unicode arrow: nothing in
 *  this codebase uses one.
 *
 *  The arrow used to run from the DELTA to the after ("Defense -1 -> 5"),
 *  which reads as a score that went from -1 to 5. Nobody noticed while every
 *  number was a round hundred and the delta was obviously not a score; a
 *  "-0.75 -> 0.75" on the smaller scale made it plain that the arrow was
 *  pointing between two different kinds of thing. */
export function standingChangeText(c: StandingChange): string {
  const delta = c.after - c.before;
  const signed = delta > 0 ? `+${delta}` : `${delta}`;
  const track = c.track === "defense" ? "Defense" : "Disease";
  return `${track} ${c.before} -> ${c.after} (${signed})`;
}

/** The tone of a score movement as the HUMAN reads it: their polygon losing
 *  defense is bad, a rival's losing it is pressure working. The caller says
 *  whose side the moved score sits on; the classes only name the tone - each
 *  surface declares what the tone looks like against its own background. */
export function leadClass(delta: number): string {
  return delta > 0 ? "lead-good" : delta < 0 ? "lead-bad" : "lead-even";
}

/** Smallest view that covers the whole map, centered, with the viewport's aspect. */
export function fitView(mapW: number, mapH: number, vpW: number, vpH: number): View {
  const unitsPerPx = Math.max(mapW / vpW, mapH / vpH);
  const w = vpW * unitsPerPx;
  const h = vpH * unitsPerPx;
  return { x: (mapW - w) / 2, y: (mapH - h) / 2, w, h };
}

/** Clamp zoom to [MIN_ZOOM, MAX_ZOOM] relative to base and keep the view
 *  inside base. */
export function clampView(view: View, base: View): View {
  const w = Math.min(Math.max(view.w, base.w / MAX_ZOOM), base.w / MIN_ZOOM);
  const h = w * (base.h / base.w);
  const x = Math.min(Math.max(view.x, base.x), base.x + base.w - w);
  const y = Math.min(Math.max(view.y, base.y), base.y + base.h - h);
  return { x, y, w, h };
}

/** The starting view: the zoom floor, centered on the map.
 *
 *  Centering has to be explicit. `clampView(base, base)` shrinks the view to
 *  the floor but leaves its top-left pinned to base's, and base's top-left is
 *  the corner of the letterboxed fit - negative on the axis that does not
 *  bind. In a window wider than the map's aspect that pinned the view against
 *  the west sea and cut the eastern lands off screen. */
export function homeView(base: View): View {
  const w = base.w / MIN_ZOOM;
  const h = base.h / MIN_ZOOM;
  return clampView(
    { x: base.x + (base.w - w) / 2, y: base.y + (base.h - h) / 2, w, h },
    base,
  );
}

export function panBy(view: View, base: View, dxPx: number, dyPx: number, vpW: number): View {
  const unitsPerPx = view.w / vpW;
  return clampView(
    { ...view, x: view.x - dxPx * unitsPerPx, y: view.y - dyPx * unitsPerPx },
    base,
  );
}

/** factor > 1 zooms in; (px, py) is the cursor position in viewport pixels. */
export function zoomAt(
  view: View,
  base: View,
  px: number,
  py: number,
  factor: number,
  vpW: number,
  vpH: number,
): View {
  const cx = view.x + (px / vpW) * view.w;
  const cy = view.y + (py / vpH) * view.h;
  const w = view.w / factor;
  const h = view.h / factor;
  return clampView(
    { x: cx - (px / vpW) * w, y: cy - (py / vpH) * h, w, h },
    base,
  );
}
