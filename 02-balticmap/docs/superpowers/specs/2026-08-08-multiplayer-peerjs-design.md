# Multiplayer over PeerJS - design

2026-08-08. Two humans in one game of Baltic Tribes, peer to peer over
WebRTC via PeerJS, host-authoritative. Trusted-friends threat model.
Rejoin by link after a drop.

**Revised 2026-08-10.** The architecture below is what shipped and still
stands. Five sections described things that had already changed under it -
the meta/collections era, the single `humanSeat`, and a set of "host-seat
privileges" that turned out to be defects rather than simplifications. Those
sections say what is true now, and the audit that found them is why the
turn-loop and router rules are in AGENTS.md rather than only here.

## Scope

- Exactly two humans: a host and one guest. Every other seat stays AI.
  The map seats 26 factions, five of which act; nothing about seat count
  changes.
- Trusted friends. Full game state reaches both machines, as it does
  today within one machine. Secrecy (`CardDef.secret`, hidden hands)
  stays a rendering rule pivoted on the local player. A peer who opens
  devtools can read the other hand; the design accepts this and does
  not pretend otherwise.
- Signaling through the public PeerJS cloud broker. No server of ours.
  `peerjs` becomes the project's first runtime dependency.
- Out of scope: more than two humans, anti-cheat, spectators, in-game
  chat, matchmaking beyond sharing a link.

## Why host-authoritative

The engine is already a pure, seeded-deterministic reducer, so
lockstep was a real option. It was rejected because any divergence
(two tabs on different deploys, a future rng-consuming feature, one
peer double-stepping) forks the game silently, and detecting that
needs checksums while repairing it needs the same snapshot machinery
host-authoritative needs anyway. One simulation cannot desync.

The host runs everything exactly as today: rules, the shared seeded
rng, all AI seats. The guest is a rendering client that holds full
state, sends its own actions, and receives state plus events. Guest
UI (map, playability, tooltips, standings) keeps working unchanged
because it derives from state it already has.

## Joining

Host clicks "Play with a friend" on the start screen. `src/net.ts`
obtains a peer id from the broker and the UI shows a copyable link,
`?join=<peer-id>`, in the spirit of the existing boot-param URLs. The
guest opens the link and connects.

### Join UI

The start screen gains a rudimentary "Play with a friend" panel,
imperative DOM in the existing start-screen style, no new machinery:

- Host side: a Host button. On click it asks the broker for a peer
  id, then shows the join link and the bare peer id, each with a copy
  button, and a "Waiting for a friend" status line that switches to
  the lobby when the guest connects.
- Guest side: a text field plus a Join button. The field accepts
  either a bare peer id or a pasted full link; a pasted URL has its
  `join` value extracted. Connection progress and failures (bad id,
  broker down, timed out) are shown plainly in the panel, and a
  failed attempt leaves the field editable to retry.
- Opening a `?join=<peer-id>` URL is the same path with the field
  prefilled and the connection started automatically.
- Both sides enter a display name in the panel (persisted as a
  localStorage pref, defaulting to "Host" / "Guest"). Names cross in
  the `hello` message.

### Knowing who the other human is

While playing, the other human's faction must be unmistakable. Three
surfaces carry the player's name beside the faction: the scoreboard
row for a human-controlled faction appends the name, the map hover on
that faction's land carries a "Played by <name>" line, and the
waiting status names both ("Waiting for <faction> (<name>)"). Player
names are plain text, never segments - the rich-text rule covers card
and faction names only.

`join` is not a boot param. `applyBootParams` must keep returning
`null` for a URL naming only `join`, so the guest's page keeps real
localStorage and banks progress normally. A URL mixing `join` with
boot params is refused with a notice - a booted run is a synthetic
state the host could not reproduce.

Both players then use their own build screen. Decks and collections retired
with the meta system, so the guest transmits its BUILD and its faction, and
the host deals every seat the same starting deck. Factions already taken (the
host's) are marked. The host's rule-variant picks apply to the game and are
shown to the guest in the lobby. Dealing runs only on the host, after both
picks are in, through `dealNetGame` - one spelling, called by the app and by
the tests, because a guest seated one way in the app and another in a test is
a guest whose bugs no test can see.

## Seating and control

The host's faction sits at seat 0. The guest's faction keeps its natural
map-order seat, and its land is RESERVED at the deal, because only the acting
factions keep a leader and a land without one takes no turn.

A per-seat controller notion (local / remote / ai) replaces the engine
driver's hardcoded `isHumanTurn` check: the host's turn loop runs AI seats as
usual and waits at a guest seat for a remote action instead of calling
`chooseAction`. `controllerOf` and `runAiSeats` live in `src/decisions.ts`,
not in `main.ts`, so the tests drive the app's own chain rather than a copy of
it.

The engine knows there is more than one person: `GameState.humanSeats` is the
set, `isHumanFaction` is the question every rule that offers a CHOICE asks,
and `humanSeats[0]` is the one seat `phase` speaks for. See the AGENTS.md
section for which question a new reader is asking.

## Serialization

`GameState` is plain data except `overlords: Map<string,string>`
(src/relations.ts), which `JSON.stringify` silently drops to `{}`.
A codec, `serializeGame`/`deserializeGame`, converts the Map to a
`Record` and back; everything else round-trips as-is - and that is a claim
with a compile-time guard behind it rather than a hope. `SerializedGameState`
is checked field by field, recursing through arrays and objects, and a `Map`,
`Set` or `Date` the codec does not repair is a build error naming the field.
A value-level walk over a real mid-game state backs it up, because a type says
nothing about what an `any`-typed field holds.

## Wire protocol

JSON messages over one DataChannel, discriminated by `type`:

- `hello` - both directions on connect: protocol version and
  `cardRulesHash`, the fingerprint of everything about a card two deploys
  must agree on. Mismatched deploys refuse politely at the lobby instead
  of desyncing mid-game. It is a fingerprint of BEHAVIOUR and not of card
  ids: the state cannot fork while the host is authoritative, but a guest
  whose damage table differs previews moves the host will refuse.
- `refuse` - host's reply to a `hello` it cannot play with; the wire closes.
- `lobby-host` - the lobby view: rule picks and the faction the host took.
- `lobby-guest` - the guest's build and faction.
- `start` - host sends a full snapshot once dealing is done.
- `action` - guest, on its turn, stamped with `{turn, seat}` so a stale
  message is rejected. Four kinds: `play` (carrying `targetId`, the march's
  `sourceId` and the harvest pick where they apply), `discard`, `transfer` -
  how many defenders march with a conquest - and `end-turn`. The message
  carries `cardId` alongside `cardIndex`; the host validates they agree,
  which guards against hand-order confusion.
- `update` - host, after every state change the guest must see:
  `{stateSansLog, logFrom, newEvents}`. The guest SPLICES `newEvents` in at
  `logFrom` rather than appending, so the unbounded log never re-crosses the
  wire and a message delivered twice cannot leave two of each event behind -
  the milestone drawer and the round summary are derived from the log, so a
  doubled entry is a doubled count on one screen only. Event batches keep
  their shape, so log indentation, notices and the round summary derive
  exactly as today.
- `snapshot` - full state including the whole log; sent on `start`
  and on rejoin.
- `reject` - host's reply to an invalid `action`; the guest re-enables
  input.
- `ping` / `pong` - the heartbeat, consumed inside the wire wrapper and
  never seen by session code.

Validation is against races and bugs, not malice. The shared checks - in
play, a real seat, this seat's turn, a live turn stamp - are one place;
the per-kind checks are `NET_ACTION_RULES`, an exhaustive `Record` so a new
action kind cannot ship unchecked. The guest runs the same validation against
its own replica before sending, so it learns why a move is refused without a
round trip.

## The localSeat refactor

Presentation code hardcodes "the human is players[0] / playerId 1" in
about 30 places across hud.ts, main.ts, notices.ts, xp.ts and
boot-params.ts. A `localSeat` (with derived local player id and
faction id) is established once at boot and passed in: host 0, guest
its faction's seat. Some hud.ts filters already take a
`humanFactionId` parameter and then read players[0] anyway, so the
parameterization is half done.

Single-player is the degenerate case: `localSeat = 0`, no connection.
The refactor must not change current behaviour; the golden replay
fixture (tests/rng-isolation.test.ts) and the existing suites are the
canary, and the fixture must not need re-freezing.

Everything that pivots on "you" follows the local seat automatically
once parameterized: `hidesItsCard`, `revealedSecrets`, `isObservable`,
the "Targeting me" filter, and the signed-lead convention (positive =
you lead) in standings, badges and the modal.

## The guest's turn

Mirrors today's human turn with the engine swapped for the wire. When
`state.current` is the guest's seat, input unlocks. On play or
discard, the card flight animates, the `action` is sent, and input
locks via the existing `resolving` flag until the host's `update`
arrives. Received events render through the same path the AI round
uses today: `renderedEvents` diffing, one modal, one line per event.
The host sees a "waiting for <faction>" indication while a guest seat
holds the turn, under the same input lock.

The guest's round summary covers events since their last turn - the
existing rule, unchanged, it just spans the host's turn and the AI
seats between the guest's turns.

## What the host's seat still owns, and what it does not

This section listed three "host-seat privileges" as prototype
simplifications. Two of them were defects: a rule that offers one person a
choice and takes it away from the other is not a simplification, it is two
people playing different games. They are gone.

- **The Turnip harvest belongs to whoever earned it.** Every seat counts
  turnips and every seat is offered the boon. The screen that raises the
  offer asks `decidedHere`, and the pick crosses the wire on the play.
- **The conquest question belongs to whoever made the conquest.**
  `pendingTransfers` is keyed by faction and `isHumanFaction` decides who is
  asked; the answer crosses as its own action. A seat nobody is sitting at
  still moves half on the spot.
- **A person's chair stays warm without a chief, at whichever seat.**
  `takesNoTurn` is the one spelling. An ANNEXED person is still passed over,
  and that ordering is deliberate: exempting them too would hang the table on
  a turn that can never come.

What the host's seat does still own, because there is one `phase` field and
two people cannot hold different ones:

- The endings block pivots on `humanSeats[0]`. The guest maps the phase for
  presentation - the host's `victory` is the guest's defeat, a `unified` or
  `defeat` naming the guest's own faction is the guest's victory, and a guest
  annexed while the host plays on reads its own defeat off `incorporated`,
  which is the one ending the phase field cannot carry.
- Surrender. It ends the run for both people, so a guest conceding would be
  conceding somebody else's game; their exit is closing the tab. The reason is
  written beside the route in `DECISION_ROUTES`, and `decidedHere` is what
  hides the button, so the refusal and the documentation cannot disagree.

## Disconnects and rejoin

`net.ts` watches peerjs close/error events plus a light heartbeat,
because WebRTC connections can half-die without an event. On drop:

- Host side: the engine driver simply does not advance past the
  guest's seat; the game is paused by construction. An overlay says
  the guest disconnected.
- Guest side: an overlay says the connection was lost; reopening the
  same join link (or a Reconnect button) reconnects. The host keeps
  its Peer open for the whole session, so the link stays valid.

On reconnect the `hello` handshake repeats and the host sends a
`snapshot`; the guest resumes mid-game.

If the host tab dies, the simulation is gone. The guest gets an
honest "the host left" ending notice. Accepted for the prototype.

## Progression

Retired with the meta system. Nothing is banked, no profile is written, and a
run is a run. `src/meta.ts` keeps only the build preference.

## Testing

1. Vitest.
   - Codec round-trip: state -> JSON -> state, overlords included, plus the
     compile-time and value-level JSON-safety guards above.
   - Protocol: host and guest drivers over an in-memory pipe (the
     sim.ts pluggable-policy precedent). Cover a full short game, an
     out-of-turn `action` rejected, a `cardId`/`cardIndex` mismatch
     rejected, a duplicate `update`, and a mid-game snapshot rejoin
     resuming correctly.
   - `tests/two-seat.test.ts`: both seats through the real sessions, the real
     deal and the real router, asserting the two people are offered the same
     decisions. A suite that keeps its own copy of what the app does is a
     suite that passes while the app is broken, which is exactly how the
     defects this section records stayed invisible.
   - The localSeat refactor guarded by the existing suites; the
     golden replay fixture must pass without re-freezing.
2. Existing gates: `npm test` and `npm run build` green. No new
   cards, so POLICY_COVERAGE and rarity are untouched.
3. Acceptance, required before the work is called done: a live
   two-tab session in Chrome driven through the Chrome DevTools MCP.
   Host tab creates the invite, guest tab joins by link, both pick
   decks and factions, several full rounds play with actions crossing
   in both directions, and screenshots are read (not just taken) on
   both sides. If the DevTools tools are blocked at that point, stop
   and tell the user rather than working around it. Two tabs on one
   machine through the public broker exercises everything except NAT
   traversal, which is not ours to fix.

## Risks

- Public PeerJS broker availability is outside our control. If it is
  down, hosting fails at the "get an id" step; surface the error
  plainly. Self-hosting a PeerServer is a known escape hatch, not
  part of this design.
- The `update` message assumes the guest applies event batches in
  order; the `{turn, seat}` stamps and single-DataChannel ordering
  guarantee this, but the protocol tests must cover a late/duplicate
  message.
- The localSeat refactor touches ~30 presentation sites; the risk is
  a missed site quietly showing the guest the host's perspective.
  The parameterized filters plus a guest-seat protocol test that
  renders standings from the guest side reduce this, and the two-tab
  acceptance pass is the last line.
