# Notices Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Richer subjugation modals (allegiance change + standing), modals for Raid/Shrewd marriage against the player, card rules text on the deck screen and in-hand popups, and undimming the overlord's realm while subjugated.

**Architecture:** The engine logs two extra facts on existing events (no rule changes). notices.ts grows a `details` block and a `leads` accessor on NoticeCtx, and its `play` rule becomes a predicate-gated modal. The HUD renders details and hand-card tips; cards.ts gains per-card rules text consumed by deck-screen, postmortem loot, and hand tips. main.ts undims the overlord realm.

**Tech Stack:** TypeScript (strict), Vite, vitest with happy-dom. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-28-notices-followups-design.md`

## Global Constraints

- UI copy and code comments: keyboard-typable characters only - no em dashes (use "-"), no unicode arrows or fancy quotes.
- Commit convention: `feat(hostages): ...` / `fix(hostages): ...` / `test(hostages): ...`.
- TDD: failing test first, verify fail, implement, verify pass, commit.
- Run tests from `/Users/janis.kirsteins/Projects/prototypes/02-balticmap` with `npm test -- <file>`; full gate is `npm test && npx tsc --noEmit`.
- A concurrent session commits unrelated work to `03-hostages/` on this branch: NEVER `git add -A`; stage only named files.

---

### Task 1: Engine event enrichment

**Files:**
- Modify: `src/game.ts`
- Test: `tests/game.test.ts` (append)

**Interfaces:**
- Produces (used by Task 3): `GameEvent.formerOverlordFactionId?: string` on `subjugated` events (present when the target already had an overlord); `GameEvent.overlordFactionId` now also set on `released` events (the fallen lord).

- [ ] **Step 1: Write the failing tests**

Append to `tests/game.test.ts` (reuse the file's existing helpers/imports; add a describe block):

```ts
describe("event enrichment", () => {
  it("stamps formerOverlordFactionId when a vassal is poached", () => {
    let g = pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), FACTIONS[0], seededRng(1));
    // beta subjugates gamma first, then alpha (current player) poaches gamma
    g = { ...g, overlords: new Map([["gamma", "beta"]]) };
    g = {
      ...g,
      relations: bumpMight(bumpMight(g.relations, "alpha", "gamma"), "alpha", "gamma"),
    };
    g = withHand(g, 0, ["subjugate"]);
    g = playCard(g, 0, seededRng(1), "gamma");
    const ev = g.log.find((e) => e.type === "subjugated");
    expect(ev?.overlordFactionId).toBe("alpha");
    expect(ev?.formerOverlordFactionId).toBe("beta");
  });

  it("omits formerOverlordFactionId on a first subjugation", () => {
    let g = pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), FACTIONS[0], seededRng(1));
    g = {
      ...g,
      relations: bumpMight(bumpMight(g.relations, "alpha", "gamma"), "alpha", "gamma"),
    };
    g = withHand(g, 0, ["subjugate"]);
    g = playCard(g, 0, seededRng(1), "gamma");
    const ev = g.log.find((e) => e.type === "subjugated");
    expect(ev?.formerOverlordFactionId).toBeUndefined();
  });

  it("stamps the fallen lord on released events", () => {
    let g = pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), FACTIONS[0], seededRng(1));
    // gamma is beta's vassal; alpha subjugates beta, freeing gamma
    g = { ...g, overlords: new Map([["gamma", "beta"]]) };
    g = {
      ...g,
      relations: bumpMight(bumpMight(g.relations, "alpha", "beta"), "alpha", "beta"),
    };
    g = withHand(g, 0, ["subjugate"]);
    g = playCard(g, 0, seededRng(1), "beta");
    const rel = g.log.find((e) => e.type === "released");
    expect(rel?.targetFactionId).toBe("gamma");
    expect(rel?.overlordFactionId).toBe("beta");
  });
});
```

Adapt helper names to what tests/game.test.ts actually has (it has its own setup helpers - read it first; `FACTIONS`, `withHand`, `seededRng` or equivalents exist there or in nearby test files; if `withHand` is missing, inline the hand replacement the way other tests in that file do). Faction ids in that file may differ - use its existing fixture ids, keeping the SHAPE of the three scenarios.

- [ ] **Step 2: Run to verify failure**

`npm test -- tests/game.test.ts` - the new tests FAIL (fields undefined).

- [ ] **Step 3: Implement in src/game.ts**

3a. `GameEvent` gains a field after `overlordFactionId`:

```ts
  formerOverlordFactionId?: string; // subjugated: prior lord of the target
```

3b. In `freeVassalsOf`, the released event gains the lord:

```ts
        events.push({
          turn: state.turn, playerId: p.id, type: "released",
          targetFactionId: vassal, overlordFactionId: lord,
        });
```

3c. In the subjugate branch, read the prior lord BEFORE `overlords.set` and stamp it:

```ts
  } else if (cardId === "subjugate" && targetId !== undefined) {
    const formerLord = overlords.get(targetId);
    freeVassalsOf(targetId);
    overlords.set(targetId, p.factionId);
    ...
    events.push({
      turn: state.turn, playerId: p.id, type: "subjugated",
      targetFactionId: targetId, overlordFactionId: p.factionId,
      ...(formerLord !== undefined ? { formerOverlordFactionId: formerLord } : {}),
    });
```

- [ ] **Step 4: Verify pass, full gate**

`npm test -- tests/game.test.ts` then `npm test && npx tsc --noEmit`.

- [ ] **Step 5: Commit**

`git add src/game.ts tests/game.test.ts && git commit -m "feat(hostages): log former overlord on subjugation and lord on release"`

---

### Task 2: Card rules text on deck screen and postmortem loot

**Files:**
- Modify: `src/cards.ts`, `src/deck-screen.ts`, `src/hud.ts` (pm loot only), `src/style.css`
- Test: `tests/deck-screen.test.ts`, `tests/hud.test.ts` (retarget loot assertions)

**Interfaces:**
- Produces (used by Task 4): `CardDef.text: string` on every card in `CARDS`.
- DOM: `.ds-card` and `.pm-card` become `<span class="...-name">` + `<span class="...-text">`.

- [ ] **Step 1: Failing tests**

In `tests/deck-screen.test.ts`, add (adapting to its existing setup helpers):

```ts
  it("shows rules text on unlock and deck cards", () => {
    // render a view with seenPool ["raid"] and knownCards ["subjugate"]
    // (reuse the file's existing setup pattern)
    const unlock = container.querySelector(".ds-unlock .ds-card")!;
    expect(unlock.querySelector(".ds-card-name")!.textContent).toBe("Raid");
    expect(unlock.querySelector(".ds-card-text")!.textContent).toBe(
      "Gain +1 Might over one faction in reach of your realm.",
    );
    const deckCard = container.querySelector(".ds-deck .ds-card")!;
    expect(deckCard.querySelector(".ds-card-name")!.textContent).toBe("Subjugate");
    expect(deckCard.querySelector(".ds-card-text")!.textContent?.length).toBeGreaterThan(0);
  });
```

In `tests/hud.test.ts`, the learning-loop test asserting `cards.map((c) => c.textContent)).toEqual(["RaidNEW", "Subjugate"])` changes to assert name spans:

```ts
    expect(cards.map((c) => c.querySelector(".pm-card-name")?.textContent)).toEqual(["Raid", "Subjugate"]);
    expect(cards[0].querySelector(".pm-card-new")?.textContent).toBe("NEW");
    expect(cards[0].querySelector(".pm-card-text")?.textContent?.length).toBeGreaterThan(0);
```

Existing assertions that break because of the structure change are updated in the same spirit (target the name span), never deleted.

- [ ] **Step 2: Verify failure**

`npm test -- tests/deck-screen.test.ts tests/hud.test.ts`

- [ ] **Step 3: Implement**

3a. `src/cards.ts` - `CardDef` gains `/** One-line rules text shown to the player. */ text: string;` and every card gets its line (copy EXACTLY from the spec section 3; e.g. raid: "Gain +1 Might over one faction in reach of your realm.").

3b. `src/deck-screen.ts` - both card builders (unlock row and deck row) build:

```ts
          const name = document.createElement("span");
          name.className = "ds-card-name";
          name.textContent = cardName(id);
          const text = document.createElement("span");
          text.className = "ds-card-text";
          text.textContent = CARDS[id]?.text ?? "";
          card.append(name, text);
```

replacing `card.textContent = cardName(id)`. The `ds-filler` div keeps plain text.

3c. `src/hud.ts` - in `renderPostmortem`, the `.pm-card` builder becomes name span + text span (classes `pm-card-name`, `pm-card-text`), keeping the NEW tag append order (name, NEW tag, text).

3d. `src/style.css` - append:

```css
.ds-card-name,
.pm-card-name {
  display: block;
  font-weight: 600;
}

.ds-card-text,
.pm-card-text {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.35;
  color: #6b5d49;
}
```

- [ ] **Step 4: Verify pass, full gate**

`npm test -- tests/deck-screen.test.ts tests/hud.test.ts` then `npm test && npx tsc --noEmit`.

- [ ] **Step 5: Commit**

`git add src/cards.ts src/deck-screen.ts src/hud.ts src/style.css tests/deck-screen.test.ts tests/hud.test.ts && git commit -m "feat(hostages): card rules text on deck screen and loot row"`

---

### Task 3: Notices - details, standing, and targeted-play modals

**Files:**
- Modify: `src/notices.ts`
- Test: `tests/notices.test.ts`

**Interfaces:**
- Consumes: Task 1's event fields.
- Produces (used by Task 4): `Notice.details: string[]` (always present); `NoticeCtx.leads(otherFactionId: string): { might: number; status: number }` (human's leads; positive = you lead).

- [ ] **Step 1: Failing tests**

Rework `tests/notices.test.ts`: the ctx gains a `leads` stub the tests control, e.g.

```ts
let leadsTable: Record<string, { might: number; status: number }> = {};
const ctx: NoticeCtx = {
  humanFactionId: "livs",
  factionName: (id) => (id !== undefined ? NAMES[id] ?? id : ""),
  factionOf: (playerId) => FACTION_BY_PLAYER[playerId],
  leads: (other) => leadsTable[other] ?? { might: 0, status: 0 },
};
```

New/updated cases (keep all existing cases, updating expectations where copy changed):

```ts
  it("first subjugation: fealty line and standing vs the new overlord", () => {
    leadsTable = { jersika: { might: -2, status: 1 } };
    const n = noticeFor(
      ev({ type: "subjugated", targetFactionId: "livs", overlordFactionId: "jersika" }),
      ctx,
    )!;
    expect(n.details).toEqual([
      "You now owe fealty to Jersikans.",
      "Standing vs Jersikans: Might - they lead by 2; Status - you lead by 1.",
    ]);
  });

  it("poach: allegiance shift and standing vs both lords", () => {
    leadsTable = {
      jersika: { might: -2, status: 0 },
      latgale: { might: 0, status: -1 },
    };
    const n = noticeFor(
      ev({
        type: "subjugated", targetFactionId: "livs",
        overlordFactionId: "jersika", formerOverlordFactionId: "latgale",
      }),
      ctx,
    )!;
    expect(n.details).toEqual([
      "Your allegiance shifts from Latgalians to Jersikans.",
      "Standing vs Jersikans: Might - they lead by 2; Status - even.",
      "Standing vs Latgalians: Might - even; Status - they lead by 1.",
    ]);
  });

  it("released names the fallen lord when the event carries it", () => {
    const n = noticeFor(
      ev({ type: "released", playerId: 3, targetFactionId: "livs", overlordFactionId: "jersika" }),
      ctx,
    )!;
    expect(n.what).toBe("The fall of Jersikans to Latgalians releases you from vassalage.");
  });

  it("released falls back when the lord field is absent", () => {
    const n = noticeFor(
      ev({ type: "released", playerId: 3, targetFactionId: "livs" }),
      ctx,
    )!;
    expect(n.what).toBe("The fall of your overlord to Latgalians releases you from vassalage.");
  });

  it("raid against the human raises a modal with standing and threat warning", () => {
    leadsTable = { jersika: { might: -2, status: 0 } };
    const n = noticeFor(
      ev({ type: "play", cardId: "raid", targetFactionId: "livs" }),
      ctx,
    )!;
    expect(n.title).toBe("Raided");
    expect(n.what).toBe("Jersikans played Raid against Lower Daugava Livs.");
    expect(n.details).toEqual([
      "Standing vs Jersikans: Might - they lead by 2; Status - even.",
      "A lead of 2 is enough to subjugate.",
    ]);
  });

  it("marriage against the human raises a modal without warning below threshold", () => {
    leadsTable = { jersika: { might: 0, status: -1 } };
    const n = noticeFor(
      ev({ type: "play", cardId: "shrewd-marriage", targetFactionId: "livs" }),
      ctx,
    )!;
    expect(n.title).toBe("Bound by Marriage");
    expect(n.details).toEqual([
      "Standing vs Jersikans: Might - even; Status - they lead by 1.",
    ]);
  });

  it("play modals do not fire for own plays, AI-vs-AI, or other cards", () => {
    for (const e of [
      ev({ type: "play", playerId: 1, cardId: "raid", targetFactionId: "jersika" }),
      ev({ type: "play", cardId: "raid", targetFactionId: "latgale" }),
      ev({ type: "play", cardId: "subjugate", targetFactionId: "livs" }),
      ev({ type: "play", cardId: "fortify" }),
      ev({ type: "play", cardId: "grow-crops" }),
    ]) {
      expect(noticeFor(e, ctx), `expected null for ${e.cardId}`).toBeNull();
    }
  });
```

Also update the existing subjugated/released full-string tests to set a `leadsTable` and assert `details` accordingly (subjugated always has at least the fealty + one standing line now).

- [ ] **Step 2: Verify failure**

`npm test -- tests/notices.test.ts`

- [ ] **Step 3: Implement src/notices.ts**

Key pieces (integrate into the existing structure):

```ts
import { SUBJUGATE_THRESHOLD } from "./playability";

// Notice gains: details: string[];
// NoticeCtx gains: leads(otherFactionId: string): { might: number; status: number };

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
```

subjugated build:

```ts
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
```

released what:

```ts
        what: `The fall of ${
          e.overlordFactionId !== undefined ? ctx.factionName(e.overlordFactionId) : "your overlord"
        } to ${actor} releases you from vassalage.`,
        details: [],
```

play rule (replaces the silent entry):

```ts
  play: {
    kind: "modal",
    appliesToHuman: (e, ctx) =>
      (e.cardId === "raid" || e.cardId === "shrewd-marriage") &&
      e.targetFactionId === ctx.humanFactionId &&
      e.playerId !== 1,
    build: (e, ctx) => {
      const actor = ctx.factionName(ctx.factionOf(e.playerId));
      const actorId = ctx.factionOf(e.playerId);
      const raid = e.cardId === "raid";
      const details = actorId !== undefined
        ? [
            standingLine(ctx, actorId),
            ...(subjugationRisk(ctx, actorId)
              ? ["A lead of 2 is enough to subjugate."]
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
```

All other rules gain `details: []` in their built notices. NOTE for the standing-line events: standing lines for subjugated use `e.overlordFactionId` (the new lord's faction id, which equals the actor's faction) rather than resolving via playerId - it is already on the event.

- [ ] **Step 4: Verify pass, full gate**

`npm test -- tests/notices.test.ts` then `npm test && npx tsc --noEmit`. Note: hud.test.ts still passes because the details block is not rendered until Task 4 (Notice.details exists but unused there).

- [ ] **Step 5: Commit**

`git add src/notices.ts tests/notices.test.ts && git commit -m "feat(hostages): notice details, standing lines and raid/marriage modals"`

---

### Task 4: HUD - details block and hand-card tips

**Files:**
- Modify: `src/hud.ts`, `src/style.css`
- Test: `tests/hud.test.ts`

**Interfaces:**
- Consumes: `Notice.details`, `CardDef.text`.
- DOM: `.notice-details > .notice-detail` lines between `.notice-what` and `.notice-flavor`; hand `.card` becomes `<span class="card-name">` + `<div class="card-tip">`.

- [ ] **Step 1: Failing tests**

Append to `tests/hud.test.ts`:

```ts
describe("notice details and hand tips", () => {
  function playing() {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
  }

  it("renders detail lines for a subjugation notice", () => {
    const { container, hud } = setup();
    hud.update({
      ...playing(),
      log: [...playing().log],
    });
    let g = playing();
    g = { ...g, log: [...g.log, { turn: 1, playerId: 2, type: "subjugated", targetFactionId: "beta", overlordFactionId: "alpha" }] };
    hud.update(g);
    const lines = [...container.querySelectorAll(".notice-details .notice-detail")].map(
      (el) => el.textContent,
    );
    expect(lines[0]).toBe("You now owe fealty to Alpha.");
    expect(lines[1]).toMatch(/^Standing vs Alpha: Might - /);
    expect(q(container, ".notice-details").classList.contains("hidden")).toBe(false);
  });

  it("hides the details block when a notice has no details", () => {
    const { container, hud } = setup();
    let g = playing();
    g = { ...g, log: [...g.log, { turn: 1, playerId: 3, type: "released", targetFactionId: "beta", overlordFactionId: "alpha" }] };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".notice-details").classList.contains("hidden")).toBe(true);
  });

  it("hand cards carry a name span and a rules tip", () => {
    const { container, hud } = setup();
    const g = withHand(playing(), 0, ["fortify"]);
    hud.update(g);
    const card = q(container, ".hand .card");
    expect(card.querySelector(".card-name")!.textContent).toBe("Fortify");
    expect(card.querySelector(".card-tip")!.textContent).toBe(
      "Gain +1 Might over every other living faction at once.",
    );
  });
});
```

Then fix the existing hand-card assertions that used whole-button textContent (e.g. `cards[0].textContent).toBe("Grow crops")` becomes `cards[0].querySelector(".card-name")!.textContent`) - update, never delete.

- [ ] **Step 2: Verify failure**

`npm test -- tests/hud.test.ts`

- [ ] **Step 3: Implement**

3a. Notice card DOM: create `noticeDetails` (`div.notice-details`) between what and flavor; `showNotice` fills it:

```ts
    noticeDetails.replaceChildren(
      ...n.details.map((line) => {
        const p = document.createElement("p");
        p.className = "notice-detail";
        p.textContent = line;
        return p;
      }),
    );
    noticeDetails.classList.toggle("hidden", n.details.length === 0);
```

3b. NoticeCtx construction in `enqueueNotices` gains:

```ts
      leads: (other) => leadsOf(state.relations, human.factionId, other),
```

(`leadsOf` is already imported in hud.ts.)

3c. `renderHand` card build becomes:

```ts
      const name = document.createElement("span");
      name.className = "card-name";
      name.textContent = CARDS[cardId]?.name ?? cardId;
      const tip = document.createElement("div");
      tip.className = "card-tip";
      tip.textContent = CARDS[cardId]?.text ?? "";
      card.append(name, tip);
```

replacing `card.textContent = ...`.

3d. CSS append:

```css
.notice-details {
  margin-bottom: 10px;
}

.notice-detail {
  font-size: 13px;
  margin-bottom: 4px;
}

.card .card-tip {
  display: none;
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: 180px;
  background: #fdf9f1;
  border: 1px solid #c9b896;
  border-radius: 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.35;
  color: #3f3428;
  z-index: 20;
  pointer-events: none;
}

.card:hover .card-tip,
.card:focus-visible .card-tip {
  display: block;
}
```

(`.card` already has `position: relative` or gains it; check and add if missing.)

- [ ] **Step 4: Verify pass, full gate**

`npm test -- tests/hud.test.ts` then `npm test && npx tsc --noEmit`.

- [ ] **Step 5: Commit**

`git add src/hud.ts src/style.css tests/hud.test.ts && git commit -m "feat(hostages): notice detail lines and hand-card rules tips"`

---

### Task 5: Reach through incorporated lands + size-scaled thresholds

**Files:**
- Modify: `src/playability.ts`, `src/main.ts` (targeting), `src/ai.ts` (only if it does direct threshold arithmetic - read it first)
- Test: `tests/playability.test.ts` (append)

**Interfaces:**
- Consumes: `realmOf`, `leadsOf` (relations.ts), existing `RulesView`.
- Produces: reach passes through incorporated lands to the owner; subjugate needs `SUBJUGATE_THRESHOLD * realmOf(target).length`; reclaim playable while overlord leads on both tracks are under `SUBJUGATE_THRESHOLD * realmOf(overlord).length`. Targeting clicks on incorporated polygons act on the owner.

- [ ] **Step 1: Failing tests**

Append to `tests/playability.test.ts` (adapt to its fixture style - it builds `RulesView` objects directly):

```ts
describe("reach through incorporated lands and scaled thresholds", () => {
  it("adjacency to an incorporated land grants reach to its owner", () => {
    // map: me -adjacent- deadland; deadland incorporated into owner;
    // owner's home NOT adjacent to me. Raid targets must include owner,
    // never deadland.
    const view: RulesView = {
      relations: {},
      overlords: new Map(),
      incorporated: { deadland: "owner" },
      adjacency: { me: ["deadland"], deadland: ["me", "owner"], owner: ["deadland"] },
      factionIds: ["me", "deadland", "owner"],
    };
    const targets = validTargetsFor(view, "me", "raid");
    expect(targets).toContain("owner");
    expect(targets).not.toContain("deadland");
  });

  it("subjugate threshold scales with the target realm size", () => {
    // target owns one incorporated land -> realm size 2 -> needs lead 4
    const base: RulesView = {
      relations: {},
      overlords: new Map(),
      incorporated: { land: "target" },
      adjacency: { me: ["target"], target: ["me"], land: ["me"] },
      factionIds: ["me", "target", "land"],
    };
    let rel = {};
    for (let i = 0; i < 3; i++) rel = bumpMight(rel, "me", "target");
    expect(validTargetsFor({ ...base, relations: rel }, "me", "subjugate")).not.toContain("target");
    rel = bumpMight(rel, "me", "target"); // lead 4 = 2 x realm size 2
    expect(validTargetsFor({ ...base, relations: rel }, "me", "subjugate")).toContain("target");
  });

  it("reclaim scales with the overlord realm size", () => {
    // overlord realm size 2 -> grip threshold 4: leads of 3 still reclaimable
    const view: RulesView = {
      relations: {},
      overlords: new Map([["me", "lord"]]),
      incorporated: { land: "lord" },
      adjacency: { me: ["lord"], lord: ["me"], land: ["me"] },
      factionIds: ["me", "lord", "land"],
    };
    let rel = {};
    for (let i = 0; i < 3; i++) rel = bumpMight(rel, "lord", "me");
    expect(isCardPlayable({ ...view, relations: rel }, "me", "reclaim-independence")).toBe(true);
    rel = bumpMight(rel, "lord", "me"); // lead 4 meets the scaled grip
    expect(isCardPlayable({ ...view, relations: rel }, "me", "reclaim-independence")).toBe(false);
  });
});
```

- [ ] **Step 2: Verify failure**

`npm test -- tests/playability.test.ts`

- [ ] **Step 3: Implement**

3a. `src/playability.ts` `reachOf` maps dead neighbors to owners:

```ts
  for (const member of realm) {
    for (const adj of view.adjacency[member] ?? []) {
      reach.add(view.incorporated[adj] ?? adj);
    }
  }
```

3b. Subjugate check scales:

```ts
      const l = leadsOf(view.relations, factionId, id);
      const needed =
        SUBJUGATE_THRESHOLD * realmOf(id, view.overlords, view.incorporated).length;
      return Math.max(l.status, l.might) >= needed;
```

3c. Reclaim check scales:

```ts
  if (cardId === "reclaim-independence") {
    if (overlord === undefined) return false;
    const l = leadsOf(view.relations, overlord, factionId);
    const grip =
      SUBJUGATE_THRESHOLD * realmOf(overlord, view.overlords, view.incorporated).length;
    return l.status < grip && l.might < grip;
  }
```

3d. `src/main.ts` targeting acts on owners. In `interceptClick`'s armed branch:

```ts
      const raw = regionId !== null ? factionByRegion.get(regionId) : undefined;
      const faction = raw !== undefined ? (game.incorporated[raw] ?? raw) : undefined;
```

and in `applyTargeting`, a region is target-valid when its EFFECTIVE owner is a target:

```ts
  const targets = new Set(armedTargets());
  for (const [id, el] of regionPaths) {
    const f = factionByRegion.get(id)!;
    const effective = game.incorporated[f] ?? f;
    const valid = armed !== null && targets.has(effective);
    el.classList.toggle("target-valid", valid);
    el.classList.toggle("target-invalid", armed !== null && !valid);
  }
```

3e. Read `src/ai.ts`: if it computes subjugation deficits against the flat `SUBJUGATE_THRESHOLD`, scale by the target's realm size the same way; if it only consumes `validTargetsFor`/`playableSet`, leave it.

- [ ] **Step 4: Verify pass, full gate**

`npm test -- tests/playability.test.ts` then `npm test && npx tsc --noEmit`. Existing tests keep passing because single-polygon realms scale by 1.

- [ ] **Step 5: Commit**

`git add src/playability.ts src/main.ts tests/playability.test.ts` (plus `src/ai.ts` if touched) `&& git commit -m "feat(hostages): reach through incorporated lands, size-scaled thresholds"`

---

### Task 6: Map visuals - overlord undim, full-realm stripes, threat badges + Chrome e2e

**Files:**
- Modify: `src/main.ts`, `src/style.css`
- No unit tests (main.ts wiring is e2e-covered by project convention; getBBox is unavailable in happy-dom).

- [ ] **Step 1: Implement undim**

In `applyOwnership`, after `humanRealm` is computed:

```ts
  const overlordRealm = new Set(
    inPlay() && humanOverlord !== undefined
      ? realmOf(humanOverlord, game.overlords, game.incorporated)
      : [],
  );
```

and the dimmed toggle becomes:

```ts
    el.classList.toggle(
      "dimmed",
      inPlay() && !owned && !overlordRealm.has(region.faction),
    );
```

The `owned` class and halo are unchanged - overlord realm members are undimmed only.

- [ ] **Step 2: Full-realm vassal stripes**

`renderVassalOverlay` stripes EVERY polygon of the human realm, not just the home region:

```ts
  for (const factionId of realmOf(human.factionId, game.overlords, game.incorporated)) {
    const regionId = regionByFaction.get(factionId);
    const region = regionId !== undefined ? regionById.get(regionId) : undefined;
    if (!region) continue;
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", region.path);
    p.setAttribute("fill", "url(#vassal-stripes)");
    p.setAttribute("pointer-events", "none");
    vassalOverlayGroup.appendChild(p);
  }
```

- [ ] **Step 3: Threat badges**

New `renderThreatBadges()` called from `refresh()` (and a `badgeGroup` SVG `<g class="threat-badges">` appended by renderMap or created in main.ts on top of regions). For each living faction outside the human realm with a non-zero lead on either track:

```ts
  const l = leadsOf(game.relations, human.factionId, f); // positive = you lead
  // anchor: regionPaths.get(regionId)!.getBBox() center
  // badge: <g class="threat-badge [danger]" transform="translate(cx,cy)">
  //   <rect class="badge-bg" rx=4 .../>
  //   <text><tspan class="lead-{good|bad|even}">M{+/-n}</tspan>
  //         <tspan class="lead-{good|bad|even}" dx="6">S{+/-n}</tspan></text>
  // danger when Math.max(-l.might, -l.status) >=
  //   SUBJUGATE_THRESHOLD * realmOf(human.factionId, ...).length
```

Format numbers with explicit sign from the human's perspective ("M+2", "S-1"). CSS: `.lead-good` green (#2e7d32), `.lead-bad` red (#b3402a), `.lead-even` #6b5d49; `.threat-badge.danger .badge-bg` gets a red stroke; badge font-size ~11px, white bg at 0.85 opacity, `pointer-events: none`. Hide the group outside `inPlay()`.

- [ ] **Step 4: Full gate**

`npm test && npx tsc --noEmit`.

- [ ] **Step 5: Commit**

`git add src/main.ts src/style.css && git commit -m "feat(hostages): overlord undim, realm-wide stripes, threat badges"`

- [ ] **Step 6: Chrome e2e (controller-driven)**

With `npm run dev`: subjugation modal shows allegiance + standing lines; a poach shows the shift line and two standings; raid/marriage against the player raises its modal with post-bump standing (warning line at scaled threshold); hand-card hover shows the rules tip; deck screen unlock/deck cards show rules text; postmortem loot shows text; while subjugated the overlord's realm is undimmed and stripes cover the player's whole realm (incl incorporated polygons); threat badges show signed M/S values with danger styling when subjugation is possible against you; clicking an incorporated polygon while Raid is armed hits its owner; console clean.
