# blade-inertia: What a sword costs to turn

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` prefix means not yet
> implemented, `DONE-N-` implemented; N is the order. Prefixes change as work
> lands, so only the slug is stable and only the slug may be referenced.

## Overview

`physical-foundations` names two moments of inertia and routes them into
every handling quantity the game has: `alpha` (which prices every guard
transition, windup and recovery), `bindHandling`, and
`rotationalControl`. What it never does is DERIVE them. It says the
distribution model is "a tapered rod plus a pommel point mass" and gives
`taper` as an untyped "mass-distribution coefficient". Every number that
decides how a sword handles therefore rests on a formula nobody has
written down.

This spec writes it down, and in doing so makes one relationship
explicit that the roster currently only implies: **a sword's resistance
to being turned grows with the CUBE of its length and only linearly with
its mass.** Reach is linear in length. Handling is cubic. That asymmetry
is the central tradeoff of sword design, and once it is derived rather
than authored, a designer adding a longer sword pays for it
automatically instead of remembering to.

**Delivers:** the mass-distribution model, both moments derived from
measurable inputs, `balanceCm` demoted from authored fact to derived
diagnostic, the three scaling laws and their tests, and the calibration
hooks that keep the derived numbers honest against real swords.

**Depends on:** `physical-foundations` (whose section 4.2 this replaces,
and whose weapon facts it re-bases). Everything downstream -
`guard-positions`, `skeletal-renderer`, `grip-switching` - consumes the
moments through the interfaces that spec already declares, so nothing
below this changes shape.

---

## 1. What is wrong with the current model

Three specific defects, all in `physical-foundations` section 1 and 4.2:

1. **`taper` has no definition.** It is named as a coefficient of a
   model that is described in a parenthesis. Two implementers would not
   produce the same inertia from the same weapon row.
2. **The profile is over-determined.** `massKg`, `balanceCm` and `taper`
   are authored independently, but balance is a CONSEQUENCE of how mass
   is distributed. Author all three and they can disagree; nothing
   currently notices.
3. **Length has no handling cost.** `bladeCm` feeds `reachCm` and
   nothing else. The shipping rapier is 17 cm longer in the blade than
   the longsword and pays nothing for it anywhere in the model.

## 2. The distribution model

A sword is three masses about the front hand:

```
                 hilt                     bladeCm
        |<---------------->|<-------------------------------->|
   [pommel]......[grip]...[X]==================================>
        ^             ^    ^cross                          tip
        |             |    |
        |             |    +-- blade: tapered bar, CoM at f * bladeCm
        |             +------- grip and cross: lumped, near the hands
        +--------------------- pommel: point mass at hiltCm
                    ^
                    +-- front hand at grip1Cm behind the cross
```

**Authored per weapon** (all measurable on a real sword with a scale and
a ruler):

| field | unit | meaning |
|---|---|---|
| `massKg` | kg | total mass |
| `bladeCm` | cm | cross to tip |
| `hiltCm` | cm | cross to pommel |
| `grip1Cm`, `grip2Cm` | cm | hand sockets behind the cross (unchanged) |
| `bladeCoMFraction` | - | where the blade's own mass centre sits, as a fraction of `bladeCm` from the cross. **Replaces `taper`.** |
| `bladeMassFraction` | - | share of total mass in the blade |
| `gripMassFraction` | - | share in the grip and cross |

`bladeCoMFraction` (written `f` below) is the one number that carries
the blade's taper, and it is bounded by the geometry it describes:
`f = 1/2` is a bar of constant section, `f = 1/3` a blade tapering to a
point, and real blades sit between. It is preferred over `taper`
because it is measurable (balance the bare blade on a finger) and
because it yields the second moment as well as the first:

```
c(f) = 2 f^2 / (1 + f)          // second-moment coefficient
```

which returns `1/3` for a uniform bar and `1/6` for a triangular one,
the two textbook cases, with everything real in between.

## 3. The two moments

Both integrate the same distribution about a different axis. With
`L = bladeCm`, `h = grip1Cm`, `H = hiltCm`, all in metres:

```
I_grip = m_blade * [ c(f) L^2  +  2 h f L  +  h^2 ]     // about the hands
       + m_pommel * (H - h)^2
       + m_grip   * (H/3 - h)^2                          // usually ~0

I_contact = m_blade * [ c(f) L^2  -  2 x_c f L  +  x_c^2 ]  // about the
          + m_pommel * (H + x_c)^2                          // bind point
          + m_grip   * (H/3 + x_c)^2
```

`x_c = CONTACT_FRACTION * L` is the reference crossing point on the
blade, ahead of the cross. `I_grip` is what the hands fight when they
turn the sword; `I_contact` is what the blade fights when it is turned
about a point where two blades have met. `physical-foundations` already
consumes exactly these two and no others.

`balanceCm` is now DERIVED, and stops being authored:

```
balanceCm = ( m_blade * f L  -  m_grip * H/3  -  m_pommel * H ) / massKg
```

It becomes a **diagnostic**: the workbook prints it beside a published
figure for the real sword the profile is modelled on, and a large
disagreement means the mass fractions are wrong. That is a better use
for it than an input that could contradict the others.

## 4. The three scaling laws

These are the reason the spec exists. Each is separable, each is
testable, and together they are the whole design space of a sword.

**Length is cubic.** Lengthening a blade moves mass outward at the same
time as it adds mass, so `I_grip` grows far faster than reach does. Over
the roster's plausible range the measured exponent is **2.96**:

```
I_grip proportional to length^3        (measured 2.96 over 120..135 cm)
reachCm proportional to length^1
```

**Mass is linear.** At fixed length and fixed distribution, doubling
mass doubles both moments exactly. Mass is therefore the cheap lever: a
designer who wants a long sword to handle can lighten it, but is
fighting a cube with a line.

**Distribution trades the hands against the blade, in opposite
directions.** Moving mass from the blade to the pommel at constant total
mass and length REDUCES `I_grip` and INCREASES `I_contact`. A
pommel-heavy sword is quick in the hands and weak at the bind; a
blade-heavy one is the reverse. This falls straight out of the two
integrals and needs no rule of its own, and it is why
`physical-foundations` was right to keep two moments rather than one.

## 5. Worked examples

All computed from the model above with `f = 0.42`, `bladeMassFraction =
0.42`, `gripMassFraction = 0.17`, `hiltCm = 25`, `grip1Cm = 7.5`. The
transition column is a substantial guard change (1.6 rad) at a baseline
two-handed control torque of 22 N*m, through the motion profile
`guard-positions` already defines.

### 5.1 Length, with mass growing plausibly

| total | blade | mass | `I_grip` | `I_contact` | balance | 1.6 rad transition |
|---|---|---|---|---|---|---|
| 120 cm | 92 | 1.35 kg | 0.1722 | 0.3844 | 4.6 cm | **224 ms** |
| 125 cm | 97 | 1.40 kg | 0.1943 | 0.4304 | 5.4 cm | **238 ms** |
| 130 cm | 102 | 1.45 kg | 0.2182 | 0.4799 | 6.3 cm | **252 ms** |
| 135 cm | 107 | 1.50 kg | 0.2441 | 0.5331 | 7.2 cm | **266 ms** |

Fourteen milliseconds per five centimetres, on one guard change, against
a human reaction budget of about 250 ms. Small enough to be a
preference, large enough to be a choice - which is the shape a tradeoff
should have. A short correction (0.5 rad) spreads 125 ms to 149 ms over
the same range.

### 5.2 Mass at constant 130 cm

| mass | `I_grip` | `I_contact` | balance |
|---|---|---|---|
| 1.30 kg | 0.1956 | 0.4302 | 6.3 cm |
| 1.45 kg | 0.2182 | 0.4799 | 6.3 cm |
| 1.60 kg | 0.2408 | 0.5295 | 6.3 cm |

Exactly linear, and balance does not move: mass scaling is the one lever
that changes cost without changing character.

### 5.3 Distribution at constant 130 cm and 1.45 kg

| distribution | balance | transition | handling (1/sqrt I_grip) | rotational control (1/I_contact) |
|---|---|---|---|---|
| blade-heavy (0.50) | 11.8 cm | 271 ms | 1.99 | 2.37 |
| nominal (0.42) | 6.3 cm | 252 ms | 2.14 | 2.08 |
| pommel-heavy (0.34) | 0.9 cm | 231 ms | 2.33 | 1.86 |

Forty milliseconds of hand speed bought with twenty-one percent of bind
authority, from the same steel. This is the sharpest emergent result in
the model and it needed no new rule: `bindHandling` reads `I_grip` and
`rotationalControl` reads `I_contact`, so they move apart on their own.

### 5.4 What it says about the shipping roster

The rapier's blade is 112 cm against the longsword's 95. Under this
model it pays for that in `I_grip` and therefore in every transition,
which it currently does not. That is a real change to the shipping
matchup and it belongs in the calibration workbook's deviation report,
not smuggled in: the rapier is meant to be nimble, so if the derived
moments make it sluggish, the answer is that its mass and distribution
are wrong for the sword it is trying to be, not that the model is.

## 6. Where it plugs in

Nothing downstream changes shape. `physical-foundations` section 4.2 is
replaced by sections 2 and 3 above; its consumers are untouched:

| consumer | reads | effect |
|---|---|---|
| `alpha` in `guard-positions` | `I_grip` | every transition, windup and recovery |
| `bindHandling` | `I_grip` | how fast pressure is applied and recovered |
| `rotationalControl` | `I_contact` | how the blade turns about a bind |
| the calibration workbook | both | the equivalence report |

## 7. Tuning parameters

| constant | unit | gameplay meaning |
|---|---|---|
| `bladeCoMFraction` | - | per weapon. Blade taper. Lower is more distal taper, quicker in the hand, less presence at the tip. Bounded to [1/3, 1/2] by the geometry it describes; a data test enforces it. |
| `bladeMassFraction` | - | per weapon. How much of the sword is out front. The main character knob: raise it for authority, lower it for speed. |
| `gripMassFraction` | - | per weapon. Grip and cross. Small, and mostly a bookkeeping term so the three fractions sum to one. |
| `CONTACT_FRACTION` | - | global. Where along the blade two blades are taken to meet. Raising it makes the bind reward blade-heavy swords more sharply. Start at 0.5. |

Every one of these has a direction a designer can reason about, which is
the bar `physical-foundations` sets for a coefficient.

## 8. Physics, approximation, and what is neither

The brief this spec answers asks for these to be separated, and they
should be:

- **Physics.** The two integrals, `c(f)`, the parallel-axis structure,
  and the linear-in-mass and cubic-in-length results. These follow from
  the distribution and are not tunable; if they are wrong they are
  wrong, not mistuned.
- **Approximation.** Three lumped masses instead of a continuous
  distribution; a single taper exponent; a fixed `CONTACT_FRACTION`
  rather than a real crossing point (which the categorical contact model
  does not compute - see `guard-positions`); ignoring the blade's
  flexion entirely, which `bladeStiffness` handles separately and
  crudely. Each is a deliberate simplification, and each could be
  refined later without changing any consumer.
- **Neither, and worth saying so.** The authored mass fractions for the
  shipping weapons are guesses calibrated to produce plausible balance
  points, not measurements of specific historical swords. The model is
  physically structured; the inputs are gameplay. Do not read the
  derived balance figures as historical claims about feders.

## 9. Testing

- **Scaling tests, on the derivation rather than the roster.** Doubling
  `massKg` doubles both moments exactly. Scaling `bladeCm` by `s` at
  fixed mass scales `I_grip` by `s^2` exactly; with the roster's
  plausible mass growth the fitted exponent is 2.9 to 3.1. These pin the
  laws of section 4 without naming a weapon.
- **Distribution test.** Moving mass from blade to pommel at constant
  total decreases `I_grip` and increases `I_contact`, monotonically,
  across the authored range. This is the emergent tradeoff and it must
  not be able to invert silently.
- **`c(f)` boundary test.** `c(1/2) == 1/3` and `c(1/3) == 1/6` exactly,
  and `f` outside [1/3, 1/2] fails the data test.
- **Balance diagnostic.** Derived `balanceCm` for every shipping weapon
  is within a declared tolerance of the reference figure recorded beside
  it in the workbook. This is what catches a wrong mass split.
- **No stored moment.** A guard test asserts nothing reads an authored
  inertia or an authored `balanceCm`; both are derived, and `taper` is
  gone rather than deprecated.

## 10. Acceptance criteria

- Both moments are computed from measurable inputs by a stated formula,
  and two implementers reading this spec produce the same numbers.
- Length raises the cost of turning a sword with an exponent near three,
  while raising reach with an exponent of one, and a test pins both.
- Mass raises it linearly, and a test pins that separately.
- Distribution moves hand speed and bind authority in opposite
  directions, emergently, with no rule naming either.
- `balanceCm` is derived and checked against a reference rather than
  authored and trusted.
- No weapon is denied anything by its length or mass. Every consequence
  is a cost on a continuous quantity, per the emergent-outcomes rule.

## 11. Out of scope

- Blade flexion and its effect on the bind: `bladeStiffness` owns that
  and is not re-derived here.
- The rotational cost of moving the hands themselves through space, as
  opposed to turning the sword about them: `guard-positions` prices hand
  travel separately and the two compose in its `max`.
- Any change to reach, coverage, or the contact model.
- Retuning the shipping roster to absorb the new costs. The workbook
  reports the deviations; deciding what to do about them is a
  balance pass, not this spec.
