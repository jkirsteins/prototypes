import {
  actions,
  defaultActionMessage,
  items,
  rooms,
  unreachableSecondaryTargetMessage,
  unreachableTargetMessage,
  type ActionKey,
} from "./content";
import type { ActionResult, Command, Flag, GameItem, GameState, ItemId, Room } from "./types";

declare global {
  interface Array<T> {
    at(index: number): T | undefined;
  }
}

const initialFlags: Record<Flag, boolean> = {
  coffinLidLoosened: false,
  plaqueRemoved: false,
  hingeWedged: false,
  floorboardRevealed: false,
  wardrobeOpen: false,
  doorUnlatched: false,
  moonLockSeen: false,
  crescentRevealed: false,
  moonDialCrescent: false,
  roofHatchUnlocked: false,
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
  const visibleIds = new Set<ItemId>();
  const room = getCurrentRoom(state);

  for (const itemId of room.itemIds) {
    const item = items[itemId];

    if (!item.visibleWhen || state.flags[item.visibleWhen]) {
      visibleIds.add(itemId);
    }
  }

  for (const itemId of state.inventory) {
    visibleIds.add(itemId);
  }

  return [...visibleIds].map((itemId) => items[itemId]);
}

export function runCommand(state: GameState, command: Command): { state: GameState; result: ActionResult } {
  if (!canReachPrimaryTarget(state, command.targetId)) {
    return withMessage(state, unreachableTargetMessage);
  }

  if (command.verb === "Use" && !canReachSecondaryTarget(state, command.secondaryTargetId)) {
    return withMessage(state, unreachableSecondaryTargetMessage);
  }

  const guardedResult = getGuardedResult(state, command);
  const result = guardedResult ?? actions[toActionKey(command)] ?? { message: defaultActionMessage };

  return applyResult(state, result);
}

function canReachPrimaryTarget(state: GameState, itemId: ItemId): boolean {
  return getVisibleItemIds(state).has(itemId);
}

function canReachSecondaryTarget(state: GameState, itemId: ItemId): boolean {
  return getVisibleRoomItemIds(state).has(itemId);
}

function getVisibleItemIds(state: GameState): Set<ItemId> {
  return new Set(getVisibleItems(state).map((item) => item.id));
}

function getVisibleRoomItemIds(state: GameState): Set<ItemId> {
  const visibleIds = new Set<ItemId>();

  for (const itemId of getCurrentRoom(state).itemIds) {
    const item = items[itemId];

    if (!item.visibleWhen || state.flags[item.visibleWhen]) {
      visibleIds.add(itemId);
    }
  }

  return visibleIds;
}

function getGuardedResult(state: GameState, command: Command): ActionResult | undefined {
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

  if (command.verb === "Pull" && command.targetId === "chain") {
    if (!state.flags.moonDialCrescent) {
      return { message: "The chain rattles, but the moon mechanism stays locked." };
    }

    return {
      message: "The chain releases the moon lock inside the roof hatch.",
      setFlags: { roofHatchUnlocked: true },
    };
  }

  if (command.verb === "Open" && command.targetId === "roof-hatch") {
    if (!state.flags.roofHatchUnlocked) {
      return { message: "The roof hatch is still locked by the moon mechanism." };
    }

    return { message: "The roof hatch groans open, and cold roof air pours in." };
  }

  return undefined;
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
