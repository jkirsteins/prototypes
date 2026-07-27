import type { GameEvent, GameEventType } from "./game";

/** A player-facing interruption for an event that changed the human's state. */
export interface Notice {
  title: string;
  what: string; // factual: who did what
  flavor: string; // period-tone line, rendered italic
  consequence?: string; // mechanical effect on the human player
}

export interface NoticeCtx {
  humanFactionId: string;
  factionName(id: string | undefined): string;
  factionOf(playerId: number): string | undefined;
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

export const NOTICE_RULES: Record<GameEventType, NoticeRule> = {
  draw: { kind: "silent", reason: "routine; visible in hand and log" },
  play: { kind: "silent", reason: "routine; visible in log and card animation" },
  discard: { kind: "silent", reason: "routine; visible in log" },
  reshuffle: { kind: "silent", reason: "routine; deck pulse animation" },
  subjugated: {
    kind: "modal",
    appliesToHuman: victimOfOther,
    build: (e, ctx) => {
      const actor = ctx.factionName(ctx.factionOf(e.playerId));
      return {
        title: "Beneath the Yoke",
        what: `${actor} played Subjugate against ${ctx.factionName(e.targetFactionId)}.`,
        flavor:
          "Armed riders gather before your halls. Your elders count spears, " +
          `then bow their heads. ${actor} name the tribute; you will pay it.`,
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
        what: `The fall of your overlord to ${actor} releases you from vassalage.`,
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
