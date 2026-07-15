import type { ActionResult, GameItem, ItemId, Room, Verb } from "./types";

export type ActionKey =
  | `${Exclude<Verb, "Use">}:${ItemId}`
  | `Use:${ItemId}:${ItemId}`;

export const defaultActionMessage = "That does not seem useful right now.";
export const unreachableTargetMessage = "You cannot reach that from here.";
export const unreachableSecondaryTargetMessage = "You cannot use that here.";

export const items: Record<ItemId, GameItem> = {
  "coffin-lid": {
    id: "coffin-lid",
    label: "coffin lid",
    description: "The lid is close enough to bruise your knuckles. It catches near one hinge.",
  },
  "velvet-lining": {
    id: "velvet-lining",
    label: "velvet lining",
    description: "The velvet is old, dusty, and torn near your shoulder.",
  },
  "brass-plaque": {
    id: "brass-plaque",
    label: "brass plaque",
    description: "The plaque bears Count Veyr's crest. One corner is loose.",
    portable: true,
  },
  "loose-nail": {
    id: "loose-nail",
    label: "loose nail",
    description: "A bent nail with a sharp enough point to worry soft metal.",
    portable: true,
    visibleWhen: "liningInspected",
  },
  hinge: {
    id: "hinge",
    label: "hinge",
    description: "The hinge is strained and slightly exposed where the plaque came free.",
    visibleWhen: "plaqueRemoved",
  },
  "rosary-bead": {
    id: "rosary-bead",
    label: "rosary bead",
    description: "A single rosary bead is sewn into the lining. It is warm against your fingertip.",
    visibleWhen: "liningInspected",
  },
  bed: {
    id: "bed",
    label: "bed",
    description: "The bed is neatly made, but fresh scratches mark the dust beneath it.",
  },
  nightstand: {
    id: "nightstand",
    label: "nightstand",
    description: "The nightstand is empty except for a ring of dark wax.",
  },
  mirror: {
    id: "mirror",
    label: "mirror",
    description: "The tarnished mirror refuses a clean reflection and catches odd angles of the room.",
  },
  wardrobe: {
    id: "wardrobe",
    label: "wardrobe",
    description: "The wardrobe is narrow, old, and fitted with a tiny lock below the handle.",
  },
  window: {
    id: "window",
    label: "window",
    description: "The narrow window shows only black sky and the suggestion of a long drop.",
  },
  "locked-door": {
    id: "locked-door",
    label: "locked door",
    description: "The door is reinforced from the corridor side. The lock is only part of the problem.",
  },
  "bell-pull": {
    id: "bell-pull",
    label: "bell pull",
    description: "The velvet pull cord disappears into a brass fitting in the wall.",
  },
  "loose-floorboard": {
    id: "loose-floorboard",
    label: "loose floorboard",
    description: "The board sits proud of the others, with dust rubbed away along one edge.",
    visibleWhen: "floorboardRevealed",
  },
  "small-iron-key": {
    id: "small-iron-key",
    label: "small iron key",
    description: "A small iron key, too delicate for the room door.",
    portable: true,
  },
  "moth-eaten-cloak": {
    id: "moth-eaten-cloak",
    label: "moth-eaten cloak",
    description: "The cloak is heavy, dusty, and torn into a crescent-shaped bite near the hem.",
    portable: true,
    visibleWhen: "wardrobeOpen",
  },
  "servant-note": {
    id: "servant-note",
    label: "servant note",
    description: "The note says the bell pull releases the corridor latch after midnight.",
    visibleWhen: "wardrobeOpen",
  },
  upstairs: {
    id: "upstairs",
    label: "upstairs",
    description: "The upper stair bends toward moonlight and colder air.",
  },
  downstairs: {
    id: "downstairs",
    label: "downstairs",
    description: "The lower stair sinks into damp stone darkness.",
  },
  "roof-hatch": {
    id: "roof-hatch",
    label: "roof hatch",
    description: "The hatch is thick oak, sealed by a moon-phase mechanism.",
  },
  "rusted-crank": {
    id: "rusted-crank",
    label: "rusted crank",
    description: "The crank is stiff with rust and connected to the hatch frame.",
  },
  "moon-dial": {
    id: "moon-dial",
    label: "moon dial",
    description: "The dial is marked with new, crescent, half, and full moons.",
  },
  "stained-glass": {
    id: "stained-glass",
    label: "stained glass",
    description: "Colored panes scatter moonlight across the landing.",
  },
  chain: {
    id: "chain",
    label: "chain",
    description: "The chain hangs from the hatch mechanism, waiting for the lock to align.",
  },
  "basement-door": {
    id: "basement-door",
    label: "basement door",
    description: "The basement door is heavy oak with a newer lock. It smells of earth and old water.",
  },
  keyhole: {
    id: "keyhole",
    label: "keyhole",
    description: "The keyhole is long and thin. It needs a long silver key.",
  },
  "iron-keyring": {
    id: "iron-keyring",
    label: "iron keyring",
    description: "The iron keyring is bolted to the wall, more decoration than help.",
  },
  "wine-rack": {
    id: "wine-rack",
    label: "wine rack",
    description: "The wine rack holds dusty bottles with labels too faded to trust.",
  },
  "cold-draft": {
    id: "cold-draft",
    label: "cold draft",
    description: "The draft carries wet stone, old soil, and something metallic.",
  },
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
    setFlags: { liningInspected: true },
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
    message: "The wardrobe is locked. A tiny keyhole waits below the handle.",
  },
  "Take:moth-eaten-cloak": {
    message: "You take the moth-eaten cloak.",
    addInventory: ["moth-eaten-cloak"],
  },
  "Look at:servant-note": {
    message: "The servant note says the bell pull releases the corridor latch after midnight.",
    setFlags: { servantNoteRead: true },
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
