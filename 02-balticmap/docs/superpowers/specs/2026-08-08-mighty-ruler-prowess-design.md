# Mighty ruler and ruler prowess

A new deck-buildable card, "Mighty ruler", levels up a `prowess` attribute on
the acting faction's current ruler. Prowess makes that ruler's own Subjugates
cheaper: the bar `subjugationRequirement` quotes is reduced by
`floor(prowess / 4)`, never below 1.

## Decisions, and why

- **floor(prowess / 4), flat off the total bar.** The user-facing rule is
  "0.25 per level". Every quantity on the subjugation path is an integer -
  bars, leads, the poach surcharge - and a fractional bar would render as
  "a lead of 7.5" and wobble the AI's `>=` tie-math, so the quarter is made
  integer at the boundary, the same move `poachSurchargeOn` makes with
  `Math.ceil`. Levels 1-3 therefore move nothing. That weakness was
  presented (with -1-per-level and per-land alternatives) and chosen
  deliberately; the rarity pass, not intuition, prices the result.
- **The bar never drops below 1.** `Math.max(1, ...)` at the one place the
  reduction applies. Without it a leveled ruler against a one-land target
  reaches bar 0, and a lead of 0 clears a bar of 0: subjugation must never
  be free.
- **The attribute is "prowess", not "might".** "Might" is the relation
  track, on every log suffix and badge. A ruler stat with the same name
  would be ambiguous in every sentence that mentions both. Lowercase in
  prose, never labelled "Might" anywhere.
- **It lives on the `Ruler` object.** Assassination replaces the ruler, and
  `replaceRuler` builds the successor as a fresh literal - so "a successor
  starts unproven" falls out of the model instead of being a rule someone
  must remember. A faction-keyed counter on `GameState` (the `omens` shape)
  would survive succession unless every succession path remembered to clear
  it. A test pins the whole successor literal so a future spread cannot
  quietly inherit prowess.
- **Actor-scoped, applied in `subjugationRequirement`.** The bar is a fact
  about the target (`gripPartsOn` stays bare arithmetic, actor-less);
  prowess is a fact about the actor. The only seam that knows both sides is
  `subjugationRequirement`, and everything actor-aware - threats, guard
  cases, the map race, the "can subjugate you at a lead of N" notice line -
  already flows through it. The actor-less `subjugationGrip()` footnote
  keeps quoting the generic bar: it answers "what does anyone need", and
  the per-rival line is where a particular ruler's discount shows.
- **Fully symmetric.** AI factions play it too (a real `POLICY_COVERAGE`
  branch at 9c: above turnips, below anything that moves the map now), so
  witnessing an enemy play is the discovery route, and assassinating a
  leveled enemy ruler is a genuine defensive play - it removes the discount
  and, since Assassinate ruler resets the Might lead, the standing with it.

## Consequences owned

- The two inline `subjugationGripOn + poachSurchargeOn` recomputations in
  the AI (steps 6 and 9) collapse onto `subjugationRequirement`, so the
  discount cannot drift out of the AI's build math. Their `null` cases
  (grand-liege pairs) are skipped rather than priced with a meaningless bar.
- The `insufficient-lead` payload grows `prowessReduction`, the effective
  (clamp-aware) number, so the tooltip column still sums to its heading.
- The Status-track removal (2026-08-08) landed first: one track, one bar,
  so the discount touches the only route to subjugation. Priced by
  `npm run rarity` after the fact, like every acquirable card.
