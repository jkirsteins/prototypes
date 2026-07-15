export const verbs = ["Look at", "Use", "Take", "Open", "Push", "Pull", "Turn"] as const;

export type Verb = (typeof verbs)[number];

export type ItemId =
  | "coffin-lid"
  | "velvet-lining"
  | "brass-plaque"
  | "loose-nail"
  | "hinge"
  | "rosary-bead"
  | "bed"
  | "nightstand"
  | "mirror"
  | "wardrobe"
  | "window"
  | "locked-door"
  | "bell-pull"
  | "loose-floorboard"
  | "small-iron-key"
  | "moth-eaten-cloak"
  | "servant-note"
  | "upstairs"
  | "downstairs"
  | "roof-hatch"
  | "rusted-crank"
  | "moon-dial"
  | "stained-glass"
  | "chain"
  | "basement-door"
  | "keyhole"
  | "iron-keyring"
  | "wine-rack"
  | "cold-draft";

export type RoomId = "coffin" | "bedroom" | "corridor" | "upstairs" | "downstairs";

export type Flag =
  | "coffinLidLoosened"
  | "plaqueRemoved"
  | "hingeWedged"
  | "floorboardRevealed"
  | "wardrobeOpen"
  | "servantNoteRead"
  | "doorUnlatched"
  | "moonLockSeen"
  | "crescentRevealed"
  | "moonDialCrescent"
  | "roofHatchUnlocked";

export type GameItem = {
  id: ItemId;
  label: string;
  description: string;
  portable?: boolean;
  visibleWhen?: Flag;
};

export type Room = {
  id: RoomId;
  title: string;
  description: string;
  itemIds: ItemId[];
};

export type GameState = {
  roomId: RoomId;
  inventory: ItemId[];
  flags: Record<Flag, boolean>;
  log: string[];
};

export type Command =
  | { verb: Exclude<Verb, "Use">; targetId: ItemId }
  | { verb: "Use"; targetId: ItemId; secondaryTargetId: ItemId };

export type ActionResult = {
  message: string;
  nextRoomId?: RoomId;
  addInventory?: ItemId[];
  removeInventory?: ItemId[];
  setFlags?: Partial<Record<Flag, boolean>>;
};
