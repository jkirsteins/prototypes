# Weather Sense merge-health report

Date: 2026-09-10

Branch: `survidle/weather-sense`

Recommendation: healthy enough to merge.

## Shipping boundary

This branch completes the approved non-lightning weather survival system:

- shared protection levels 0-3, with useful partial protection at level 1
- found natural cover, cover improvement, and persistent partial emergency-shelter progress
- field fires and field food/water processing constrained by tools, fuel, and weather rather than camp identity
- Natural Shelter, Shelter Building, and Weather Sense skills
- staged forecasts and meaningful sky-reading information
- expected-outcome choice among returning home, using local cover, and using a remote refuge
- differentiated rain, snow, and gale behavior
- ten event-backed goals across shelter, forecasting, and remote self-reliance chapters

Lightning remains deliberately deferred. Nothing in the shipping scope depends on it.

## Latest-main integration

Freshly fetched `origin/main` is `c7284dd2c8c86bd7019a9f0683d5786b781f37b1`. It was merged as `9753c8b0`, and a final ancestry check confirms that revision is an ancestor of branch HEAD.

The difficult integration point was main's fixed one-minute advance model plus continuous detailed-wildlife motion. The resolution preserves fixed committed ticks and subdivides only at an exact fractional storm onset. Detailed wildlife is evaluated once per committed tick. If the survivor dies in the first subdivision, the already-committed tick finishes in world-only mode so time and wildlife remain aligned. A regression test covers the death, fractional onset, carry, clock, and wildlife-position combination.

Three independent integration reviews found no remaining actionable conflict or auto-merge risk.

## Verification evidence

| Check | Result |
|---|---|
| Focused weather, wildlife, save, and integration coverage | 127 tests passed plus typecheck |
| Complete fast suite | 57 files, 694 tests passed in 16.26 s on the final clean-tree run |
| Complete slow suite | 99 files, 1300 tests passed in 1091.24 s |
| Production build | Passed, 431 modules transformed in 3.62 s on the final clean-tree run |
| Root lint | Exit 0, 600 files checked, 29 unrelated/pre-existing warnings |
| Goal UX probe | Passed; shelter chapter capture added and existing captures refreshed |
| Sky visual probe | All 17 cases matched after refreshing intentional forecast/plan changes |
| Reference gate | 5/5 seeds passed |
| December gate | 5/5 seeds survived 30 days, sleeping 7.8-7.9 h/day |
| Year gate | 4/5 seeds reached day 366 |
| Lineage runner | Exit 0; 4/5 seeds reached a year within six lives |
| Weather/shelter cohort probe | Every cohort survived 4/4; skill levels changed response and fire timing |

The expected Datadog offline diagnostic still appears on stderr in the fast suite. It is an existing test-path diagnostic, not a failure.

## Discrepancies investigated and addressed

### Wayfinding-vantage slow probe

The first post-merge slow run passed 1299/1300 tests. The failure asserted that higher vantage skill could never shorten a discovery sweep. Latest main replaced the old first-blocking-canopy rays with terrain/elevation-aware viewsheds, so individual routes now move in both directions.

Across the retained twelve seeds, median sweep times were:

- level 1: 370.0 minutes
- level 10: 374.5 minutes
- level 20: 369.5 minutes

That is no material sweep-speed advantage, which is the probe's actual contract. The assertion now permits a symmetric 5 percent change and still prints all seed arrays on failure. The runner generates each seed's world once and clones it across ranks, reducing isolated runtime from about 457 seconds to 306 seconds without weakening coverage. The full slow suite then passed.

### Seed 19 lineage change

The earlier pre-main branch run let seed 19 reach a year on life 6. After absorbing latest main, it dies at days 58, 64, 89, 61, 77, and 117, with the final death from freezing.

An isolated run of exact `origin/main` was worse: days 66, 2, 74, 58, 73, and 67, with no year reached. The weather branch therefore materially improves the inherited latest-main trajectory, but does not restore the older result. This is balance calibration, not an integration or runner bug, so I did not tune weather rules around one seed.

## Balance and calibration findings

These are real findings, but they are not merge blockers for this scoped feature:

- The horizon probe's manual, jobs/grinds, keeps, and trap/hut/trough stages remain longer than their old bands. Stocked starts remain within band.
- The year gate is 4/5. Surviving seeds often accumulate very large food stores, driven especially by large-game yield.
- The lineage reach result is 4/5, while the non-gating monotonic-life trend is 2/5.
- In the bounded six-hour storm cohort, all skill combinations survive. Weather Sense clearly buys earlier decisions (minute 1 versus minute 120), and Shelter Building changes construction/fire timing, but this sample does not prove a survival-rate advantage.
- The slow goals-year and lineage probes are expensive. Their runtime is a runner-maintenance concern, not a simulation failure.

I left these values visible rather than adjusting food, hunting, cold, or skill constants inside a shelter/weather branch.

## Judgment calls

1. I merged latest main instead of rebasing because the user explicitly requested a merge and the branch already contained reviewed task history.
2. I preserved main's fixed-tick semantics and inserted an exact onset subdivision, instead of reverting continuous-world behavior or accepting a delayed storm snapshot.
3. I made nearby-camp tests give that camp real shelter. A bare named camp should not automatically beat locally achievable protection.
4. I isolated the seasonal goal-tail runner from newly authored chapters by completing nonseasonal goals through the shared `GOALS` list. The probe remains about its documented seasonal tail.
5. I recalibrated the stale vantage assertion to measure material effect in either direction. I did not delete seeds or loosen it based on one sample.
6. I kept goal opportunities simulation-backed: claim suitable natural weather first, synthesize only within the teaching guard, and never complete a find-shelter goal on a failed search.
7. I treated the seed 19 and food-surplus results as balance findings. Changing unrelated survival economics to make the report greener would hide useful evidence and enlarge scope.
8. I kept lightning out of this merge. The core loop is complete without introducing rare stochastic instant death.

## Merge assessment

The implementation, save migration, UI, deterministic goal opportunities, merge-conflict resolution, and fast/slow gates are healthy. The remaining findings are known balance calibration and test-runtime costs, not correctness failures. This branch is ready to merge.
