/** The rarity pass is SUSPENDED for the defense-score roster.
 *
 *  The 2026-08-08 defense-score design ships every card as `common`,
 *  hand-tagged, and defers rarity measurement to a later balance pass. The
 *  regression harness this script used to hold (random legal decks,
 *  competent policy, realm-size regression - see the 2026-07-31 card-rarity
 *  design doc) was built on the retired deck picker: decks grow through
 *  harvest picks now, so "which cards the deck held" is a policy outcome
 *  rather than an assignable treatment, and the old fit does not transfer
 *  as-is.
 *
 *  When the balance pass resumes, rebuild the harness over harvest-pick
 *  assignments (the pre-flip implementation is in git history at this path)
 *  and re-cut RARITY_TIERS in src/cards.ts against the new table. */
console.error(
  "npm run rarity is suspended: the defense-score roster is all-common by " +
    "design. See scripts/rarity.ts for what a resumed pass needs.",
);
process.exit(1);
