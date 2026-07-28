import type { GameEvent, GameEventType } from "./game";

/** A player-facing interruption for an event (or batch of same-kind events)
 *  that changed the human's state. Factual only: no flavor text. */
export interface Notice {
  title: string;
  what: string; // factual: who did what
  consequence?: string; // mechanical effect on the human player
  details: string[]; // standing/allegiance context lines, always present
}

export interface NoticeCtx {
  humanFactionId: string;
  factionName(id: string | undefined): string;
  factionOf(playerId: number): string | undefined;
  /** The human's leads over otherFactionId; positive = you lead. */
  leads(otherFactionId: string): { might: number; status: number };
  /** The lead an enemy needs over the human to subjugate them (scaled by
   *  the human realm's size). */
  subjugationGrip(): number;
  /** Expiry turn of an active alliance between the human and otherFactionId;
   *  undefined when no pact is active. */
  allianceExpiry(otherFactionId: string): number | undefined;
}

/** Every GameEventType must decide: interrupt the human, or stay silent
 *  with a written reason. The exhaustive Record makes adding an event type
 *  a compile error until that decision is made. */
export type NoticeRule =
  | {
      kind: "modal";
      appliesToHuman(e: GameEvent, ctx: NoticeCtx): boolean;
      /** Per-event build, used by the single-event internal path (noticeFor)
       *  and as the base case inside the batch group builders. */
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
  return Math.max(-l.might, -l.status) >= ctx.subjugationGrip();
};

const PAY_TRIBUTE_CONSEQUENCE =
  "Two Pay Tribute cards were shuffled into your deck. When one is " +
  "in hand, it must be played before anything else.";

const RELEASE_CONSEQUENCE =
  "All Pay Tribute cards were removed from your deck, hand, and discard.";

const actorName = (e: GameEvent, ctx: NoticeCtx): string =>
  ctx.factionName(ctx.factionOf(e.playerId));

/** Shared shape for hostile targeted plays against the human (Raid, Shrewd
 *  marriage, Assassinate ruler): single actor keeps the plain sentence; N
 *  actors collapse into one "N players played X against you" notice with
 *  one standing bullet per actor. */
function buildRelationPlayNotice(
  events: GameEvent[],
  ctx: NoticeCtx,
  title: string,
  cardLabel: string,
): Notice {
  if (events.length === 1) {
    const e = events[0];
    const actorId = ctx.factionOf(e.playerId);
    const actor = ctx.factionName(actorId);
    const details = actorId !== undefined
      ? [
          standingLine(ctx, actorId),
          ...(subjugationRisk(ctx, actorId)
            ? [`A lead of ${ctx.subjugationGrip()} is enough to subjugate.`]
            : []),
        ]
      : [];
    return {
      title,
      what: `${actor} played ${cardLabel} against ${ctx.factionName(e.targetFactionId)}.`,
      details,
    };
  }

  const details = events.map((e) => {
    const actorId = ctx.factionOf(e.playerId);
    const actor = ctx.factionName(actorId);
    const l = actorId !== undefined ? ctx.leads(actorId) : { might: 0, status: 0 };
    const line = `${actor} - Might: ${fmtLead(l.might)}; Status: ${fmtLead(l.status)}`;
    const risk = actorId !== undefined && subjugationRisk(ctx, actorId);
    return risk ? `${line} - a lead of ${ctx.subjugationGrip()} subjugates you` : line;
  });
  return {
    title,
    what: `${events.length} players played ${cardLabel} against you:`,
    details,
  };
}

/** Raid / Shrewd marriage against the human. */
function buildPlayNotice(events: GameEvent[], ctx: NoticeCtx): Notice {
  const raid = events[0].cardId === "raid";
  const title = raid ? "Raided" : "A Shrewd Marriage";
  const cardLabel = raid ? "Raid" : "Shrewd marriage";
  return buildRelationPlayNotice(events, ctx, title, cardLabel);
}

/** Assassinate ruler against the human: same shape as Raid/Marriage (the
 *  standing line already shows Status even, post-effect). */
function buildAssassinateNotice(events: GameEvent[], ctx: NoticeCtx): Notice {
  return buildRelationPlayNotice(events, ctx, "A Ruler Falls", "Assassinate ruler");
}

/** Assassinate ruler against the human, nullified by a Bodyguard: the "what"
 *  line matches the successful case's shape, but the details report the
 *  block instead of a standing/threat line. */
function buildAssassinatePreventedNotice(events: GameEvent[], ctx: NoticeCtx): Notice {
  if (events.length === 1) {
    const e = events[0];
    const actor = ctx.factionName(ctx.factionOf(e.playerId));
    return {
      title: "Assassination Prevented",
      what: `${actor} played Assassinate ruler against ${ctx.factionName(e.targetFactionId)}.`,
      details: ["Your bodyguard turned the blade - your Status lead is unchanged."],
    };
  }

  const details = events.map(
    (e) => `${ctx.factionName(ctx.factionOf(e.playerId))} - prevented by your bodyguard`,
  );
  return {
    title: "Assassination Prevented",
    what: `${events.length} players played Assassinate ruler against you:`,
    details,
  };
}

/** Alliance sealed with the human: single actor keeps "played Alliance
 *  WITH you" (not against); N actors collapse into one notice with one
 *  "actor - until turn N" bullet each. */
function buildAllianceNotice(events: GameEvent[], ctx: NoticeCtx): Notice {
  if (events.length === 1) {
    const e = events[0];
    const actorId = ctx.factionOf(e.playerId);
    const actor = ctx.factionName(actorId);
    const expiry = actorId !== undefined ? ctx.allianceExpiry(actorId) : undefined;
    const details = expiry !== undefined
      ? [`No hostile cards between you and ${actor} until turn ${expiry}.`]
      : [];
    return {
      title: "An Alliance Sealed",
      what: `${actor} played Alliance with ${ctx.factionName(e.targetFactionId)}.`,
      details,
    };
  }

  const details = events.map((e) => {
    const actorId = ctx.factionOf(e.playerId);
    const actor = ctx.factionName(actorId);
    const expiry = actorId !== undefined ? ctx.allianceExpiry(actorId) : undefined;
    return expiry !== undefined ? `${actor} - until turn ${expiry}` : actor;
  });
  return {
    title: "An Alliance Sealed",
    what: `${events.length} players sealed alliances with you:`,
    details,
  };
}

/** Subjugated: single event keeps the fealty/shift + standing format;
 *  a poach chain in one batch lists each transition, then the standing line
 *  for the FINAL overlord only, then the consequence once. */
function buildSubjugatedNotice(events: GameEvent[], ctx: NoticeCtx): Notice {
  if (events.length === 1) {
    const e = events[0];
    const actor = actorName(e, ctx);
    const former = e.formerOverlordFactionId;
    const details = [
      former !== undefined
        ? `Your allegiance shifts from ${ctx.factionName(former)} to ${actor}.`
        : `You now owe fealty to ${actor}.`,
      ...(e.overlordFactionId !== undefined ? [standingLine(ctx, e.overlordFactionId)] : []),
      ...(former !== undefined && former !== e.overlordFactionId
        ? [
            standingLine(ctx, former),
            `${ctx.factionName(former)} loses 1 Might and 1 Status against you.`,
          ]
        : []),
    ];
    return {
      title: "Beneath the Yoke",
      what: `${actor} played Subjugate against ${ctx.factionName(e.targetFactionId)}.`,
      details,
      consequence: PAY_TRIBUTE_CONSEQUENCE,
    };
  }

  const bullets = events.map((e) => {
    const actor = actorName(e, ctx);
    const former = e.formerOverlordFactionId;
    return former !== undefined
      ? `${actor} tore you from ${ctx.factionName(former)}`
      : `${actor} subjugated you`;
  });
  const finalEvent = events[events.length - 1];
  const finalOverlord = finalEvent.overlordFactionId;
  const finalFormer = finalEvent.formerOverlordFactionId;
  const details = [
    ...bullets,
    ...(finalOverlord !== undefined ? [standingLine(ctx, finalOverlord)] : []),
    ...(finalFormer !== undefined
      ? [`${ctx.factionName(finalFormer)} loses 1 Might and 1 Status against you.`]
      : []),
  ];
  return {
    title: "Beneath the Yoke",
    what: "Your allegiance changed this round:",
    details,
    consequence: PAY_TRIBUTE_CONSEQUENCE,
  };
}

/** Released: single event keeps the plain sentence; N events in one batch
 *  collapse into one notice with a bullet per release. */
function buildReleasedNotice(events: GameEvent[], ctx: NoticeCtx): Notice {
  const lordName = (e: GameEvent): string =>
    e.overlordFactionId !== undefined ? ctx.factionName(e.overlordFactionId) : "your overlord";

  if (events.length === 1) {
    const e = events[0];
    return {
      title: "The Yoke Is Broken",
      what: `The fall of ${lordName(e)} to ${actorName(e, ctx)} releases you from vassalage.`,
      details: [],
      consequence: RELEASE_CONSEQUENCE,
    };
  }

  const bullets = events.map(
    (e) => `The fall of ${lordName(e)} to ${actorName(e, ctx)} set you free`,
  );
  return {
    title: "The Yoke Is Broken",
    what: "You were released this round:",
    details: bullets,
    consequence: RELEASE_CONSEQUENCE,
  };
}

export const NOTICE_RULES: Record<GameEventType, NoticeRule> = {
  draw: { kind: "silent", reason: "routine; visible in hand and log" },
  play: {
    kind: "modal",
    appliesToHuman: (e, ctx) =>
      (e.cardId === "raid" ||
        e.cardId === "shrewd-marriage" ||
        e.cardId === "assassinate-ruler" ||
        e.cardId === "alliance") &&
      e.targetFactionId === ctx.humanFactionId &&
      e.playerId !== 1,
    build: (e, ctx) =>
      e.cardId === "assassinate-ruler"
        ? e.prevented
          ? buildAssassinatePreventedNotice([e], ctx)
          : buildAssassinateNotice([e], ctx)
        : e.cardId === "alliance"
          ? buildAllianceNotice([e], ctx)
          : buildPlayNotice([e], ctx),
  },
  discard: { kind: "silent", reason: "routine; visible in log" },
  reshuffle: { kind: "silent", reason: "routine; deck pulse animation" },
  subjugated: {
    kind: "modal",
    appliesToHuman: victimOfOther,
    build: (e, ctx) => buildSubjugatedNotice([e], ctx),
  },
  released: {
    kind: "modal",
    appliesToHuman: victimOfOther,
    build: (e, ctx) => buildReleasedNotice([e], ctx),
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

/** Single-event internal path, kept for direct per-event use in tests/debug.
 *  The HUD calls buildNotices instead. */
export function noticeFor(e: GameEvent, ctx: NoticeCtx): Notice | null {
  const rule = NOTICE_RULES[e.type];
  if (rule.kind !== "modal" || !rule.appliesToHuman(e, ctx)) return null;
  return rule.build(e, ctx);
}

/** The HUD's entry point: given a batch of fresh log events, groups the
 *  noticeable ones by event type + cardId (so e.g. three Raids against the
 *  human in one AI round collapse into a single modal) and returns one
 *  Notice per group, ordered by first occurrence in the log. */
export function buildNotices(events: GameEvent[], ctx: NoticeCtx): Notice[] {
  const order: { type: GameEventType; events: GameEvent[] }[] = [];
  const indexByKey = new Map<string, number>();
  for (const e of events) {
    const rule = NOTICE_RULES[e.type];
    if (rule.kind !== "modal" || !rule.appliesToHuman(e, ctx)) continue;
    const key = `${e.type}:${e.cardId ?? ""}:${e.prevented ? "prevented" : ""}`;
    let idx = indexByKey.get(key);
    if (idx === undefined) {
      idx = order.length;
      indexByKey.set(key, idx);
      order.push({ type: e.type, events: [] });
    }
    order[idx].events.push(e);
  }
  return order.map(({ type, events: groupEvents }) => {
    switch (type) {
      case "play": {
        const cardId = groupEvents[0].cardId;
        if (cardId === "assassinate-ruler") {
          return groupEvents[0].prevented
            ? buildAssassinatePreventedNotice(groupEvents, ctx)
            : buildAssassinateNotice(groupEvents, ctx);
        }
        if (cardId === "alliance") return buildAllianceNotice(groupEvents, ctx);
        return buildPlayNotice(groupEvents, ctx);
      }
      case "subjugated":
        return buildSubjugatedNotice(groupEvents, ctx);
      case "released":
        return buildReleasedNotice(groupEvents, ctx);
      default:
        throw new Error(`no batch notice builder for grouped event type: ${type}`);
    }
  });
}
