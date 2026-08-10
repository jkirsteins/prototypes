/** Smallest a label may render before it is noise rather than a name. The one
 *  number the whole ladder rests on. */
export const MIN_LABEL_PX = 8;

/** Largest an AREA label may render before it has outgrown the ground it
 *  names. Only area layers opt in - see `DetailLayer.maxPx`. */
export const MAX_AREA_LABEL_PX = 30;

export interface DetailLayer {
  /** Class put on the <svg> root to hide this layer. */
  hideClass: string;
  /** The style.css selector whose font-size sets this layer's threshold. The
   *  drift guard reads it back, so the size is declared once, in CSS. */
  selector: string;
  fontPx: number;
  /** Legibility floor for this layer, in rendered px. Defaults to
   *  MIN_LABEL_PX. A POINT label (a settlement name, a river name) is doing
   *  its job as long as it can be read, so the shared floor is right for it.
   *  An AREA label (a people's name, spanning its territory) is doing a
   *  different job - naming a region, not a dot - and it has stopped doing
   *  that job well before it becomes illegible letter by letter. Its floor
   *  is therefore its own, set higher than the shared one. */
  minPx?: number;
  /** Legibility CEILING for this layer, in rendered px. Absent means none.
   *  Labels live in map space, so zooming in grows them without bound: at the
   *  zoom ceiling a people's name renders around 115px and sprawls across
   *  several lands, naming none of them. An area label is a heading over a
   *  territory, so it stops working once it has outgrown the territory just
   *  as surely as when it has shrunk below it. A POINT label has no ceiling -
   *  a settlement name growing with the land it stands on is the map getting
   *  closer, which is what zooming in is for. */
  maxPx?: number;
}

/** Ascending by font size, which IS the order they drop out in. */
export const DETAIL_LAYERS: readonly DetailLayer[] = [
  { hideClass: "hide-settlement-labels", selector: ".settlement-label", fontPx: 12 },
  { hideClass: "hide-river-labels", selector: ".label-river", fontPx: 16 },
  { hideClass: "hide-badges", selector: ".threat-badge .badge-text", fontPx: 18 },
  {
    hideClass: "hide-neighbor-labels", selector: ".label-neighbor", fontPx: 22,
    maxPx: MAX_AREA_LABEL_PX,
  },
  // An area heading, not a place name: once it has shrunk to ordinary-label
  // size it reads as cramped mush rather than a territory's name, well before
  // MIN_LABEL_PX would call it illegible. See the field's doc comments above.
  {
    hideClass: "hide-people-labels", selector: ".label-people", fontPx: 30,
    minPx: 12, maxPx: MAX_AREA_LABEL_PX,
  },
];

/** Shown exactly while the people labels are hidden, so the map is never
 *  wordless: the per-people names give way to a few large ones. */
export const GROUP_LABEL_CLASS = "show-group-labels";
export const GROUP_LABEL_SELECTOR = ".label-group";
export const GROUP_LABEL_PX = 64;

export const ALL_DETAIL_CLASSES: readonly string[] = [
  ...DETAIL_LAYERS.map((l) => l.hideClass),
  GROUP_LABEL_CLASS,
];

/** `scale` is viewport pixels per map unit. */
export function detailClassesAt(scale: number): string[] {
  const classes: string[] = [];
  let peopleTooSmall = false;
  for (const layer of DETAIL_LAYERS) {
    const rendered = layer.fontPx * scale;
    const tooSmall = rendered < (layer.minPx ?? MIN_LABEL_PX);
    const tooBig = layer.maxPx !== undefined && rendered > layer.maxPx;
    if (tooSmall || tooBig) classes.push(layer.hideClass);
    if (layer.selector === ".label-people" && tooSmall) peopleTooSmall = true;
  }
  // Built from the same pass, never a second threshold: the group layer's
  // visibility is a fact about the people layer's, not a scale of its own.
  //
  // Keyed to TOO SMALL and not to hidden-for-any-reason. The people labels
  // also go when zoomed far IN, and answering that by raising a 64px label
  // would put the largest text on the map exactly where the map is already
  // closest - the opposite of what the swap is for.
  if (peopleTooSmall) classes.push(GROUP_LABEL_CLASS);
  return classes;
}
