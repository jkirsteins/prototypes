import type { Range } from "../types";

export interface OpeningStance {
  playerVigor: number;
  playerWillpower: number;
  wifeVigor: number;
  convictWillpower: number;
  range: Range;
}

export interface OpeningChoice {
  id: string;
  label: string;
  text: string;
  apply: OpeningStance;
}

export const OPENING = {
  prose:
    "The door comes in at twenty past nine. He is thin and grey-faced and he brought his " +
    "own knife, which means he planned this. Your wife is standing by the couch with a " +
    "dish towel still in her hands. He does not ask who you are. He says a number, and it " +
    "is close enough to what is actually in this house that you feel it in your legs. " +
    "Then he tells you he got your address from someone who knows you, and he does not " +
    "say who. He knows the money is here. He does not know where. He has all night to " +
    "fix that.",
  choices: [
    {
      id: "phone",
      label: "Reach for the phone.",
      text:
        "You get two digits in before he crosses the room. He takes the phone apart " +
        "against the wall and then takes you apart against the floor. But you tried, and " +
        "some part of you holds onto that.",
      apply: {
        playerVigor: 4,
        playerWillpower: 7,
        wifeVigor: 4,
        convictWillpower: 6,
        range: "near",
      },
    },
    {
      id: "shield",
      label: "Step in front of her.",
      text:
        "You put yourself between them before you decide to. He shoves past you to the " +
        "dining chair and starts taping, and for the rest of the night his attention is " +
        "on you rather than on her.",
      apply: {
        playerVigor: 5,
        playerWillpower: 6,
        wifeVigor: 6,
        convictWillpower: 6,
        range: "near",
      },
    },
    {
      id: "comply",
      label: "Do exactly as he says.",
      text:
        "You sit where he points and you hold out your wrists. It costs you something to " +
        "be that obedient that fast. It also costs him something: he has decided you are " +
        "not a problem.",
      apply: {
        playerVigor: 6,
        playerWillpower: 4,
        wifeVigor: 4,
        convictWillpower: 5,
        range: "away",
      },
    },
  ] as OpeningChoice[],
};
