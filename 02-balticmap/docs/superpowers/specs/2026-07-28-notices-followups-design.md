# Notices Follow-ups - Design

Date: 2026-07-28
Status: approved

Follow-ups to 2026-07-27-player-event-notices-design.md from live play feedback.

## Goals

1. The subjugation modal must state whether the player's allegiance changed
   hands (first subjugation vs poach) and remind the player of their standing
   (Might/Status leads) relative to the card player and, on a poach, their
   former overlord.
2. While the human is subjugated, the overlord's whole realm is undimmed on
   the map so the player sees which polygons belong to the power they serve.
3. The deck screen must explain what each card does (unlock row, deck row,
   and the postmortem loot row) instead of showing bare names.

## Rules facts that shape the design

- A played Subjugate always succeeds; legality (reach + the scaled lead of
  section 2b) is checked before the card is playable. There is no "attempted" state - the modal
  always reports a real change of allegiance.
- Poaching is legal: a rival's vassal is a valid Subjugate target; the new
  overlord overwrites the old. No `released` event fires for the poached
  vassal.

## 1. Event enrichment + modal details

The previous spec's "engine untouched" non-goal is relaxed: the engine now
records two extra facts on existing events (logging only, no rule changes).

game.ts:
- `GameEvent` gains `formerOverlordFactionId?: string`.
- The subjugate branch reads `overlords.get(targetId)` before reassignment
  and stamps it on the `subjugated` event when defined.
- `freeVassalsOf` stamps `overlordFactionId: lord` on `released` events.

notices.ts:
- `Notice` gains `details: string[]` (empty allowed), rendered between the
  factual line and the flavor line.
- `NoticeCtx` gains `leads(otherFactionId: string): { might: number; status: number }`
  - the human's leads over that faction (positive = you lead), wired from
  `leadsOf(state.relations, humanFactionId, other)` in the HUD.
- Subjugated details:
  - Allegiance: poach -> "Your allegiance shifts from {former} to {actor}.";
    first -> "You now owe fealty to {actor}."
  - "Standing vs {actor}: Might - {fmt}; Status - {fmt}." where fmt is
    "you lead by N" / "they lead by N" / "even" (tooltip semantics).
  - On a poach (former defined and != actor), the same standing line for the
    former overlord.
- Released `what` now names the fallen lord via `overlordFactionId`:
  "The fall of {lord} to {actor} releases you from vassalage." (falls back
  to "your overlord" when the field is absent).

hud.ts: renders `details` as a `.notice-details` block (one line per entry)
between `.notice-what` and `.notice-flavor`; hidden when empty.

## 2. Overlord realm undimmed + full-realm vassal stripes

main.ts `applyOwnership`: when the human has an overlord, compute
`realmOf(overlord)` and exclude its members from the `dimmed` class. They do
NOT get the `owned` class or halo - undimmed only.

main.ts `renderVassalOverlay`: the overlord-colored stripe overlay covers
EVERY polygon of the human's realm (own polygon plus incorporated lands -
vassal chains cannot exist), not just the home polygon. Verified in Chrome
(main.ts wiring is e2e-covered by project convention).

## 2b. Reach through incorporated lands + size-scaled thresholds

Rules change (user ruling, 2026-07-28):

- **Reach pass-through:** in `reachOf`, an adjacent incorporated land
  contributes its living OWNER to the reach set instead of the dead faction
  id. All targeted cards (Raid, Shrewd marriage, Subjugate) act on the
  owner. Incorporated ids themselves remain invalid targets.
- **Subjugate threshold scales with the target's realm:** required lead is
  `SUBJUGATE_THRESHOLD * realmOf(target).length` (2 per polygon: a 2-polygon
  realm needs a lead of 4).
- **Reclaim scales with the overlord's realm:** playable while the
  overlord's lead on both tracks is under
  `SUBJUGATE_THRESHOLD * (realmOf(overlord) minus the reclaiming vassal itself).length`.
  Excluding the vassal keeps a lone vassal at the historical flat threshold
  of 2; only the overlord's OTHER holdings tighten the grip.
- Targeting UI (main.ts): while a targeted card is armed, clicking an
  incorporated polygon acts on its owner, and target-valid highlighting
  covers every polygon whose effective owner is a valid target.
- ai.ts: any direct threshold arithmetic follows the scaled rule (reads
  validTargetsFor where possible).

## 3. Card rules text

cards.ts: `CardDef` gains `text: string` - one concise rules line each:
- grow-crops: "No effect - a quiet season. Fills out the deck."
- raid: "Gain +1 Might over one faction in reach of your realm."
- shrewd-marriage: "Gain +1 Status over one faction in reach; your overlord is always courtable."
- fortify: "Gain +1 Might over every other living faction at once."
- subjugate: "Turn a faction in reach into your vassal. Needs a lead of 2 per land of their realm. Vassals pay tribute."
- incorporate: "Permanently absorb one of your vassals into your realm."
- reclaim-independence: "Cast off your overlord. Playable while their lead in Might and Status is under 2 per land of their other holdings."
- pay-tribute: "Forced: while a vassal, grant your overlord +1 Might or +1 Status."

Rendering: `.ds-card` (unlock row and deck row) and `.pm-card` (postmortem
loot) become name + small muted text line:
`<span class="ds-card-name|pm-card-name">` + `<span class="ds-card-text|pm-card-text">`.
Existing tests asserting whole-button textContent are retargeted at the name
span.

## 4. Hand-card rules popup (game loop)

Hand cards show their rules text on hover/keyboard focus so the player knows
what a card does before playing it (e.g. Fortify). CSS-only popup:
`.card` is restructured to `<span class="card-name">` + `<div class="card-tip">`
(the tip holds the card's `text`); the tip is hidden by default and shown on
`.card:hover` / `.card:focus-visible`, positioned above the card. Existing
tests asserting whole-button textContent are retargeted at `.card-name`.

## 5. Modals for targeted relation plays against the human

When another player plays Raid or Shrewd marriage targeting the human, the
`play` event now raises a modal (the registry's `play` rule becomes `modal`
with a predicate; all other plays stay silent through the same predicate):

- Predicate: `cardId` is `raid` or `shrewd-marriage`, `targetFactionId` is
  the human, `playerId !== 1`. Subjugate/incorporate plays are excluded -
  their dedicated events already modal (or end the game).
- raid: title "Raided"; what "{actor} played Raid against {human}."; flavor
  "Riders came at dawn; granaries burn. Word of your weakness spreads."
- shrewd-marriage: title "A Shrewd Marriage"; what "{actor} played Shrewd
  marriage against {human}."; flavor "A wedding feast beyond your borders.
  Their standing grows at your expense."
- details: "Standing vs {actor}: ..." (post-bump leads), plus a warning line
  "A lead of {grip} is enough to subjugate." when their best lead over you is
  >= the SCALED grip (SUBJUGATE_THRESHOLD x human realm size, via
  NoticeCtx.subjugationGrip()).

Known risk, accepted for now: several such plays can land per AI round, so
these modals will be frequent. If play feedback says it is spammy, the
dial-back is one registry edit (predicate or kind), which is the point of
the registry design.

## 5b. Consolidated batch notices, flavor removed (user ruling, 2026-07-28)

Play feedback: flavor text hurts parseability and per-event modals are
annoying to dismiss. Amendments to sections 1 and 5:

- `Notice` loses `flavor` entirely (field, DOM element, CSS). Modals are
  factual only: title, what-line, detail lines, consequence.
- Notices are built per BATCH, not per event: the HUD hands the whole
  fresh-event diff to `buildNotices(events, ctx): Notice[]`, which groups
  noticeable events by kind (event type + cardId) and emits ONE notice per
  group, so one AI round produces at most one modal per kind.
- Raid group: single actor keeps "{actor} played Raid against you."; N > 1
  becomes what "N players played Raid against you:" with one detail bullet
  per actor: "{actor} - Might: {fmt}; Status: {fmt}" plus the suffix
  " - a lead of {grip} subjugates you" on actors whose best lead over you
  meets the scaled grip. Same shape for Shrewd marriage.
- Subjugated group: single event keeps the fealty/shift + standing format;
  multiple subjugations in one round (poach chains) list each transition as
  a bullet in log order; the Pay Tribute consequence line appears once.
- Released group: same collapsing; each release is one bullet when N > 1.
- The per-event registry (`NOTICE_RULES`) remains the compile-time
  modal-or-silent enforcement point; grouping is a presentation layer on
  top of it.
- Detail lines render as a bulleted list when the notice has more than one
  actor line (CSS list styling on `.notice-details`).

## 6. On-map Might/Status badges for enemy factions

Threat borders are too subtle; the player cannot see at a glance whom to
fear. main.ts renders an SVG badge group per living faction outside the
human realm, anchored at the faction's home-region path bbox center:

- Format: "M{+n|-n} S{+n|-n}" from the HUMAN's perspective (positive = you
  lead). Factions with 0/0 on both tracks get no badge (clutter control).
- Per-track color: green tone when you lead, red tone when they lead,
  neutral when even (chips colored independently).
- Danger marker: when their best lead over you meets the scaled subjugation
  threshold (2 x your realm size), the badge gains a warning style (red
  ring + "!") - "they can subjugate you".
- Badges re-render on every refresh(); hidden outside the playing phase.
- e2e-verified in Chrome (getBBox is unavailable in happy-dom, so this
  stays in main.ts by convention).

## 7. Hover highlights the whole realm (user ruling, 2026-07-28)

Vassal polygons are painted in their overlord's color, so vassal and
incorporated lands are visually indistinguishable and realm boundaries are
unreadable. On hovering any polygon during play:

- Resolve the realm root of the hovered polygon: owner if incorporated,
  then that faction's overlord if it is a vassal (chains cannot exist).
- Highlight EVERY polygon of that root's realm - root, its vassals, its
  incorporated lands, plus incorporated lands owned by its vassals - with a
  distinct realm-hover border and full opacity (undimmed while hovered,
  even if normally dimmed).
- The hovered polygon itself additionally gets a dashed border when its
  faction is subjugated but NOT incorporated (a vassal that could yet break
  free), so vassalage reads differently from permanent absorption.
- Implemented in main.ts (onHover already receives the region; add a
  realm-hover applier next to applyOwnership) + style.css classes
  `.realm-hover` / `.vassal-hover`. Cleared when the hover leaves or the
  phase is not in play. e2e-verified (main.ts convention).

## Non-goals

- No change to Subjugate/poach legality or AI behavior (balance is a
  separate conversation).
- Fortify stays silent: it is untargeted (bumps Might over everyone), so
  modaling it would fire for nearly every AI turn; the hand popup now
  explains what it does.

## Testing

- game.test.ts: poach scenario asserts `formerOverlordFactionId`; released
  event asserts `overlordFactionId`.
- notices.test.ts: first-subjugation details (fealty + one standing line),
  poach details (shift + two standing lines), lead formatting (you lead /
  they lead / even), released what-line with and without the lord field;
  raid/marriage-vs-human modals (incl subjugation warning line), raid by
  human and AI-vs-AI stay null, subjugate play event stays null (no double
  modal with the subjugated event).
- hud.test.ts: details block renders lines and hides when empty; loot row
  name/text spans; hand cards have card-name + card-tip with rules text.
- deck-screen.test.ts: unlock and deck cards render name + text spans.
- Full suite + tsc + Chrome e2e (modal details on a real poach, raid/marriage
  modal, hand popup on hover, overlord realm undimmed, deck screen texts).
