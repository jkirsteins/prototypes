import type { Effect, GameState } from "./types";

export interface ExchangeMods {
  negated: boolean;
  damageFactor: number;
  interposed: boolean;
  coercionStripped: boolean;
  runLost: boolean;
}

export function newMods(): ExchangeMods {
  return {
    negated: false,
    damageFactor: 1,
    interposed: false,
    coercionStripped: false,
    runLost: false,
  };
}

export function bondMultiplier(bond: number): number {
  if (bond >= 3) return 2;
  if (bond >= 1) return 1;
  return 0;
}

const WILLPOWER_CAP = 10;

function changeWillpower(
  state: GameState,
  target: "player" | "convict",
  amount: number,
  cause: string,
  deltas: string[],
): void {
  const actor = target === "player" ? state.player : state.convict;
  const before = actor.willpower;
  actor.willpower = Math.max(0, Math.min(WILLPOWER_CAP, before + amount));
  const change = actor.willpower - before;
  if (change === 0) return;
  const magnitude = Math.abs(change);
  const current = state.stats.largestWillpowerSwing;
  if (target === "player" && change < 0 && (current === null || magnitude > current.amount)) {
    state.stats.largestWillpowerSwing = { amount: magnitude, cause };
  }
  deltas.push(`${target === "player" ? "Your" : "His"} willpower ${change > 0 ? "+" : ""}${change}`);
}

function applyDamage(
  state: GameState,
  effect: Extract<Effect, { kind: "damage" }>,
  mods: ExchangeMods,
  deltas: string[],
): void {
  let amount = effect.amount;
  if (effect.offBalanceBonus !== undefined && effect.target === "convict" && state.convict.offBalance) {
    amount += effect.offBalanceBonus;
    state.convict.offBalance = false;
    deltas.push("He was off-balance");
  }
  amount = Math.ceil(amount * mods.damageFactor);
  if (amount <= 0) return;

  let target = effect.target;
  if (target === "wife" && mods.interposed) return;

  if (target === "convict") {
    state.convict.vigor = Math.max(0, state.convict.vigor - amount);
    deltas.push(`His vigor -${amount}`);
    if (state.convict.vigor === 0) state.convict.incapacitated = true;
    return;
  }
  if (target === "player") {
    state.player.vigor = Math.max(0, state.player.vigor - amount);
    deltas.push(`Your vigor -${amount}`);
    return;
  }
  state.wife.vigor = Math.max(0, state.wife.vigor - amount);
  state.stats.wifeLowestVigor = Math.min(state.stats.wifeLowestVigor, state.wife.vigor);
  deltas.push(`Her vigor -${amount}`);
  const cost = amount * bondMultiplier(state.wife.bond);
  if (cost > 0) changeWillpower(state, "player", -cost, "watching her get hurt", deltas);
}

function applyCommon(
  state: GameState,
  effect: Effect,
  mods: ExchangeMods,
  deltas: string[],
  cause: string,
): void {
  switch (effect.kind) {
    case "damage":
      applyDamage(state, effect, mods, deltas);
      break;
    case "willpower":
      changeWillpower(state, effect.target, effect.amount, cause, deltas);
      break;
    case "restoreWillpowerTo":
      state.player.willpower = effect.value;
      deltas.push(`Your willpower steadies at ${effect.value}`);
      break;
    case "setBound":
      state.player.bound = effect.value;
      deltas.push(effect.value ? "You are bound" : "Your hands are free");
      break;
    case "setToppled":
      state.player.toppled = effect.value;
      deltas.push(effect.value ? "You are on the floor" : "You are upright");
      break;
    case "setDistracted":
      state.convict.distracted = Math.max(state.convict.distracted, effect.turns);
      deltas.push(`He is distracted (${state.convict.distracted})`);
      break;
    case "setOffBalance":
      state.convict.offBalance = effect.value;
      if (effect.value) deltas.push("He is off-balance");
      break;
    case "setWeaponDown":
      state.convict.weaponDown = effect.value;
      deltas.push(effect.value ? "His knife is on the floor" : "He is armed again");
      break;
    case "setRange":
      state.scene.range = effect.value;
      deltas.push(effect.value === "near" ? "He is close" : "He moves away");
      break;
    case "setZone":
      state.scene.zone = effect.value;
      deltas.push(effect.value === "bedroom" ? "You are in the bedroom" : "You are in the living room");
      break;
    case "bindOrHurt":
      if (!state.player.bound) {
        state.player.bound = true;
        deltas.push("You are bound again");
      } else {
        applyDamage(state, { kind: "damage", target: "player", amount: effect.amount }, mods, deltas);
      }
      break;
    case "reviveConvict":
      state.convict.vigor = effect.vigor;
      state.convict.incapacitated = false;
      deltas.push(`He is back up at ${effect.vigor} vigor`);
      break;
    case "negateLead":
      mods.negated = true;
      break;
    case "halveIncomingDamage":
      mods.damageFactor = 0.5;
      break;
    case "interposeForWife":
      mods.interposed = true;
      applyDamage(
        state,
        { kind: "damage", target: "player", amount: effect.selfDamage },
        newMods(),
        deltas,
      );
      break;
    case "stripCoercion":
      mods.coercionStripped = true;
      break;
    case "loseRun":
      mods.runLost = true;
      break;
  }
}

export function applyAnswerEffect(
  state: GameState,
  effect: Effect,
  mods: ExchangeMods,
  cause = "the exchange",
): string[] {
  const deltas: string[] = [];
  applyCommon(state, effect, mods, deltas, cause);
  return deltas;
}

export function applyLeadEffect(
  state: GameState,
  effect: Effect,
  mods: ExchangeMods,
  cause = "the exchange",
): string[] {
  if (mods.negated) return [];
  const deltas: string[] = [];
  applyCommon(state, effect, mods, deltas, cause);
  return deltas;
}
