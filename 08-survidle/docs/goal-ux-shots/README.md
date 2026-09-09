# Goal UX review shots

Regenerate against `?seed=3` on a running dev server with `npm run goal-ux`.
The verifier checks 1440x900 desktop and 390x844 mobile layouts. It also
checks arrow-key map inspection and visible wildlife in the cell tooltip.

- `first-goal-desktop.png`: direct first-week guidance after the welcome.
- `night-goals-desktop.png`: the first parallel bed and roof goals.
- `monthly-prompt-desktop.png`: the wider, less prescriptive first-month goals.
- `first-goal-mobile.png`: the opening modal at 390 CSS pixels.

Check for clipped modal content, horizontal page overflow, repeated guidance,
or a goal row whose progress cannot be read without opening it.
