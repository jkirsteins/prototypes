import { ACQUIRABLE_CARDS, CARDS, type Rng } from "./cards";
import {
  targetEligibilityFor, validTargetsFor, type RulesView,
} from "./playability";
import { card, t, type Segment } from "./rich-text";
import type { PlayerState } from "./game";

/** The Turnip harvest boon pool. Playing the card rolls three of these and
 *  the player keeps one; see `rollHarvestOptions` for the roll and
 *  `playCard`'s turnip-harvest branch for what each one does. */
export type HarvestEffectId =
  | "swap-common" | "swap-known"
  | "might-random" | "might-chosen" | "might-all"
  | "wealth-1" | "wealth-income"
  | "subjugate" | "incorporate" | "empower";

export interface HarvestEffectDef {
  id: HarvestEffectId;
  /** Draw weight in the roll. Ten is the ordinary slot; the subjugation boon
   *  is rare because it hands over a whole vassalage with no lead built. */
  weight: number;
  /** The modal button's body - segments, never interpolated names, so a card
   *  named in a boon stays a node the player can point at. */
  label: Segment[];
}

/** In roll order. `rollHarvestOptions` draws without replacement over this
 *  list, one rng draw per slot, so reordering it re-maps committed seeds -
 *  the same caution CARDS carries about its declaration order. */
export const HARVEST_EFFECTS: readonly HarvestEffectDef[] = [
  { id: "swap-common", weight: 10,
    label: [t("Trade a "), card("grow-crops"), t(" for a random common card")] },
  { id: "swap-known", weight: 10,
    label: [t("Trade a "), card("grow-crops"), t(" for a card from your collection")] },
  { id: "might-random", weight: 10,
    label: [t("Gain 1 Might over a random rival")] },
  { id: "might-chosen", weight: 10,
    label: [t("Gain 1 Might over a rival you choose")] },
  { id: "might-all", weight: 10,
    label: [t("Gain 1 Might over every living rival")] },
  { id: "wealth-1", weight: 10, label: [t("Gain 1 wealth")] },
  { id: "wealth-income", weight: 10,
    label: [t("Gain five turns of wealth income")] },
  { id: "subjugate", weight: 2,
    label: [t("Take a neighbour in reach as your vassal, lead or no lead")] },
  { id: "incorporate", weight: 10,
    label: [t("Absorb one of your vassals into your realm for good")] },
  { id: "empower", weight: 10,
    label: [t("Empower a card: its next play resolves twice")] },
];

const effectDef = (id: HarvestEffectId): HarvestEffectDef =>
  HARVEST_EFFECTS.find((e) => e.id === id)!;

/** A fully-resolved pick, everything `playCard` needs to resolve without UI.
 *  The known-collection pool rides on the choice because game.ts has no
 *  access to meta - main.ts builds it from `meta.knownCards`. */
export type HarvestChoice =
  | { effect: "swap-common" }
  | { effect: "swap-known"; pool: string[] }
  | { effect: "might-random" }
  | { effect: "might-chosen"; targetId: string }
  | { effect: "might-all" }
  | { effect: "wealth-1" }
  | { effect: "wealth-income" }
  | { effect: "subjugate"; targetId: string }
  | { effect: "incorporate"; targetId: string }
  | { effect: "empower"; cardId: string };

/** One rolled slot of the modal. An ineligible boon still occupies its slot,
 *  greyed with `reason` - the roll teaches the pool exists - and the player
 *  picks among the live ones. `rollHarvestOptions` guarantees at least one
 *  slot is live. */
export interface HarvestOption {
  effect: HarvestEffectId;
  eligible: boolean;
  reason: Segment[] | null;
  label: Segment[];
}

/** The common-card pool the swap-common boon draws from. */
export function harvestCommonPool(): string[] {
  return ACQUIRABLE_CARDS.filter((id) => CARDS[id].rarity === "common");
}

const livingRivals = (view: RulesView, actor: string): string[] =>
  view.factionIds.filter((f) => f !== actor && !(f in view.incorporated));

/** Living rivals, the target set of the chosen-Might boon. */
export function harvestChosenMightTargets(
  view: RulesView, actor: string,
): string[] {
  return livingRivals(view, actor);
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

/** Who the incorporation boon may absorb: the card's own target set - your
 *  direct vassals. The card-level realm gate (`realm-too-small`) deliberately
 *  does not apply: `validTargetsFor` never consults card-level legality, and a
 *  boon is a windfall - the same bend the subjugation boon above makes by
 *  admitting `insufficient-lead` targets. */
export function harvestIncorporateTargets(
  view: RulesView, actor: string,
): string[] {
  return validTargetsFor(view, actor, "incorporate");
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
 *  the facts under it are not. */
export function harvestEligibility(
  view: RulesView,
  player: PlayerState,
  knownPool: string[],
): Record<HarvestEffectId, HarvestOption> {
  const actor = player.factionId;
  const rivals = livingRivals(view, actor).length > 0;
  const turnip = hasTurnip(player);
  const noTurnip: Segment[] = [t("no "), card("grow-crops"), t(" left to trade")];
  const noRival: Segment[] = [t("no living rival stands")];
  const entry = (
    id: HarvestEffectId, eligible: boolean, reason: Segment[],
  ): HarvestOption => ({
    effect: id, eligible,
    reason: eligible ? null : reason,
    label: effectDef(id).label,
  });
  return {
    "swap-common": entry("swap-common", turnip, noTurnip),
    "swap-known": entry(
      "swap-known", turnip && knownPool.length > 0,
      turnip ? [t("your collection holds nothing to trade for")] : noTurnip,
    ),
    "might-random": entry("might-random", rivals, noRival),
    "might-chosen": entry("might-chosen", rivals, noRival),
    "might-all": entry("might-all", rivals, noRival),
    "wealth-1": entry("wealth-1", true, []),
    "wealth-income": entry("wealth-income", true, []),
    subjugate: entry(
      "subjugate", harvestSubjugateTargets(view, actor).length > 0,
      [t("no neighbour in reach can be taken")],
    ),
    incorporate: entry(
      "incorporate", harvestIncorporateTargets(view, actor).length > 0,
      [t("no vassal to absorb")],
    ),
    empower: entry(
      "empower", empowerableCards(player).length > 0,
      [t("no card in your deck or discard can be empowered")],
    ),
  };
}

/** Three distinct boons, drawn weighted and without replacement - EXACTLY
 *  three rng draws, whatever comes up, the constant-draw pattern
 *  src/packs.ts uses. Ineligible boons may occupy slots; if the whole roll
 *  came up dead, the last slot becomes the always-eligible wealth boon so
 *  the modal can never offer zero live choices. */
export function rollHarvestOptions(
  view: RulesView,
  player: PlayerState,
  rng: Rng,
  knownPool: string[],
): HarvestOption[] {
  const eligibility = harvestEligibility(view, player, knownPool);
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
  if (!rolled.some((id) => eligibility[id].eligible)) {
    rolled[2] = "wealth-1";
  }
  return rolled.map((id) => eligibility[id]);
}

/** A choiceless play's pick - the sim's naive human, a `turns=` fast-forward
 *  or an AI seat that somehow holds the card. Rolls the same three slots
 *  (same three draws), keeps the first live one in rolled order, and settles
 *  each sub-pick without further draws: the chosen-Might boon degrades to
 *  the random one, the target boons take the first target in faction order,
 *  the empower boon the first empowerable card. */
export function autoHarvestChoice(
  view: RulesView,
  player: PlayerState,
  rng: Rng,
): HarvestChoice {
  const options = rollHarvestOptions(view, player, rng, []);
  const first = options.find((o) => o.eligible)?.effect ?? "wealth-1";
  switch (first) {
    case "might-chosen":
      return { effect: "might-random" };
    case "subjugate":
      return {
        effect: "subjugate",
        targetId: harvestSubjugateTargets(view, player.factionId)[0],
      };
    case "incorporate":
      return {
        effect: "incorporate",
        targetId: harvestIncorporateTargets(view, player.factionId)[0],
      };
    case "empower":
      return { effect: "empower", cardId: empowerableCards(player)[0] };
    case "swap-known":
      // Unreachable - the auto roll passes an empty pool, so the boon is
      // never eligible - but the switch must be total and honest.
      return { effect: "swap-common" };
    default:
      return { effect: first };
  }
}
