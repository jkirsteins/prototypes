/** What the player is SHOWN at their turn start, one thing at a time: the
 *  camera frames the land, a label says what happened, a sound fits it. This
 *  module is the classification and the walk - pure data out, no DOM - so the
 *  executor in `src/main.ts` only spends queue steps on what this hands back.
 *
 *  `REPLAY_RULES` is exhaustive over `GameEventType`, the `NOTICE_RULES`
 *  shape: a new event type does not compile until somebody decides whether
 *  the camera visits it, and a `passed-over` entry writes the sentence saying
 *  why not and where its sound plays instead. The 2026-08-10 resolution-replay
 *  doc has the reasoning.
 *
 *  Who earns a step is deliberately NOT "everything in the log". A march is
 *  shown when it touches the local human's full realm - the old concurrent
 *  flash's gate, kept. Anything else is shown only when the local player did
 *  not cause it themselves (they watched their own play live, card in
 *  flight), and it either passes `isNoticeWorthy` - the modal's own gate - or
 *  moves a score inside the INTEREST set: the full realm plus `attackReach`.
 *  That last arm is the wild-lands lesson this feature exists for: a land you
 *  are about to walk into growing a defense back must be seen, while the same
 *  regrowth across the map is the log's business. */

import type { GameEvent, GameEventType } from "./game";
import type { NoticeCtx } from "./notices";
import { isNoticeWorthy } from "./notices";
import { card, faction, passive, t, type Segment } from "./rich-text";
import { EVENT_SOUNDS, type SoundName } from "./audio-manifest";

/** The play or status a consequence answers to - read off the batch's shape,
 *  exactly as `appendEvents` stamps `consequence`: a `play` opens a cause, a
 *  `passive-fired` names one for the line under it, and any other
 *  non-consequence event closes it. */
export interface ReplayCause {
  kind: "card" | "passive";
  id: string;
  playerId: number;
}

export interface ReplayView {
  localPlayerId: number;
  /** The local human's full realm - the march gate. */
  realm: ReadonlySet<string>;
  /** Realm plus attack reach - the "worth the camera" set for score moves. */
  interest: ReadonlySet<string>;
  ctx: NoticeCtx | null;
}

export interface ReplayStep {
  /** Index into the fresh batch, so the score floats can skip what already
   *  got a step - one motion per fact. */
  index: number;
  event: GameEvent;
  /** The land the camera frames. Undefined leaves the camera where it is. */
  polygon: string | undefined;
  label: Segment[];
  sound: SoundName | null;
}

type ReplayRule =
  | {
      kind: "shown";
      applies(e: GameEvent, view: ReplayView, cause: ReplayCause | null): boolean;
      polygon(e: GameEvent): string | undefined;
      label(e: GameEvent, cause: ReplayCause | null): Segment[];
      /** Absent means `EVENT_SOUNDS[e.type]`. */
      sound?(e: GameEvent, cause: ReplayCause | null): SoundName | null;
    }
  | { kind: "passed-over"; reason: string };

/** A consequence the local player caused themselves: they watched it live,
 *  card in flight, floats rising - replaying it would show their turn twice. */
const ownCause = (view: ReplayView, cause: ReplayCause | null): boolean =>
  cause !== null && cause.kind === "card" && cause.playerId === view.localPlayerId;

/** Notice-worthy, or a visible move inside the interest set. The shared
 *  second half of every non-march `applies`. */
function worthTheCamera(e: GameEvent, view: ReplayView): boolean {
  if (view.ctx !== null && isNoticeWorthy(e, view.ctx, view.localPlayerId)) {
    return true;
  }
  return e.targetFactionId !== undefined && view.interest.has(e.targetFactionId);
}

export const REPLAY_RULES: Record<GameEventType, ReplayRule> = {
  draw: {
    kind: "passed-over",
    reason: "the HUD's own draw flight is its moment (and cues its sound); " +
      "another seat's draw moves nothing on the map",
  },
  play: {
    kind: "passed-over",
    reason: "your own play flies its card; a rival's play is the cause line " +
      "over its consequences, and those get the steps - a play with none " +
      "moved nothing the camera could frame",
  },
  reshuffle: {
    kind: "passed-over",
    reason: "the deck pulse is its moment and cues its sound",
  },
  discard: {
    kind: "passed-over",
    reason: "the hand is its surface, not the map; cued beside the piles",
  },
  subjugated: {
    kind: "shown",
    applies: (e, view, cause) => !ownCause(view, cause) && worthTheCamera(e, view),
    polygon: (e) => e.targetFactionId,
    label: (e) => {
      if (e.overlordFactionId === undefined) return [t("The land changes hands")];
      const lord = faction(e.overlordFactionId);
      switch (e.via) {
        case "claim":
          return [t("The demand is met - this land now answers to "), lord];
        case "conquest":
          return [t("Taken - this land now answers to "), lord];
        default:
          return [t("The land falls to "), lord];
      }
    },
  },
  released: {
    kind: "shown",
    applies: (e, view, cause) => !ownCause(view, cause) && worthTheCamera(e, view),
    polygon: (e) => e.targetFactionId,
    label: () => [t("Freed - this land answers to nobody now")],
  },
  incorporated: {
    kind: "shown",
    applies: (e, view, cause) => !ownCause(view, cause) && worthTheCamera(e, view),
    polygon: (e) => e.targetFactionId,
    label: () => [t("Annexed - its people fold into their lord's realm")],
  },
  independence: {
    kind: "shown",
    applies: (e, view) => worthTheCamera(e, view),
    polygon: (e) => e.targetFactionId,
    label: () => [t("The lord's grip slips - independent again")],
  },
  tribute: {
    kind: "passed-over",
    reason: "routine coins every round; the log carries the amount, and your " +
      "own tribute cues its sound beside the hand",
  },
  settled: {
    kind: "shown",
    applies: (e, view, cause) =>
      !ownCause(view, cause) &&
      e.playerId !== view.localPlayerId &&
      worthTheCamera(e, view),
    polygon: (e) => e.targetFactionId,
    label: () => [t("A new settlement founded")],
  },
  healed: {
    kind: "shown",
    applies: (e, view, cause) =>
      !ownCause(view, cause) &&
      e.playerId !== view.localPlayerId &&
      worthTheCamera(e, view),
    polygon: (e) => e.targetFactionId,
    label: (_e, cause) => {
      if (cause?.kind === "passive") {
        return [passive(cause.id), t(" - the land grows its defenses back")];
      }
      if (cause?.kind === "card") {
        return [card(cause.id), t(" - defenses restored")];
      }
      return [t("Defenses restored")];
    },
    // The regrowth nobody ordered sounds like ground, not like repair work.
    sound: (_e, cause) =>
      cause?.kind === "passive" && cause.id === "wild-lands" ? "rustle" : "hammer",
  },
  transferred: {
    kind: "shown",
    applies: (e, view, cause) =>
      !ownCause(view, cause) &&
      e.playerId !== view.localPlayerId &&
      worthTheCamera(e, view),
    polygon: (e) => e.targetFactionId,
    label: (e) =>
      e.sourceFactionId === undefined
        ? [t("Defenders arrive")]
        : [t("Defenders arrive from "), faction(e.sourceFactionId)],
  },
  "disease-spread": {
    kind: "shown",
    applies: (e, view, cause) => !ownCause(view, cause) && worthTheCamera(e, view),
    polygon: (e) => e.targetFactionId,
    label: (_e, cause) =>
      cause?.kind === "card"
        ? [card(cause.id), t(" - sickness seeded here")]
        : [t("Sickness seeded here")],
  },
  plagued: {
    kind: "shown",
    applies: (e, view, cause) => !ownCause(view, cause) && worthTheCamera(e, view),
    polygon: (e) => e.targetFactionId,
    label: (_e, cause) =>
      cause?.kind === "card"
        ? [card(cause.id), t(" - the sickness takes its toll")]
        : [t("The sickness takes its toll")],
  },
  "winds-shifted": {
    kind: "shown",
    applies: (e, view, cause) => !ownCause(view, cause) && worthTheCamera(e, view),
    polygon: (e) => e.targetFactionId,
    label: (_e, cause) =>
      cause?.kind === "card"
        ? [card(cause.id), t(" - the sickness changes hands")]
        : [t("The sickness changes hands")],
  },
  "passive-fired": {
    kind: "passed-over",
    reason: "it explains the line under it; that line carries the camera and " +
      "the sound, and two steps for one moment would say two things happened",
  },
  "march-resolved": {
    kind: "shown",
    // The old concurrent flash's gate, kept: either end in the realm. Your
    // own marches land at YOUR turn start, so playerId means nothing here.
    applies: (e, view) =>
      (e.targetFactionId !== undefined && view.realm.has(e.targetFactionId)) ||
      (e.sourceFactionId !== undefined && view.realm.has(e.sourceFactionId)),
    polygon: (e) => e.targetFactionId,
    label: (e) => {
      const name = e.cardId === undefined ? [t("The army")] : [card(e.cardId)];
      // A standoff carries no `amount`: both sides spent, nothing landed.
      return e.amount === undefined
        ? [...name, t(" was answered in the field")]
        : [...name, t(" lands here")];
    },
  },
  "march-lapsed": {
    kind: "passed-over",
    reason: "nothing arrived and no score moved; the log explains the " +
      "vanished arrow",
  },
  "harvest-earned": {
    kind: "passed-over",
    reason: "the turnip bar is its surface; cued beside the hand when it is " +
      "your own",
  },
  "harvest-picked": {
    kind: "passed-over",
    reason: "the harvest reveal animates the gained card already",
  },
  "harvest-burned": {
    kind: "passed-over",
    reason: "a pile getting thinner has no land to frame; cued beside the hand",
  },
  victory: {
    kind: "passed-over",
    reason: "the ending owns the whole screen; its jingle cues on the phase " +
      "change in src/main.ts",
  },
  "played-on": {
    kind: "passed-over",
    reason: "the player clicked it - there is no land to fly to and nothing " +
      "they have not just been shown; the run simply carries on",
  },
  defeat: {
    kind: "passed-over",
    reason: "the ending owns the whole screen; its jingle cues on the phase " +
      "change in src/main.ts",
  },
  unified: {
    kind: "passed-over",
    reason: "the ending owns the whole screen; its jingle cues on the phase " +
      "change in src/main.ts",
  },
  surrendered: {
    kind: "passed-over",
    reason: "the ending owns the whole screen; its jingle cues on the phase " +
      "change in src/main.ts",
  },
};

/** The steps a fresh batch earns, in log order. `fresh` must be the whole
 *  batch - consequences resolve their cause from the events above them. */
export function buildReplaySteps(
  fresh: GameEvent[],
  view: ReplayView,
): ReplayStep[] {
  const steps: ReplayStep[] = [];
  // Two causes with two lifetimes, both read off the batch's shape. A play's
  // cause covers every `consequence: true` event under it - the indentation
  // rule. A passive's covers exactly the ONE line under it, the way the log
  // renders a `passive-fired` as the explanation of what follows.
  let playCause: ReplayCause | null = null;
  let passiveCause: ReplayCause | null = null;
  fresh.forEach((e, index) => {
    if (e.type === "play" && e.cardId !== undefined) {
      playCause = { kind: "card", id: e.cardId, playerId: e.playerId };
      passiveCause = null;
    } else if (e.type === "passive-fired" && e.passiveId !== undefined) {
      passiveCause = { kind: "passive", id: e.passiveId, playerId: e.playerId };
    }
    const cause: ReplayCause | null =
      e.type === "play" || e.type === "passive-fired"
        ? null
        : passiveCause ?? (e.consequence === true ? playCause : null);
    if (e.type !== "play" && e.type !== "passive-fired") {
      passiveCause = null;
      if (e.consequence !== true) playCause = null;
    }
    const rule = REPLAY_RULES[e.type];
    if (rule.kind !== "shown") return;
    if (!rule.applies(e, view, cause)) return;
    steps.push({
      index,
      event: e,
      polygon: rule.polygon(e),
      label: rule.label(e, cause),
      sound: rule.sound === undefined
        ? EVENT_SOUNDS[e.type]
        : rule.sound(e, cause),
    });
  });
  return steps;
}
