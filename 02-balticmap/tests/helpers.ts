import { presentCtxOf, presentEvents } from "../src/presentation";
import type { GameEvent, GameState } from "../src/game";
import type { Hud } from "../src/hud";

/** Every land in `factionIds` with the same number of further settlement sites.
 *  One by default: each land can be founded in once, and
 *  `SETTLEMENT_BASE_CAP` allows exactly that. */
export const siteCaps = (
  factionIds: string[],
  each = 1,
): Record<string, number> =>
  Object.fromEntries(factionIds.map((id) => [id, each]));

/** `settlements` for a list of lands each founded in once. */
export const settledOnce = (factionIds: string[]): Record<string, number> =>
  Object.fromEntries(factionIds.map((id) => [id, 1]));

/** `defenseMax` for a list of polygons at one shared ceiling. */
export const defenseMaxAll = (
  factionIds: string[],
  each = 600,
): Record<string, number> =>
  Object.fromEntries(factionIds.map((id) => [id, each]));

/** The HUD half of a transition's present stage: the `hud` beats one batch
 *  earns, handed over in the order the classifier returned them.
 *
 *  A card flight is a BEAT now, not something `hud.update` works out for
 *  itself from a log cursor - so a test that wants the played card in the air
 *  runs this before the paint, exactly as `queueBeats` in src/main.ts does.
 *  `hud.update` on its own is what a settled paint looks like: the board
 *  arrives and nothing flies.
 *
 *  It calls the real `presentEvents`, so it is a driver and not a second copy
 *  of the rules - a test holding its own opinion of what earns a flight is a
 *  test that goes on passing while the app stops agreeing with it.
 *
 *  `seat` is the player id this screen plays. The realm is empty because
 *  nothing here is a map beat: the audience gate for a hand motion is the
 *  seat alone. */
export function presentHudBeats(
  hud: Pick<Hud, "noticeWalk" | "runHudBeat">,
  state: GameState,
  events: GameEvent[],
  seat = 1,
): void {
  const { ctx } = hud.noticeWalk(state, events);
  if (ctx === null) return;
  const view = {
    seats: new Set([seat]),
    realm: new Set<string>(),
    linked: new Set<string>(),
    notice: ctx,
  };
  for (const beat of presentEvents(events, presentCtxOf(events, view))) {
    if (beat.kind === "hud") hud.runHudBeat(beat);
  }
}
