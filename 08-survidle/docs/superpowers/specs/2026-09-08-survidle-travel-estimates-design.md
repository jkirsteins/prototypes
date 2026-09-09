# Survidle: one travel estimate

## Problem

At `225db00`, the map tooltip can show `2.6 km S` in its heading and
`3.3 km, 1 h 6 min walk` beneath it. The first value is straight-line
orientation from `whereIs`; the second is the routed distance and travel time.
Both values are correct, but the second line does not name its route geometry,
and the paired distance and time make every travel offer longer than it needs
to be.

The same pairing is assembled independently in the Places list. Region travel
shows only time, while some task details contain distance in prose. There is no
single display rule and no way for a player to choose the measure they find
most useful.

Action rows have the opposite omission. `Fell any tree - 1 h` is the work at
the selected tree cell. It does not include the initial walk to that cell, but
the row does not say that it will walk first. The runner knows the first leg;
the presentation does not receive it as structured data.

The tooltip's `as a camp` line also lists minutes from the hovered cell to the
region's generated forest, shore and heath spots. Those generated spots do not
control where work happens, now that actions choose the nearest usable cell.
The estimates therefore describe implementation landmarks rather than useful
camp properties. `seep possible` is different: it is a real capability of the
specific hovered cell.

## Decisions

### One browser-wide preference

Travel estimates have one presentation preference:

- `distance`: `3.3 km`
- `time`: `1 h 6 min`
- `both`: `3.3 km, 1 h 6 min`

The default is `distance`.

The preference belongs to the browser, not the run. It is stored in
`localStorage` under a display-preferences key, validated on load, and falls
back to `distance` when missing or malformed. Starting a new survivor, dying,
or clearing a game save does not change it.

Settings gains a compact `Travel estimates` select with the three choices.
Changing it saves immediately and redraws the affected UI. This is
presentation only: it never enters `GameState`, the forecast worker, or
simulation saves.

### One formatter

A UI module owns:

- the `TravelDisplay` union: `distance | time | both`;
- loading and saving the browser preference;
- a pure travel-estimate formatter receiving routed kilometres, routed game
  minutes, and the selected display;
- the default display value.

The formatter is the only place that joins distance and travel time. It uses
the existing `fmtKm` and `fmtDuration` functions. It returns text, not markup,
so callers remain responsible for escaping and placement.

This component applies only where distance and time are alternative readings
of the same route. It does not replace:

- task or work duration, such as `Fell any tree - 1 h`;
- active-task countdowns;
- fire, injury, sickness or skill durations;
- walked-distance statistics;
- map scale or straight-line orientation.

### Structured initial walks

`TaskOption` gains an optional initial-walk value containing:

- destination cell;
- destination wording;
- whether the destination was selected explicitly or chosen as nearest;
- routed kilometres;
- routed game minutes.

`intentOption` produces this value from the same resolved request and routing
rules used when the action starts. It is absent when the survivor is already at
the first working cell or no initial route will run.

The value describes only the first movement before work begins. It does not
predict returning produce to camp, hauling later loads, repeating an order, or
movement caused by a future body need.

The initial destination must reflect the actual first leg. Most work goes to
its resolved work cell. A build that will first fetch material from another
pile reports that source cell instead. Presentation must not infer this by
parsing `detail` text or independently reimplementing runner decisions.

Destination wording follows the request:

- an automatically selected tree action: `will walk to nearest spruce forest`;
- an automatically selected generic felling action: `will walk to nearest forest`;
- an explicitly selected generated place: `will walk to the forest`;
- camp-bound work: `will walk to camp`;
- an exact cell with no semantic work label: use the existing compact place
  wording.

The action row renders one dedicated line below the work duration, joining the
destination phrase to the shared estimate: `will walk to nearest forest - 3.3
km`. Work duration remains work-only.

### Surfaces

Every UI surface that estimates the cost of taking a route uses the shared
formatter:

- Places rows;
- known-region travel rows;
- map tooltip route line;
- initial-walk lines on action rows;
- place choices in an expanded action row;
- the distance back to camp in the move-camp confirmation;
- the haul-to-camp offer.

The haul offer compares like with like: its existing loaded-out and empty-back
duration is paired with twice the one-way route distance. The surrounding load
and ground-pile facts remain ordinary detail text.

The tooltip heading remains unchanged. For an unnamed hovered cell it can read
`Spruce forest  Hareholt, 2.6 km S`; that is straight-line orientation. The
next line is the routed estimate alone, `3.3 km` by default. It does not append
`walk`, because its position and the clickable map already establish what the
number means.

Unavailable routes continue to show their existing refusal instead of passing
missing numbers into the formatter. Positional descriptions remain distance
facts rather than travel estimates and do not obey this setting: the tooltip's
straight-line heading, map scale, `km to go` while already walking, and `km from
camp` location text are unchanged.

### Cell possibilities

The forest, shore and heath camp estimates are removed everywhere, including
the tooltip and Make camp action detail. The site report becomes the source of
cell possibilities rather than generated-spot travel times.

The tooltip instead renders a list of stable capabilities of the hovered cell,
using short `X possible` labels. A capability belongs in this list only when it
is a property of that cell's environment. Temporary inventory, skill, weather,
queue and body-state checks do not belong there.

At the time of this design, `seep possible` is the only such modeled
capability. The list is intentionally extensible, but the implementation must
not invent labels for systems the simulation does not model. When the list is
empty, the line is omitted.

Make camp shows the same possibility labels when any exist and no replacement
detail when none exist. The generated-spot travel summary is deleted rather
than moved elsewhere.

## Data flow

1. Main loads the browser display preference during UI initialization.
2. Settings changes update the preference, save it, and request a render.
3. Simulation option resolution returns structured initial-walk data where
   applicable.
4. Rendering functions receive the selected display explicitly.
5. Each route surface passes kilometres and minutes to the same formatter.

The formatter does not read `localStorage` or mutable module state. Loading,
saving and rendering remain separate, and tests can render every mode without
changing browser globals.

## Compatibility

No game-save migration is required because the setting is not game state and
the initial-walk value is derived UI data. A malformed browser preference is
replaced by the default on read.

## Verification

Unit coverage should establish:

- all three formatter outputs and malformed-setting fallback;
- an absent browser preference defaults to distance;
- changing the setting persists browser-wide without touching `GameState`;
- a remote felling action reports its actual initial route while an action on
  usable ground reports none;
- a selected place omits `nearest`;
- a material-fetching build reports the material source as its initial leg;
- tooltip, Places and region-travel output use distance, time and both modes;
- task durations remain unchanged in every mode;
- the tooltip omits generated forest, shore and heath camp estimates;
- `seep possible` appears only on suitable cells and no empty possibility line
  is rendered.

A browser pass should switch all three settings while the tooltip, Places list,
a neighbouring-region route and a remote action row are visible. The travel
figures must change together, the felling hour must not change, and the action's
first movement must agree with the route that begins after clicking it.
