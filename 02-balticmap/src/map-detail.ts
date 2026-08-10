/** Smallest a label may render before it is noise rather than a name. The one
 *  number the whole ladder rests on. */
export const MIN_LABEL_PX = 8;

export interface DetailLayer {
  /** Class put on the <svg> root to hide this layer. */
  hideClass: string;
  /** The style.css selector whose font-size sets this layer's threshold. The
   *  drift guard reads it back, so the size is declared once, in CSS. */
  selector: string;
  fontPx: number;
}

/** Ascending by font size, which IS the order they drop out in. */
export const DETAIL_LAYERS: readonly DetailLayer[] = [
  { hideClass: "hide-settlement-labels", selector: ".settlement-label", fontPx: 12 },
  { hideClass: "hide-river-labels", selector: ".label-river", fontPx: 16 },
  { hideClass: "hide-badges", selector: ".threat-badge .badge-text", fontPx: 18 },
  { hideClass: "hide-people-labels", selector: ".label-people", fontPx: 30 },
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
  let peopleHidden = false;
  for (const layer of DETAIL_LAYERS) {
    if (layer.fontPx * scale < MIN_LABEL_PX) {
      classes.push(layer.hideClass);
      if (layer.selector === ".label-people") peopleHidden = true;
    }
  }
  // Built from the same push, never a second threshold: the group layer's
  // visibility is a fact about the people layer's, not a scale of its own.
  if (peopleHidden) classes.push(GROUP_LABEL_CLASS);
  return classes;
}
