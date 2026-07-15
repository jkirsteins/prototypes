import type { ActionResult, GameItem, ItemId, Room, Verb } from "./types";

export type ActionKey =
  | `${Exclude<Verb, "Use">}:${ItemId}`
  | `Use:${ItemId}:${ItemId}`;

export const defaultActionMessage = "That does not seem useful right now.";
export const unreachableTargetMessage = "You cannot reach that from here.";
export const unreachableSecondaryTargetMessage = "You cannot use that here.";

export const items: Record<ItemId, GameItem> = {
  "coffin-lid": { id: "coffin-lid", label: "coffin lid" },
  "velvet-lining": { id: "velvet-lining", label: "velvet lining" },
  "brass-plaque": { id: "brass-plaque", label: "brass plaque", portable: true },
  "loose-nail": {
    id: "loose-nail",
    label: "loose nail",
    portable: true,
    visibleWhen: "coffinLidLoosened",
  },
  hinge: { id: "hinge", label: "hinge", visibleWhen: "plaqueRemoved" },
  "rosary-bead": { id: "rosary-bead", label: "rosary bead", visibleWhen: "coffinLidLoosened" },
  bed: { id: "bed", label: "bed" },
  nightstand: { id: "nightstand", label: "nightstand" },
  mirror: { id: "mirror", label: "mirror" },
  wardrobe: { id: "wardrobe", label: "wardrobe" },
  window: { id: "window", label: "window" },
  "locked-door": { id: "locked-door", label: "locked door" },
  "bell-pull": { id: "bell-pull", label: "bell pull" },
  "loose-floorboard": {
    id: "loose-floorboard",
    label: "loose floorboard",
    visibleWhen: "floorboardRevealed",
  },
  "small-iron-key": { id: "small-iron-key", label: "small iron key", portable: true },
  "moth-eaten-cloak": {
    id: "moth-eaten-cloak",
    label: "moth-eaten cloak",
    portable: true,
    visibleWhen: "wardrobeOpen",
  },
  "servant-note": { id: "servant-note", label: "servant note", visibleWhen: "wardrobeOpen" },
  upstairs: { id: "upstairs", label: "upstairs" },
  downstairs: { id: "downstairs", label: "downstairs" },
  "roof-hatch": { id: "roof-hatch", label: "roof hatch" },
  "rusted-crank": { id: "rusted-crank", label: "rusted crank" },
  "moon-dial": { id: "moon-dial", label: "moon dial" },
  "stained-glass": { id: "stained-glass", label: "stained glass" },
  chain: { id: "chain", label: "chain" },
  "basement-door": { id: "basement-door", label: "basement door" },
  keyhole: { id: "keyhole", label: "keyhole" },
  "iron-keyring": { id: "iron-keyring", label: "iron keyring" },
  "wine-rack": { id: "wine-rack", label: "wine rack" },
  "cold-draft": { id: "cold-draft", label: "cold draft" },
};

export const rooms: Record<Room["id"], Room> = {
  coffin: {
    id: "coffin",
    title: "Inside the Coffin",
    description:
      "You wake inside a coffin lined with velvet lining. A coffin lid presses close overhead, and a brass plaque glints in the stale dark.",
    itemIds: ["coffin-lid", "velvet-lining", "brass-plaque", "loose-nail", "hinge", "rosary-bead"],
  },
  bedroom: {
    id: "bedroom",
    title: "Guest Chamber",
    description:
      "A canopied bed faces a tarnished mirror. Beside it stand a nightstand, wardrobe, locked door, bell pull, and narrow window.",
    itemIds: [
      "bed",
      "nightstand",
      "mirror",
      "wardrobe",
      "window",
      "locked-door",
      "bell-pull",
      "loose-floorboard",
      "moth-eaten-cloak",
      "servant-note",
    ],
  },
  corridor: {
    id: "corridor",
    title: "Branching Corridor",
    description: "The corridor branches toward upstairs gloom and downstairs cold.",
    itemIds: ["upstairs", "downstairs"],
  },
  upstairs: {
    id: "upstairs",
    title: "Roof Hatch Landing",
    description:
      "A roof hatch waits above a landing of stained glass. A rusted crank, moon dial, and chain belong to the old mechanism.",
    itemIds: ["roof-hatch", "rusted-crank", "moon-dial", "stained-glass", "chain"],
  },
  downstairs: {
    id: "downstairs",
    title: "Basement Door",
    description:
      "The basement door is set beside a keyhole, iron keyring, wine rack, and a cold draft that leaks from below.",
    itemIds: ["basement-door", "keyhole", "iron-keyring", "wine-rack", "cold-draft"],
  },
};

export const actions: Partial<Record<ActionKey, ActionResult>> = {
  "Push:coffin-lid": {
    message: "The lid shifts a finger's width, then catches near the hinge.",
    setFlags: { coffinLidLoosened: true },
  },
  "Look at:velvet-lining": {
    message: "The velvet lining is torn around a bent loose nail.",
    setFlags: { coffinLidLoosened: true },
  },
  "Take:loose-nail": {
    message: "You work the loose nail free and pocket it.",
    addInventory: ["loose-nail"],
  },
  "Look at:brass-plaque": {
    message: "The brass plaque bears Count Veyr's crest. One corner is loose.",
  },
  "Use:loose-nail:brass-plaque": {
    message: "The nail pries the brass plaque free from the coffin wall.",
    addInventory: ["brass-plaque"],
    setFlags: { plaqueRemoved: true },
  },
  "Use:brass-plaque:hinge": {
    message: "You jam the brass plaque into the hinge gap until it holds fast.",
    setFlags: { hingeWedged: true },
  },
  "Open:coffin-lid": {
    message: "There is no handle on this side.",
  },
  "Use:loose-nail:coffin-lid": {
    message: "You scratch the wood, but gain no leverage.",
  },
  "Look at:mirror": {
    message: "The mirror reflects fresh scratches in the dust under the bed.",
  },
  "Look at:bed": {
    message: "Under the bed, scratches point to a loose floorboard.",
    setFlags: { floorboardRevealed: true },
  },
  "Open:loose-floorboard": {
    message: "The board lifts with a sigh, revealing a small iron key.",
    addInventory: ["small-iron-key"],
  },
  "Use:small-iron-key:wardrobe": {
    message: "The small iron key opens the wardrobe's tiny lock.",
    setFlags: { wardrobeOpen: true },
  },
  "Look at:wardrobe": {
    message: "The wardrobe creaks open, showing a moth-eaten cloak and a servant note.",
    setFlags: { wardrobeOpen: true },
  },
  "Take:moth-eaten-cloak": {
    message: "You take the moth-eaten cloak.",
    addInventory: ["moth-eaten-cloak"],
  },
  "Look at:servant-note": {
    message: "The servant note says the bell pull releases the corridor latch after midnight.",
  },
  "Pull:bell-pull": {
    message: "Somewhere inside the wall, the corridor latch clicks open.",
    setFlags: { doorUnlatched: true },
  },
  "Use:small-iron-key:locked-door": {
    message: "The key turns partway, then stops. It was made for something smaller.",
  },
  "Open:upstairs": {
    message: "You climb the stairs to a landing under the roof.",
    nextRoomId: "upstairs",
  },
  "Open:downstairs": {
    message: "You descend toward the cold below.",
    nextRoomId: "downstairs",
  },
  "Look at:roof-hatch": {
    message: "The roof hatch is sealed by a moon-phase lock.",
    setFlags: { moonLockSeen: true },
  },
  "Look at:stained-glass": {
    message: "Moonlight passes through the colored panes in broken shards.",
  },
  "Use:moth-eaten-cloak:stained-glass": {
    message: "You drape the cloak over the stained glass, leaving only a crescent tear of moonlight.",
    setFlags: { crescentRevealed: true },
  },
  "Turn:moon-dial": {
    message: "The moon dial clicks around to the crescent mark.",
    setFlags: { moonDialCrescent: true },
  },
  "Look at:basement-door": {
    message: "The basement door is heavy oak with a newer lock. It smells of earth and old water.",
  },
  "Look at:keyhole": {
    message: "The keyhole is long and thin. It needs a long silver key.",
  },
  "Take:iron-keyring": {
    message: "The iron keyring is fixed to the wall.",
  },
  "Use:small-iron-key:basement-door": {
    message: "The small iron key is the wrong shape for this lock.",
  },
  "Open:basement-door": {
    message: "The basement door is locked.",
  },
};
