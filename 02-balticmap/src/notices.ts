import type { GameEvent, GameEventType } from "./game";
import { SUBJUGATE_THRESHOLD } from "./playability";

/** A player-facing interruption for an event that changed the human's state. */
export interface Notice {
  title: string;
  what: string; // factual: who did what
  flavor: string; // period-tone line, rendered italic
  consequence?: string; // mechanical effect on the human player
  details: string[]; // standing/allegiance context lines, always present
}

export interface NoticeCtx {
  humanFactionId: string;
  factionName(id: string | undefined): string;
  factionOf(playerId: number): string | undefined;
  /** The human's leads over otherFactionId; positive = you lead. */
  leads(otherFactionId: string): { might: number; status: number };
}

/** Every GameEventType must decide: interrupt the human, or stay silent
 *  with a written reason. The exhaustive Record makes adding an event type
 *  a compile error until that decision is made. */
export type NoticeRule =
  | {
      kind: "modal";
      appliesToHuman(e: GameEvent, ctx: NoticeCtx): boolean;
      build(e: GameEvent, ctx: NoticeCtx): Notice;
    }
  | { kind: "silent"; reason: string };

const victimOfOther = (e: GameEvent, ctx: NoticeCtx): boolean =>
  e.targetFactionId === ctx.humanFactionId && e.playerId !== 1;

const fmtLead = (n: number): string =>
  n > 0 ? `you lead by ${n}` : n < 0 ? `they lead by ${-n}` : "even";

const standingLine = (ctx: NoticeCtx, otherId: string): string => {
  const l = ctx.leads(otherId);
  return `Standing vs ${ctx.factionName(otherId)}: ` +
    `Might - ${fmtLead(l.might)}; Status - ${fmtLead(l.status)}.`;
};

/** Their best lead over the human meets the subjugation threshold. */
const subjugationRisk = (ctx: NoticeCtx, otherId: string): boolean => {
  const l = ctx.leads(otherId);
  return Math.max(-l.might, -l.status) >= SUBJUGATE_THRESHOLD;
};

export const NOTICE_RULES: Record<GameEventType, NoticeRule> = {
  draw: { kind: "silent", reason: "routine; visible in hand and log" },
  play: {
    kind: "modal",
    appliesToHuman: (e, ctx) =>
      (e.cardId === "raid" || e.cardId === "shrewd-marriage") &&
      e.targetFactionId === ctx.humanFactionId &&
      e.playerId !== 1,
    build: (e, ctx) => {
      const actorId = ctx.factionOf(e.playerId);
      const actor = ctx.factionName(actorId);
      const raid = e.cardId === "raid";
      const details = actorId !== undefined
        ? [
            standingLine(ctx, actorId),
            ...(subjugationRisk(ctx, actorId)
              ? [`A lead of ${SUBJUGATE_THRESHOLD} is enough to subjugate.`]
              : []),
          ]
        : [];
      return raid
        ? {
            title: "Raided",
            what: `${actor} played Raid against ${ctx.factionName(e.targetFactionId)}.`,
            details,
            flavor: "Riders came at dawn; granaries burn. Word of your weakness spreads.",
          }
        : {
            title: "Bound by Marriage",
            what: `${actor} played Shrewd marriage against ${ctx.factionName(e.targetFactionId)}.`,
            details,
            flavor: "A wedding feast beyond your borders. Their standing grows at your expense.",
          };
    },
  },
  discard: { kind: "silent", reason: "routine; visible in log" },
  reshuffle: { kind: "silent", reason: "routine; deck pulse animation" },
  subjugated: {
    kind: "modal",
    appliesToHuman: victimOfOther,
    build: (e, ctx) => {
      const actor = ctx.factionName(ctx.factionOf(e.playerId));
      const former = e.formerOverlordFactionId;
      const details = [
        former !== undefined
          ? `Your allegiance shifts from ${ctx.factionName(former)} to ${actor}.`
          : `You now owe fealty to ${actor}.`,
        ...(e.overlordFactionId !== undefined ? [standingLine(ctx, e.overlordFactionId)] : []),
        ...(former !== undefined && former !== e.overlordFactionId
          ? [standingLine(ctx, former)]
          : []),
      ];
      return {
        title: "Beneath the Yoke",
        what: `${actor} played Subjugate against ${ctx.factionName(e.targetFactionId)}.`,
        details,
        flavor:
          "Armed riders gather before your halls. Your elders count spears, " +
          "then bow their heads. The victors name the tribute; you will pay it.",
        consequence:
          "Two Pay Tribute cards were shuffled into your deck. When one is " +
          "in hand, it must be played before anything else.",
      };
    },
  },
  released: {
    kind: "modal",
    appliesToHuman: victimOfOther,
    build: (e, ctx) => {
      const actor = ctx.factionName(ctx.factionOf(e.playerId));
      return {
        title: "The Yoke Is Broken",
        what: `The fall of ${
          e.overlordFactionId !== undefined ? ctx.factionName(e.overlordFactionId) : "your overlord"
        } to ${actor} releases you from vassalage.`,
        details: [],
        flavor:
          "The lord you paid is lord no longer. No riders come for tribute " +
          "this season - you stand free.",
        consequence:
          "All Pay Tribute cards were removed from your deck, hand, and discard.",
      };
    },
  },
  incorporated: {
    kind: "silent",
    reason: "human target always co-occurs with defeat; postmortem covers it",
  },
  reclaimed: {
    kind: "silent",
    reason: "self-initiated when it touches the human",
  },
  tribute: {
    kind: "silent",
    reason: "self-initiated (human pays) or human merely benefits",
  },
  victory: { kind: "silent", reason: "postmortem overlay covers it" },
  defeat: { kind: "silent", reason: "postmortem overlay covers it" },
};

/** The single entry point the HUD uses per fresh log event. */
export function noticeFor(e: GameEvent, ctx: NoticeCtx): Notice | null {
  const rule = NOTICE_RULES[e.type];
  if (rule.kind !== "modal" || !rule.appliesToHuman(e, ctx)) return null;
  return rule.build(e, ctx);
}
