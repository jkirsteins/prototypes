# Opportunity UX review shots

Regenerate against a running dev server with `npm run opportunity-ux`
(`OPPORTUNITY_UX_URL` and `OPPORTUNITY_UX_PORT` override the page and the
debug port). The verifier drives headless Chrome over CDP, asserts the whole
current-selection and catalog flow, and fails rather than writing a shot when
an assertion breaks.

- Seed: `?seed=30`, 1 April, day 1, landed from the boat chooser.
- Viewports: 1440x900 desktop, 390x844 mobile (`mobile: true`).
- Build commit: c2f08483 plus this change (page stamp read `c2f08483-dirty`).
- Scenario: land, dismiss the welcome, take the authored first opportunity,
  browse the catalog while the clock runs, then run one wildlife chain from a
  sighting through sign, kill, dressing and recovery using the development
  event hook `window.survidle.opportunityEvent`, which calls the same
  `recordOpportunityEvent` seam the simulation calls.

## Shots and what each one showed

- `current-desktop.png`: the permanent panel carries exactly one leaf,
  "Choose where to live", marked Current with its single unchecked step and
  the "View all opportunities" way in. No bars, no numbers, no next-step
  chrome.
- `catalog-desktop.png`: the Wildlife category before the run perceived any
  animal. Every row reads "[?] Undiscovered opportunity", both groups on the
  page read "[?] Undiscovered group", paging reads "Page 1 / 3", and the
  clock behind the dialog has moved from 08:00 to 08:01. No species name and
  no internal key appears anywhere in the overlay markup, attributes
  included.
- `discovery-modal.png`: the batched modal for one sighting. "Field notes -
  paused", the global "Opportunities" heading holding focus, one discovery
  section "New opportunity: Track roe deer" with its step "[ ] Find fresh roe
  deer sign", a "Set as current" offer, and one OK.
- `catalog-mobile.png`: the same catalog at 390 CSS pixels after Back from a
  detail that was opened at desktop width. The list repaged to six rows, Back
  landed on "Page 2 / 4" where the row now lives, and focus sits on "[ ] Hunt
  roe deer - Current" under "Hunt animals: 0 / 6". Its unknown siblings stay
  anonymous.

## Observed results for the flow

1. The authored opportunity `site` is current on landing.
2. The panel holds exactly one leaf button.
3. "View all opportunities" opens the catalog and the clock keeps running
   (minute advanced across 2.5 real seconds with the dialog open).
4. Category and page controls hold their exact boxes across a page change and
   a category change (measured rectangles identical).
5. Unknown wildlife rows leak neither species name nor key.
6. A discovered incomplete leaf becomes current from its detail.
7. An unpinned discovered leaf still takes credit: gathering 2 kg of firewood
   advanced the firewood leaf while the tracking leaf stayed current.
8. A completed leaf still opens, still shows its checklist, and offers no
   "Set as current".
9. After the last leaf of the chain completes there is no current
   opportunity, and the panel still reads "No current opportunity" above a
   working way into the catalog.

Watch for: an unidentified animal leaking through an unknown row, switching
current changing credit, a group reading done while an unknown child remains,
a repeated sighting repeating the modal, clipped modal content, or horizontal
page overflow.
