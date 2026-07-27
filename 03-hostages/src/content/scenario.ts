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
    "The door comes in at twenty past nine. He is thin and grey-faced and there is a " +
    "kitchen knife in his hand that is not yours. He does not want to be here any more " +
    "than you want him here, and that is the most frightening thing about him. Your wife " +
    "is standing by the couch with a dish towel still in her hands. He looks at you and " +
    "says one word: money.",
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
