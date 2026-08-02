# Chains of vassalage: vassal Subjugate/Incorporate, transitive realms

Decided with the user on 2026-08-02. Every "Decided:" line below was an explicit
answer; the rest follows from the code as it stands.

## Goal

Vassals may play Subjugate and Incorporate, so chains of vassalage form
(A -> B -> C, each entry a lord holding the next). The ultimate overlord's
realm counts everything under it, and only free factions can win. (Tribute
flowing up hop by hop was part of this design and later reversed - see
section 7.)

## What does not change

- The data model. `overlords` stays the flat vassal -> lord map; a chain is an
  entry whose lord is itself a vassal. `incorporated` stays flat and never
  deepens (Incorporate still re-parents the target's annexations to the actor).
- Revolt. Deleting one `overlords` entry already detaches a mid-lord with its
  subtree intact. The parting +1/+1 blow is unchanged.
- Stranded and defeat checks, loyalty clocks, poach surcharge (still the
  incumbent direct lord's grip), subjugation/poach odds, hostage rules.
- Raid and Assassinate ruler stay blocked against the DIRECT overlord only.
  Decided: "my vassal's vassal is not my vassal" - plotting against the
  grand-overlord is legal intrigue.

## 1. Legality (`src/playability.ts`)

- The `actor-subjugated` block reason is deleted for both Subjugate and
  Incorporate - and with those its only two uses, the variant and its
  `target-explanations` wording go entirely. Decided: both cards open, not just
  Subjugate.
- New block reason `liege`: Subjugate may not target any faction in the actor's
  own overlord chain (direct lord, that lord's lord, and so on to the root).
  This is exactly cycle prevention: setting `overlords[target] = actor` creates
  a cycle if and only if the target is an ancestor of the actor. No other
  cycle check is needed anywhere.
- `subjugationRequirement` replaces its actor-is-free guard with the same
  ancestor guard (null when the target is an ancestor of the actor).
  Consequence, deliberate: vassals now appear in `threatsTo`, on map badges and
  in `danger` flags. The AI defends against vassal threats and the human sees
  bars against vassal rivals.
- A lord may Subjugate its own grand-vassal (its vassal's vassal). That is a
  poach against its own vassal - usual 50% roll, usual surcharge - and
  flattens the pyramid one level. Direct vassals stay blocked by
  `already-vassal`.
- Sibling poach is legal: two vassals of the same lord may Subjugate each
  other (poach roll and surcharge against their shared lord's grip), deepening
  the chain under that lord.

## 2. The bar counts the subtree

`gripPartsOn` switches from the target's direct realm to its full transitive
realm: every land under the target (vassals of vassals, plus each member's
annexations), and every settlement founded in those lands. Taking a lord takes
its pyramid, so a pyramid is exactly as hard to take as it is big. The old
"Subjugate frees its target's vassals, so they must not raise the bar"
rationale inverts along with the freeing rule (section 4).

## 3. Realm walks (`src/relations.ts`)

- `fullRealmOf` becomes a transitive walk: start from the root, repeatedly add
  vassals of members and annexations of members until closed. Its "two steps
  reach everything" doc comment is rewritten; the walk needs no visited-set
  subtlety beyond a plain worklist because the liege rule keeps `overlords`
  acyclic.
- `realmRootOf` loops to the true root: resolve an incorporated land to its
  owner once (the store is flat), then follow `overlords` upward until free.
- Score, win condition, postmortem, ownership shading, hover halo all inherit
  chains through these two functions with no caller changes.
- Only free factions win. Decided: a vassal's realm is a strict subset of its
  overlord's, so victory belongs to roots. The human victory branch in
  `playCard` additionally requires the human to have no overlord; the rival
  unifier search additionally skips factions with an overlord. When a vassal's
  subtree and its root's realm cross the threshold on the same play, the root
  is the unifier.

## 4. Reach and Raid follow the full realm

Decided: full subtree, not direct realm.

- `reachOf` walks the actor's full transitive realm: a grand-vassal's border
  is the pyramid's border for targeting.
- `borderStrength` counts bordering lands from the actor's full realm. Raid's
  convex `raidYield` therefore scales with the whole pyramid - a deliberate,
  balance-shifting buff to tall realms. `npm run balance` after the batch
  settles; expect the stalemate number and play shares to move.
- The target side of `borderStrength` is unchanged: the core being raided is
  still the target plus its own annexations. A vassal is its own faction and
  is raided separately.
- `sharedNeighboursOf` excludes both allies' FULL realms from a pact's frozen
  `against` list - a pact must not buy a lead over your own grand-vassal.
  Already-frozen pacts are untouched (frozen means frozen).
- Found a settlement's inward realm follows too: "your realm" for the picker
  is the full realm, so a lord may found in a grand-vassal's land. The
  settlement still belongs to the land and raises whatever bar that land sits
  under (section 2). Flagged for user review; small and consistent, but it was
  not explicitly asked.

## 5. Subjugate resolution (`src/game.ts`)

Decided: the subtree comes along. The subjugate branch drops
`freeVassalsOf(targetId)`; no `released` events fire when a lord is taken.
Unchanged: the target's hostage debt to its former lord is dropped, the
poached target gains +1/+1 over the former lord, tribute cards are injected
into the target alone (its vassals were already paying it and keep paying).
A poached mid-lord keeps the hostages it holds of its own vassals - those
vassalages survive the poach.

## 6. Incorporate resolution

Decided: digesting a mid-lord frees its vassals. `freeVassalsOf(targetId)`
stays in the incorporate branch and is now a real rule, not defense - its
"chains never exist" comment is rewritten. Each freed vassal gets a
`released` event, its tribute cards stripped, and any hostage the digested
lord held of it is dropped. Stated out loud: Incorporate can SHRINK your full
realm - you trade the freed subtree for one permanent land. That is the deal
the card now offers a pyramid-builder.

The actor may itself be a vassal; the annexation lands in the actor's own
`incorporated` holdings and flows to the root only through the realm walk.
Passive Fortify stays with whoever annexed - tempo belongs to the digesting
lord, not the root.

## 7. Tribute cascade - REVERSED by the wealth design

Decided later the same day (see the 2026-08-02 wealth design, section 3):
tribute reaches the DIRECT lord only. The cascade below shipped as `8f0cd5e`
and is removed by the wealth work - the `tribute-forwarded` event type and
its entries in `NOTICE_RULES`, `nestsUnderItsPlay`, `walkStandings`, the xp
weights and the hud go with it.

The reason is consistency with tribute paid in wealth: a track bump can be
duplicated per hop, a coin cannot, and two tribute rules that differ in reach
would make the fallback path strictly better for every lord above the first.
Value still reaches a chain's root because each link's own tribute plays pay
from the treasury the coins landed in.

The original decision, kept for the record: forwarded per hop, each lord
gaining the payer's multiplied `mult` over its own immediate vassal, hostage
debt moving only for the payer, per-hop `tribute-forwarded` log lines.

## 8. Prose and map surfaces

- Hover lines that say "vassal of X, itself your vassal" generalize to one
  direct link plus the ultimate root ("vassal of X, ultimately your vassal" /
  "ultimately a vassal of Y") instead of spelling whole chains.
- Ownership shading colours a land by `realmRootOf` (now the true root).
  Vassal stripes keep showing the DIRECT lord relationship per pair.
- The overlord halo keeps haloing the direct lord's realm, which is now that
  lord's full subtree.
- Card texts: the tribute cards keep naming the direct overlord only (the
  chain clause left with the cascade - section 7; the wealth design owns
  their wording now). Subjugate's text is not growing (its "2 per land of
  their realm" now simply means the full realm).

## 9. AI and evidence

- The Subjugate and Incorporate policy branches fire for vassal seats the
  moment legality opens; `POLICY_COVERAGE` entries updated to say vassal play
  is covered by the same branches. The emergency-defence step reads
  `threatsTo` and so defends against vassal threats with no new code.
- `npm run balance` after the batch settles. Expect movement: full-subtree
  Raid and vassal expansion shift bands. The committed seeded fixture will
  re-derive; that is behaviour change, not rng drift.

## Edge cases pinned by tests

1. Cycle block: in Z -> A -> B, B cannot Subjugate A (direct liege) or Z
   (transitive liege); both report `liege`, and `subjugationRequirement`
   returns null for both.
2. Sibling poach: B and C under A; B Subjugates C -> A -> B -> C on success;
   on a failed roll nothing moves but the card.
3. Root flattens: in A -> B -> C, A Subjugates C (poach vs B); success makes
   C a direct vassal of A and C's +1/+1 lands on B.
4. Poached mid-lord: X Subjugates B out of A -> B -> C; B and C both leave
   A's full realm in one play; B's hostage debt to A is gone; B's hostage of
   C survives.
5. Mid-lord revolt: B revolts from A and keeps C; A's full realm loses both.
6. Incorporate mid-lord: A incorporates B in A -> B -> C; C is freed with a
   `released` event and stripped tribute cards; B's annexations re-parent to
   A; A's full realm loses C and keeps B's land permanently.
7. (Reversed - see section 7.) Tribute in A -> B -> C reaches B only; the
   wealth design's tests own the tribute rules now, including that no
   `tribute-forwarded` event is emitted anywhere a chain exists.
8. Bar: Subjugating B, where B holds vassal C and C has annexed a land with a
   settlement in it, demands 2 per land counting B, C and the annexed land,
   plus 1 on the Might track for the settlement.
9. Reach: A whose grand-vassal borders E can aim Raid at E, and the yield
   counts the full-realm bordering lands.
10. Victory: a free human at winSize wins; the same human as a vassal does
    not; a vassal AI subtree at winSize is never the unifier - its root is.
11. Vassal threats: a vassal whose lead clears the human's bar appears in
    `threatsTo` and flips `danger`.
12. (Reversed - see section 7.) `tribute-forwarded` and its suite entries are
    removed by the wealth work.

## Out of scope

- Boot params for overlord chains (`rel=` has no vassalage today; unchanged).
- Any change to hostage counts, poach odds, surcharge formula, or the
  Incorporate loyalty ramp.
- Rarity re-measurement: no card is added; if `npm run balance` shows a
  changed card's impact tier moved, that is a follow-up, not this change.
