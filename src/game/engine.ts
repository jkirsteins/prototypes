import {
  actions,
  items,
  rooms,
  unreachableSecondaryTargetMessage,
  unreachableTargetMessage,
  type ActionKey,
} from "./content";
import type { ActionResult, Command, Flag, GameItem, GameState, ItemId, Room } from "./types";

const initialFlags: Record<Flag, boolean> = {
  coffinLidLoosened: false,
  liningInspected: false,
  plaqueRemoved: false,
  hingeWedged: false,
  floorboardRevealed: false,
  wardrobeOpen: false,
  servantNoteRead: false,
  doorUnlatched: false,
  moonLockSeen: false,
  crescentRevealed: false,
  moonDialCrescent: false,
  roofHatchUnlocked: false,
  roofHatchOpen: false,
};

export function createInitialState(): GameState {
  return {
    roomId: "coffin",
    inventory: [],
    flags: { ...initialFlags },
    log: [],
  };
}

export function getCurrentRoom(state: GameState): Room {
  return rooms[state.roomId];
}

export function getVisibleItems(state: GameState): GameItem[] {
  return getVisibleRoomItems(state);
}

export function getVisibleRoomItems(state: GameState): GameItem[] {
  const visibleIds = new Set<ItemId>();
  const room = getCurrentRoom(state);

  for (const itemId of room.itemIds) {
    const item = items[itemId];

    if ((!item.visibleWhen || state.flags[item.visibleWhen]) && !state.inventory.includes(itemId)) {
      visibleIds.add(itemId);
    }
  }

  return [...visibleIds].map((itemId) => items[itemId]);
}

export function runCommand(state: GameState, command: Command): { state: GameState; result: ActionResult } {
  if (!canReachPrimaryTarget(state, command.targetId)) {
    return withMessage(state, unreachableTargetMessage);
  }

  if (command.verb === "Use" && isUntakenPortablePrimaryTarget(state, command.targetId)) {
    return withMessage(state, unreachableTargetMessage);
  }

  if (command.verb === "Use" && !canReachSecondaryTarget(state, command.secondaryTargetId)) {
    return withMessage(state, unreachableSecondaryTargetMessage);
  }

  const guardedResult = getGuardedResult(state, command);
  const result = guardedResult ?? actions[toActionKey(command)] ?? getDefaultResult(command);

  return applyResult(state, result);
}

function canReachPrimaryTarget(state: GameState, itemId: ItemId): boolean {
  return getVisibleRoomItemIds(state).has(itemId) || state.inventory.includes(itemId);
}

function canReachSecondaryTarget(state: GameState, itemId: ItemId): boolean {
  return getVisibleRoomItemIds(state).has(itemId);
}

function isUntakenPortablePrimaryTarget(state: GameState, itemId: ItemId): boolean {
  return Boolean(items[itemId].portable) && !state.inventory.includes(itemId);
}

function getVisibleRoomItemIds(state: GameState): Set<ItemId> {
  const visibleIds = new Set<ItemId>();

  for (const itemId of getCurrentRoom(state).itemIds) {
    const item = items[itemId];

    if ((!item.visibleWhen || state.flags[item.visibleWhen]) && !state.inventory.includes(itemId)) {
      visibleIds.add(itemId);
    }
  }

  return visibleIds;
}

function getGuardedResult(state: GameState, command: Command): ActionResult | undefined {
  if (command.verb === "Take" && state.inventory.includes(command.targetId)) {
    return { message: `You already have the ${items[command.targetId].label}.` };
  }

  if (command.verb === "Open" && command.targetId === "loose-floorboard" && state.inventory.includes("small-iron-key")) {
    return { message: "The loose floorboard is already open, and the gap beneath it is empty." };
  }

  if (command.verb === "Use" && command.targetId === "small-iron-key" && command.secondaryTargetId === "wardrobe" && state.flags.wardrobeOpen) {
    return { message: "The wardrobe is already unlocked and open." };
  }

  if (command.verb === "Open" && command.targetId === "wardrobe" && state.flags.wardrobeOpen) {
    return { message: "The wardrobe is already open. The cloak and note are inside." };
  }

  if (command.verb === "Use" && command.targetId === "brass-plaque" && command.secondaryTargetId === "hinge" && state.flags.hingeWedged) {
    return { message: "The brass plaque is already wedged firmly into the hinge gap." };
  }

  if (command.verb === "Pull" && command.targetId === "bell-pull" && state.flags.doorUnlatched) {
    return { message: "The bell pull hangs slack. The corridor latch is already released." };
  }

  if (command.verb === "Use" && command.targetId === "moth-eaten-cloak" && command.secondaryTargetId === "stained-glass" && state.flags.crescentRevealed) {
    return { message: "The cloak is already draped over the stained glass, leaving a crescent of moonlight." };
  }

  if (command.verb === "Turn" && command.targetId === "moon-dial" && state.flags.moonDialCrescent) {
    return { message: "The moon dial is already aligned to the crescent mark." };
  }

  if (command.verb === "Push" && command.targetId === "coffin-lid" && state.flags.hingeWedged) {
    return {
      message: "The wedged hinge snaps. You shove the coffin lid open and tumble into a guest chamber.",
      nextRoomId: "bedroom",
    };
  }

  if (command.verb === "Open" && command.targetId === "locked-door") {
    if (!state.flags.doorUnlatched) {
      return { message: "The locked door will not budge." };
    }

    return {
      message: "The released latch gives way, and you step into a branching corridor.",
      nextRoomId: "corridor",
    };
  }

  if (command.verb === "Look at" && command.targetId === "wardrobe" && state.flags.wardrobeOpen) {
    return { message: "Inside the wardrobe hang a moth-eaten cloak and a servant note." };
  }

  if (command.verb === "Pull" && command.targetId === "bell-pull" && !state.flags.servantNoteRead) {
    return { message: "The bell pull twitches, but you do not hear any servant coming." };
  }

  if (command.verb === "Pull" && command.targetId === "chain") {
    if (state.flags.roofHatchUnlocked) {
      return { message: "The chain hangs loose. The moon lock is already released." };
    }

    if (!state.flags.moonDialCrescent) {
      return { message: "The chain rattles, but the moon mechanism stays locked." };
    }

    if (!state.flags.crescentRevealed) {
      return { message: "The chain rattles, but the moonlight has not revealed the lock's crescent." };
    }

    return {
      message: "The chain releases the moon lock inside the roof hatch.",
      setFlags: { roofHatchUnlocked: true },
    };
  }

  if (command.verb === "Open" && command.targetId === "roof-hatch") {
    if (state.flags.roofHatchOpen) {
      return { message: "The roof hatch is already open, and your trial-sized destiny waits outside." };
    }

    if (!state.flags.roofHatchUnlocked) {
      return { message: "The roof hatch is still locked by the moon mechanism." };
    }

    return {
      message:
        "The roof hatch flies open. You stagger into the moonlight, cape-less, coffin-sore, and legally distinct from several better-funded adventurers.\n\nCONGRATULATIONS, CASTLE ESCAPIST!\nYou have completed this trial-sized portion of BLOODKEEP ADVENTURE DISK ONE.\nTo continue swashing buckles, dodging vampires, and discovering why every castle has this many keys, call:\n\n1-800-BUY-A-GAME\n\nOperators are standing by in shoulder pads. Have your parents' credit card ready.",
      setFlags: { roofHatchOpen: true },
    };
  }

  return undefined;
}

function getDefaultResult(command: Command): ActionResult {
  if (command.verb === "Look at") {
    return { message: items[command.targetId].description };
  }

  if (command.verb === "Use") {
    return {
      message: `You try the ${items[command.targetId].label} with the ${items[command.secondaryTargetId].label}, but castle logic declines the offer.`,
    };
  }

  return { message: getKindDefaultMessage(command.verb, items[command.targetId]) };
}

function getKindDefaultMessage(verb: Exclude<Command["verb"], "Look at" | "Use">, item: GameItem): string {
  if (verb === "Take" && item.kind === "portable") {
    return `You cannot get a proper grip on the ${item.label} from here.`;
  }

  if (verb === "Take" && item.kind === "route") {
    return `You cannot take the ${item.label}; you can only go that way.`;
  }

  if (verb === "Take" && item.kind === "intangible") {
    return `You wave a hand through the ${item.label}. It refuses to become luggage.`;
  }

  if (verb === "Take") {
    return `The ${item.label} is fixed in place.`;
  }

  if (item.kind === "route") {
    return verb === "Open"
      ? `You need to choose where to go, not open the ${item.label} like furniture.`
      : `The ${item.label} is a way forward, not something to ${verb.toLowerCase()}.`;
  }

  if (item.kind === "intangible") {
    return `You cannot ${verb.toLowerCase()} the ${item.label}; it is more atmosphere than object.`;
  }

  if (item.kind === "container" && verb === "Open") {
    return `You check the ${item.label}, but it offers no new hiding place.`;
  }

  if (item.kind === "door" && verb === "Open") {
    return `The ${item.label} does not open from this approach.`;
  }

  if (item.kind === "mechanism") {
    return `The ${item.label} resists that particular bit of engineering.`;
  }

  return `You ${verb.toLowerCase()} the ${item.label}, achieving mostly noise.`;
}

function toActionKey(command: Command): ActionKey {
  if (command.verb === "Use") {
    return `${command.verb}:${command.targetId}:${command.secondaryTargetId}`;
  }

  return `${command.verb}:${command.targetId}`;
}

function applyResult(state: GameState, result: ActionResult): { state: GameState; result: ActionResult } {
  const inventory = new Set(state.inventory);

  for (const itemId of result.removeInventory ?? []) {
    inventory.delete(itemId);
  }

  for (const itemId of result.addInventory ?? []) {
    if (items[itemId].portable) {
      inventory.add(itemId);
    }
  }

  return {
    state: {
      roomId: result.nextRoomId ?? state.roomId,
      inventory: [...inventory],
      flags: { ...state.flags, ...result.setFlags },
      log: [...state.log, result.message],
    },
    result,
  };
}

function withMessage(state: GameState, message: string): { state: GameState; result: ActionResult } {
  return applyResult(state, { message });
}
