import { ACQUIRABLE_CARDS, CARDS, type Rng } from "./cards";
import {
  targetEligibilityFor, type RulesView,
} from "./playability";
import { leadOf } from "./relations";
import { card, t, type Segment } from "./rich-text";
import type { PlayerState } from "./game";

/** The Turnip harvest boon pool. Playing the card rolls three of these and
 *  the player keeps one; see `rollHarvest` for the roll and
 *  `playCard`'s turnip-harvest branch for what each one does. */
export type HarvestEffectId =
  | "swap-common" | "swap-known"
  | "might-reset"
  | "wealth-1" | "wealth-income"
  | "subjugate" | "empower";

export interface HarvestEffectDef {
  id: HarvestEffectId;
  /** Draw weight in the roll. Ten is the ordinary slot; the subjugation boon
   *  is rare because it hands over a whole vassalage with no lead built. */
  weight: number;
  /** The modal button's body - segments, never interpolated names, so a card
   *  named in a boon stays a node the player can point at. The swap-known
   *  entry here is only a fallback: its real label names the rolled card, so
   *  `harvestEligibility` builds it from the roll's `swapCardId`. */
  label: Segment[];
}

/** In roll order. `rollHarvest` draws without replacement over this
 *  list, one rng draw per slot, so reordering it re-maps committed seeds -
 *  the same caution CARDS carries about its declaration order. */
export const HARVEST_EFFECTS: readonly HarvestEffectDef[] = [
  { id: "swap-common", weight: 10,
    label: [t("Trade a "), card("grow-crops"), t(" for a random rare or epic card")] },
  { id: "swap-known", weight: 10,
    label: [t("Trade a "), card("grow-crops"), t(" for a named card")] },
  { id: "might-reset", weight: 10,
    label: [t("Close the gap: your Might rises to match every rival ahead of you")] },
  { id: "wealth-1", weight: 10, label: [t("Gain 1 wealth")] },
  { id: "wealth-income", weight: 10,
    label: [t("Gain five turns of wealth income")] },
  { id: "subjugate", weight: 2,
    label: [t("Take a neighbour in reach as your vassal, lead or no lead")] },
  { id: "empower", weight: 10,
    label: [t("Empower a card: its next play resolves twice")] },
];

const effectDef = (id: HarvestEffectId): HarvestEffectDef =>
  HARVEST_EFFECTS.find((e) => e.id === id)!;

/** A fully-resolved pick, everything `playCard` needs to resolve without UI.
 *  The swap-known card rides on the choice because the pick already happened:
 *  `rollHarvest` drew it with the boon slots, so resolution must not draw
 *  again - it spends what the roll named. */
export type HarvestChoice =
  | { effect: "swap-common" }
  | { effect: "swap-known"; cardId: string }
  | { effect: "might-reset" }
  | { effect: "wealth-1" }
  | { effect: "wealth-income" }
  | { effect: "subjugate"; targetId: string }
  | { effect: "empower"; cardId: string };

/** One rolled slot of the modal. An ineligible boon still occupies its slot,
 *  greyed with `reason` - the roll teaches the pool exists - and the player
 *  picks among the live ones. `rollHarvest` guarantees at least one
 *  slot is live. */
export interface HarvestOption {
  effect: HarvestEffectId;
  eligible: boolean;
  reason: Segment[] | null;
  label: Segment[];
}

/** The pool the swap-common boon draws from: acquirable cards above common.
 *  Commons are excluded so the blind draw carries a floor the named-card
 *  trade does not - the named card may come up any rarity. */
export function harvestSwapPool(): string[] {
  return ACQUIRABLE_CARDS.filter((id) => CARDS[id].rarity !== "common");
}

const livingRivals = (view: RulesView, actor: string): string[] =>
  view.factionIds.filter((f) => f !== actor && !(f in view.incorporated));

/** Living rivals holding a raw Might lead over the actor - the set the
 *  might-reset boon levels. Store lead only (`leadOf`), the `levelMight`
 *  precedent: a lead bought by a live pact is not the store's to erase. */
export function harvestTrailingRivals(
  view: RulesView, actor: string,
): string[] {
  return livingRivals(view, actor)
    .filter((r) => leadOf(view.relations, actor, r) < 0);
}

/** Who the subjugation boon may take: everyone Subjugate itself could target
 *  but for the Might bar. "Lead or no lead" means exactly the
 *  `insufficient-lead` reason is waived - truce, respite, liege, reach and
 *  already-vassal still refuse, so the boon bends the one rule it names and
 *  no other. */
export function harvestSubjugateTargets(
  view: RulesView, actor: string,
): string[] {
  return targetEligibilityFor(view, actor, "subjugate")
    .filter(
      (e) =>
        e.state === "available" ||
        (e.state === "blocked" &&
          e.reasons.every((r) => r.code === "insufficient-lead")),
    )
    .map((e) => e.factionId);
}

/** Cards the empower boon may pick, deduplicated in CARDS order: everything
 *  in the deck and discard except the no-effect filler, the harvest itself
 *  and the forced tribute cards - a forced play resolving twice would double
 *  a payment the player never chose. The hand is deliberately out: an
 *  empowered card should be a plan, not this turn's play made bigger. */
export function empowerableCards(player: PlayerState): string[] {
  const held = new Set([...player.deck, ...player.discard]);
  return Object.keys(CARDS).filter(
    (id) =>
      held.has(id) && id !== "grow-crops" && id !== "turnip-harvest" &&
      !CARDS[id].forced,
  );
}

const hasTurnip = (player: PlayerState): boolean =>
  player.deck.includes("grow-crops") ||
  player.discard.includes("grow-crops") ||
  player.hand.includes("grow-crops");

/** Eligibility for every boon, with the greyed-out reason where it fails.
 *  Re-derived every time the modal opens: the roll is cached against fishing,
 *  the facts under it are not. `swapCardId` is the roll's named card - the
 *  swap-known label embeds it, greyed or not, so even a slot the player
 *  cannot take teaches what it would have offered. */
export function harvestEligibility(
  view: RulesView,
  player: PlayerState,
  swapCardId: string,
): Record<HarvestEffectId, HarvestOption> {
  const actor = player.factionId;
  const turnip = hasTurnip(player);
  const noTurnip: Segment[] = [t("no "), card("grow-crops"), t(" left to trade")];
  const entry = (
    id: HarvestEffectId, eligible: boolean, reason: Segment[],
  ): HarvestOption => ({
    effect: id, eligible,
    reason: eligible ? null : reason,
    label: effectDef(id).label,
  });
  return {
    "swap-common": entry("swap-common", turnip, noTurnip),
    "swap-known": {
      ...entry("swap-known", turnip, noTurnip),
      label: [t("Trade a "), card("grow-crops"), t(" for "), card(swapCardId)],
    },
    "might-reset": entry(
      "might-reset", harvestTrailingRivals(view, actor).length > 0,
      [t("no rival holds a Might lead over you")],
    ),
    "wealth-1": entry("wealth-1", true, []),
    "wealth-income": entry("wealth-income", true, []),
    subjugate: entry(
      "subjugate", harvestSubjugateTargets(view, actor).length > 0,
      [t("no neighbour in reach can be taken")],
    ),
    empower: entry(
      "empower", empowerableCards(player).length > 0,
      [t("no card in your deck or discard can be empowered")],
    ),
  };
}

/** One harvest roll: the three boon slots plus the card the swap-known boon
 *  offers by name. Cached whole by the modal flow - cancelling and reopening
 *  shows the same slots AND the same named card, so closing the modal cannot
 *  fish for a better trade. */
export interface HarvestRoll {
  effects: HarvestEffectId[];
  swapCardId: string;
}

/** Three distinct boons, drawn weighted and without replacement, then the
 *  swap-known card from all of ACQUIRABLE_CARDS - EXACTLY four rng draws,
 *  whatever comes up, the constant-draw pattern src/packs.ts uses (the card
 *  is drawn even when swap-known missed the roll). Ineligible boons may
 *  occupy slots; if the whole roll came up dead, the last slot becomes the
 *  always-eligible wealth boon so the modal can never offer zero live
 *  choices. */
export function rollHarvest(
  view: RulesView,
  player: PlayerState,
  rng: Rng,
): HarvestRoll {
  const pool = [...HARVEST_EFFECTS];
  const rolled: HarvestEffectId[] = [];
  for (let slot = 0; slot < 3; slot++) {
    const total = pool.reduce((sum, e) => sum + e.weight, 0);
    let r = rng() * total;
    let picked = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r < 0) { picked = i; break; }
    }
    rolled.push(pool[picked].id);
    pool.splice(picked, 1);
  }
  const swapCardId =
    ACQUIRABLE_CARDS[Math.floor(rng() * ACQUIRABLE_CARDS.length)];
  const eligibility = harvestEligibility(view, player, swapCardId);
  if (!rolled.some((id) => eligibility[id].eligible)) {
    rolled[2] = "wealth-1";
  }
  return { effects: rolled, swapCardId };
}

/** A choiceless play's pick - the sim's naive human, a `turns=` fast-forward
 *  or an AI seat that somehow holds the card. Rolls the same slots (same
 *  four draws), keeps the first live one in rolled order, and settles each
 *  sub-pick without further draws: the subjugation boon takes the first
 *  target in faction order, the empower boon the first empowerable card, the
 *  swap-known boon the card the roll already named. */
export function autoHarvestChoice(
  view: RulesView,
  player: PlayerState,
  rng: Rng,
): HarvestChoice {
  const roll = rollHarvest(view, player, rng);
  const eligibility = harvestEligibility(view, player, roll.swapCardId);
  const first =
    roll.effects.find((id) => eligibility[id].eligible) ?? "wealth-1";
  switch (first) {
    case "subjugate":
      return {
        effect: "subjugate",
        targetId: harvestSubjugateTargets(view, player.factionId)[0],
      };
    case "empower":
      return { effect: "empower", cardId: empowerableCards(player)[0] };
    case "swap-known":
      return { effect: "swap-known", cardId: roll.swapCardId };
    default:
      return { effect: first };
  }
}
