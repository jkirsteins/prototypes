import { cardById } from "./content/cards";
import type { GameState, Outcome } from "./types";

export interface RunSummary {
  headline: string;
  lines: string[];
}

const HEADLINES: Record<Outcome, string> = {
  victory: "You win. He is on the floor with his hands behind him.",
  lossSecrets: "You lose. He knows where the money is.",
  lossVigor: "You lose. You did not stay conscious long enough.",
  lossWife: "You lose. She did not get up.",
};

export function summarize(state: GameState): RunSummary {
  if (state.outcome === null) throw new Error("The run is not over");
  const lines: string[] = [];

  lines.push(`It lasted ${state.turn} turns.`);

  const given = state.stats.secretsGiven;
  if (given.length === 0) {
    lines.push("You told him nothing.");
  } else {
    for (const entry of given) {
      const name = cardById(entry.cardId).name;
      const why = entry.coerced ? "because he made you" : "because you chose to";
      lines.push(`You gave up ${name} ${why}.`);
    }
    lines.push(`You had ${state.secretsRemaining.length} left.`);
  }

  lines.push(`She got as low as ${state.stats.wifeLowestVigor} vigor.`);

  if (state.stats.notYetForced) {
    lines.push("He got back up once after you put him down.");
  }

  const swing = state.stats.largestWillpowerSwing;
  if (swing !== null) {
    lines.push(`The hardest single moment was ${swing.cause}, worth ${swing.amount} willpower.`);
  }

  return { headline: HEADLINES[state.outcome], lines };
}
