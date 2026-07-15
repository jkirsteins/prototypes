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
    kind: "door",
  },
  "velvet-lining": {
    id: "velvet-lining",
    label: "velvet lining",
    description: "The velvet is old, dusty, and torn near your shoulder.",
    kind: "fixed",
  },
  "brass-plaque": {
    id: "brass-plaque",
    label: "brass plaque",
    description: "The plaque bears Count Veyr's crest. One corner is loose.",
    kind: "portable",
    portable: true,
  },
  "loose-nail": {
    id: "loose-nail",
    label: "loose nail",
    description: "A bent nail with a sharp enough point to worry soft metal.",
    kind: "portable",
    portable: true,
    visibleWhen: "liningInspected",
  },
  hinge: {
    id: "hinge",
    label: "hinge",
    description: "The hinge is strained and slightly exposed where the plaque came free.",
    kind: "mechanism",
    visibleWhen: "plaqueRemoved",
  },
  "rosary-bead": {
    id: "rosary-bead",
    label: "rosary bead",
    description: "A single rosary bead is sewn into the lining. It is warm against your fingertip.",
    kind: "fixed",
    visibleWhen: "liningInspected",
  },
  bed: {
    id: "bed",
    label: "bed",
    description: "The bed is neatly made, but fresh scratches mark the dust beneath it.",
    kind: "fixed",
  },
  nightstand: {
    id: "nightstand",
    label: "nightstand",
    description: "The nightstand is empty except for a ring of dark wax.",
    kind: "container",
  },
  mirror: {
    id: "mirror",
    label: "mirror",
    description: "The tarnished mirror refuses a clean reflection and catches odd angles of the room.",
    kind: "fixed",
  },
  wardrobe: {
    id: "wardrobe",
    label: "wardrobe",
    description: "The wardrobe is narrow, old, and fitted with a tiny lock below the handle.",
    kind: "container",
  },
  window: {
    id: "window",
    label: "window",
    description: "The narrow window shows only black sky and the suggestion of a long drop.",
    kind: "fixed",
  },
  "locked-door": {
    id: "locked-door",
    label: "locked door",
    description: "The door is reinforced from the corridor side. The lock is only part of the problem.",
    kind: "door",
  },
  "bell-pull": {
    id: "bell-pull",
    label: "bell pull",
    description: "The velvet pull cord disappears into a brass fitting in the wall.",
    kind: "mechanism",
  },
  "loose-floorboard": {
    id: "loose-floorboard",
    label: "loose floorboard",
    description: "The board sits proud of the others, with dust rubbed away along one edge.",
    kind: "container",
    visibleWhen: "floorboardRevealed",
  },
  "small-iron-key": {
    id: "small-iron-key",
    label: "small iron key",
    description: "A small iron key, too delicate for the room door.",
    kind: "portable",
    portable: true,
  },
  "moth-eaten-cloak": {
    id: "moth-eaten-cloak",
    label: "moth-eaten cloak",
    description: "The cloak is heavy, dusty, and torn into a crescent-shaped bite near the hem.",
    kind: "portable",
    portable: true,
    visibleWhen: "wardrobeOpen",
  },
  "servant-note": {
    id: "servant-note",
    label: "servant note",
    description: "The note says the bell pull releases the corridor latch after midnight.",
    kind: "fixed",
    visibleWhen: "wardrobeOpen",
  },
  "guest-chamber": {
    id: "guest-chamber",
    label: "guest chamber",
    description: "The guest chamber is back through the opened door.",
    kind: "route",
  },
  "branching-corridor": {
    id: "branching-corridor",
    label: "branching corridor",
    description: "The corridor remains open through the released latch.",
    kind: "route",
    visibleWhen: "doorUnlatched",
  },
  upstairs: {
    id: "upstairs",
    label: "upstairs",
    description: "The upper stair bends toward moonlight and colder air.",
    kind: "route",
  },
  downstairs: {
    id: "downstairs",
    label: "downstairs",
    description: "The lower stair sinks into damp stone darkness.",
    kind: "route",
  },
  "roof-hatch": {
    id: "roof-hatch",
    label: "roof hatch",
    description: "The hatch is thick oak, sealed by a moon-phase mechanism.",
    kind: "door",
  },
  "rusted-crank": {
    id: "rusted-crank",
    label: "rusted crank",
    description: "The crank is stiff with rust and connected to the hatch frame.",
    kind: "mechanism",
  },
  "moon-dial": {
    id: "moon-dial",
    label: "moon dial",
    description: "The dial is marked with new, crescent, half, and full moons.",
    kind: "mechanism",
  },
  "stained-glass": {
    id: "stained-glass",
    label: "stained glass",
    description: "Colored panes scatter moonlight across the landing.",
    kind: "fixed",
  },
  chain: {
    id: "chain",
    label: "chain",
    description: "The chain hangs from the hatch mechanism, waiting for the lock to align.",
    kind: "mechanism",
  },
  "basement-door": {
    id: "basement-door",
    label: "basement door",
    description: "The basement door is heavy oak with a newer lock. It smells of earth and old water.",
    kind: "door",
  },
  keyhole: {
    id: "keyhole",
    label: "keyhole",
    description: "The keyhole is long and thin. It needs a long silver key.",
    kind: "fixed",
  },
  "iron-keyring": {
    id: "iron-keyring",
    label: "iron keyring",
    description: "The iron keyring is bolted to the wall, more decoration than help.",
    kind: "fixed",
  },
  "wine-rack": {
    id: "wine-rack",
    label: "wine rack",
    description: "The wine rack holds dusty bottles with labels too faded to trust.",
    kind: "container",
  },
  "cold-draft": {
    id: "cold-draft",
    label: "cold draft",
    description: "The draft carries wet stone, old soil, and something metallic.",
    kind: "intangible",
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
      "branching-corridor",
      "loose-floorboard",
      "moth-eaten-cloak",
      "servant-note",
    ],
  },
  corridor: {
    id: "corridor",
    title: "Branching Corridor",
    description: "The corridor branches toward upstairs gloom and downstairs cold. The guest chamber door stays open behind you.",
    itemIds: ["guest-chamber", "upstairs", "downstairs"],
  },
  upstairs: {
    id: "upstairs",
    title: "Roof Hatch Landing",
    description:
      "A roof hatch waits above a landing of stained glass. A rusted crank, moon dial, and chain belong to the old mechanism. The branching corridor lies back below.",
    itemIds: ["branching-corridor", "roof-hatch", "rusted-crank", "moon-dial", "stained-glass", "chain"],
  },
  downstairs: {
    id: "downstairs",
    title: "Basement Door",
    description:
      "The basement door is set beside a keyhole, iron keyring, wine rack, and a cold draft that leaks from below. The branching corridor waits up the stairs.",
    itemIds: ["branching-corridor", "basement-door", "keyhole", "iron-keyring", "wine-rack", "cold-draft"],
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
  "Pull:coffin-lid": {
    message: "Your fingers scrape against the lid, but there is nothing to grip.",
  },
  "Turn:coffin-lid": {
    message: "You cannot turn a coffin lid from inside it. The thought is briefly impressive.",
  },
  "Open:velvet-lining": {
    message: "You pull at the torn velvet and find only coffin wood beneath.",
  },
  "Pull:velvet-lining": {
    message: "The velvet tears wider, but the coffin remains stubbornly coffin-shaped.",
  },
  "Take:brass-plaque": {
    message: "The plaque is still fastened to the coffin wall. One loose corner begs for a tool.",
  },
  "Open:brass-plaque": {
    message: "It is a plaque, not a hatch, though one corner is loose.",
  },
  "Take:rosary-bead": {
    message: "The rosary bead is sewn into the lining too tightly to take.",
  },
  "Open:rosary-bead": {
    message: "The bead has no seam, latch, or tiny secret compartment, despite your optimism.",
  },
  "Use:rosary-bead:coffin-lid": {
    message: "The bead warms in your palm, but the coffin lid does not care.",
  },
  "Use:loose-nail:hinge": {
    message: "The nail scratches the hinge, but it is too small to hold the gap.",
  },
  "Use:brass-plaque:coffin-lid": {
    message: "The plaque slides off the lid. It needs a narrower place to wedge.",
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
  "Open:bed": {
    message: "You lift the bedding. No vampire, no trapdoor, just dramatic dust.",
  },
  "Open:nightstand": {
    message: "The nightstand drawer is empty except for a ring of dark wax.",
  },
  "Open:window": {
    message: "The window is stuck fast, and the drop outside argues against enthusiasm.",
  },
  "Pull:loose-floorboard": {
    message: "You tug the raised edge. It wants to open upward.",
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
  "Open:wardrobe": {
    message: "The wardrobe handle rattles, but the tiny lock holds.",
  },
  "Take:moth-eaten-cloak": {
    message: "You take the moth-eaten cloak.",
    addInventory: ["moth-eaten-cloak"],
  },
  "Take:servant-note": {
    message: "The servant note flakes at the edges, so you leave it and memorize the important part.",
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
  "Open:guest-chamber": {
    message: "You step back into the guest chamber.",
    nextRoomId: "bedroom",
  },
  "Open:branching-corridor": {
    message: "You return to the branching corridor.",
    nextRoomId: "corridor",
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
  "Open:stained-glass": {
    message: "The stained glass is leaded into the wall, not hinged.",
  },
  "Use:moth-eaten-cloak:stained-glass": {
    message: "You drape the cloak over the stained glass, leaving only a crescent tear of moonlight.",
    setFlags: { crescentRevealed: true },
  },
  "Use:moth-eaten-cloak:roof-hatch": {
    message: "You flap the cloak at the hatch. The hatch remains unmoved, but somehow judged.",
  },
  "Use:moth-eaten-cloak:chain": {
    message: "The cloak catches on the chain and sheds a century of dust.",
  },
  "Use:moth-eaten-cloak:moon-dial": {
    message: "The cloak covers the dial without changing what phase it points to.",
  },
  "Turn:rusted-crank": {
    message: "The crank gives one theatrical squeal and refuses to turn further.",
  },
  "Pull:rusted-crank": {
    message: "The crank is fixed into the hatch frame and stays there.",
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
  "Open:keyhole": {
    message: "You peer into the keyhole. Darkness peers back, professionally.",
  },
  "Take:keyhole": {
    message: "The keyhole is an absence of metal. There is nothing to pocket.",
  },
  "Take:iron-keyring": {
    message: "The iron keyring is fixed to the wall.",
  },
  "Pull:iron-keyring": {
    message: "The iron keyring clanks against its bolt and goes nowhere.",
  },
  "Use:iron-keyring:basement-door": {
    message: "The keyring is fixed to the wall, which limits its career as a key.",
  },
  "Use:iron-keyring:keyhole": {
    message: "The keyring cannot reach the keyhole and contains no actual key.",
  },
  "Use:small-iron-key:basement-door": {
    message: "The small iron key is the wrong shape for this lock.",
  },
  "Open:basement-door": {
    message: "The basement door is locked.",
  },
  "Push:basement-door": {
    message: "The basement door absorbs the shove with unfair confidence.",
  },
  "Pull:basement-door": {
    message: "The door pulls against its lock and stops dead.",
  },
  "Open:wine-rack": {
    message: "The rack has no door. Its bottles sit exposed and suspicious.",
  },
  "Take:wine-rack": {
    message: "The wine rack is built into the stone. Also, it is mostly splinters.",
  },
};
