import { describe, expect, it } from "vitest";
import { CoffinScene, type ItemVerb } from "./coffinScene";
import coffinStoryContent from "./coffin.json";
import { ITEM_LABELS } from "../itemLabels";

const FICTION_BREAKING_TERMS = [
  "coffin",
  "dungeon",
  "tutorial",
  "build set",
  "clue found",
  "item gained",
  "memory gained",
  "deduction",
];

function choose(scene: CoffinScene, text: string): void {
  const choice = scene.snapshot.choices.find((candidate) => candidate.text === text);
  expect(choice, `choice available: ${text}`).toBeDefined();
  scene.choose(choice!.index);
  expectNoFictionBreak(scene);
}

function interact(scene: CoffinScene, verb: ItemVerb, item: string): void {
  scene.interact(verb, item);
  expectNoFictionBreak(scene);
}

function enterRoomByForce(scene: CoffinScene): void {
  for (let push = 0; push < 5; push += 1) {
    choose(scene, "Push against the wood above you.");
  }
  choose(scene, "Step into the room.");
}

function visibleText(scene: CoffinScene): string {
  const snapshot = scene.snapshot;
  return [...snapshot.paragraphs, ...snapshot.choices.map((choice) => choice.text)].join(" ");
}

function expectNoFictionBreak(scene: CoffinScene): void {
  const text = visibleText(scene).toLowerCase();
  for (const term of FICTION_BREAKING_TERMS) {
    expect(text, `player-visible text must not contain "${term}"`).not.toContain(term);
  }
  expect(text, 'player-visible text must not contain "cell"').not.toMatch(/\bcells?\b/);
  expect(text, 'player-visible text must not contain "prison"').not.toMatch(/\bprisons?\b/);
}

describe("opening ink scene", () => {
  it("never breaks the fiction in the opening beat", () => {
    const scene = new CoffinScene();
    expectNoFictionBreak(scene);
  });

  it("sets a strength build after five persistent pushes", () => {
    const scene = new CoffinScene();

    choose(scene, "Push against the wood above you.");
    choose(scene, "Push against the wood above you.");

    choose(scene, "Push against the wood above you.");
    expect(scene.snapshot.paragraphs).toContain("It doesn't budge.");
    expect(scene.snapshot.escaped).toBe(false);

    choose(scene, "Push against the wood above you.");
    expect(scene.snapshot.paragraphs).toContain("It doesn't budge.");
    expect(scene.snapshot.escaped).toBe(false);

    choose(scene, "Push against the wood above you.");

    expect(scene.snapshot.escaped).toBe(true);
    expect(scene.snapshot.build).toBe("strength");
    expect(scene.snapshot.attributes.strength).toBe(2);
    expect(scene.snapshot.imageId).toBe("lid-open");
    expect(scene.snapshot.choices.map((choice) => choice.text)).toContain(
      "Step into the room.",
    );
  });

  it("keeps the story going when calling out brings no answer", () => {
    const scene = new CoffinScene();

    choose(scene, "Call for help.");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("what might answer");

    choose(scene, "Call out anyway.");

    expect(scene.snapshot.escaped).toBe(false);
    expect(scene.snapshot.build).toBe("undetermined");
    expect(scene.snapshot.attributes.caution).toBe(-1);
    expect(scene.snapshot.choices.length).toBeGreaterThan(0);
  });

  it("keeps the fiction intact when remembering the danger of calling out", () => {
    const scene = new CoffinScene();

    choose(scene, "Call for help.");
    choose(scene, "Remember why calling out felt dangerous.");

    expect(scene.snapshot.paragraphs.join(" ")).toContain("either rescued or collected");
  });

  it("sets an ingenuity build by finding the nail and forcing the hinge", () => {
    const scene = new CoffinScene();

    choose(scene, "Feel along the velvet.");
    choose(scene, "Work the loose nail free.");
    choose(scene, "Trace where the wood resists.");
    choose(scene, "Force the hinge with the nail.");

    expect(scene.snapshot.escaped).toBe(true);
    expect(scene.snapshot.build).toBe("ingenious");
    expect(scene.snapshot.attributes.ingenuity).toBe(2);
    expect(scene.snapshot.imageId).toBe("lid-open");
    expect(scene.snapshot.choices.map((choice) => choice.text)).toContain(
      "Step into the room.",
    );
  });

  it("reveals the room after stepping in", () => {
    const scene = new CoffinScene();

    choose(scene, "Feel along the velvet.");
    choose(scene, "Work the loose nail free.");
    choose(scene, "Trace where the wood resists.");
    choose(scene, "Force the hinge with the nail.");
    choose(scene, "Step into the room.");

    expect(scene.snapshot.paragraphs.length).toBeGreaterThan(0);
    expect(scene.snapshot.imageId).toBe("cell-room");
    expect(scene.snapshot.choices.map((choice) => choice.text)).toContain("Look around.");
  });

  it("spots the cold candle on entering the room", () => {
    const scene = new CoffinScene();
    enterRoomByForce(scene);

    expect(scene.snapshot.spotted).toContain("candle");
    expect(scene.snapshot.inventory).toEqual([]);
    expect(scene.snapshot.paragraphs.join(" ").toLowerCase()).not.toContain("burn");
  });

  it("spots the table on the first look around", () => {
    const scene = new CoffinScene();
    enterRoomByForce(scene);

    choose(scene, "Look around.");
    expect(scene.snapshot.spotted).toContain("table");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("table");

    choose(scene, "Look around.");
    expect(scene.snapshot.paragraphs.join(" ")).toContain(
      "Nothing in particular catches your eye.",
    );
    expect(scene.snapshot.choices.map((choice) => choice.text)).toContain("Look around.");
  });

  it("keeps the room open after looking around finds nothing new", () => {
    const scene = new CoffinScene();

    choose(scene, "Feel along the velvet.");
    choose(scene, "Work the loose nail free.");
    choose(scene, "Trace where the wood resists.");
    choose(scene, "Force the hinge with the nail.");
    choose(scene, "Step into the room.");

    choose(scene, "Look around.");
    choose(scene, "Look around.");
    expect(scene.snapshot.paragraphs.join(" ")).toContain(
      "Nothing in particular catches your eye.",
    );
    expect(scene.snapshot.choices.map((choice) => choice.text)).toContain("Look around.");
  });

  it("offers only the step choice once the lid is open by force", () => {
    const scene = new CoffinScene();

    for (let push = 0; push < 5; push += 1) {
      choose(scene, "Push against the wood above you.");
    }

    expect(scene.snapshot.choices.map((choice) => choice.text)).toEqual([
      "Step into the room.",
    ]);

    choose(scene, "Step into the room.");
    expect(scene.snapshot.imageId).toBe("cell-room");
  });

  it("keeps the escape unreachable until both nail and hinge are found", () => {
    const scene = new CoffinScene();

    expect(scene.snapshot.choices.map((choice) => choice.text)).not.toContain(
      "Force the hinge with the nail.",
    );

    choose(scene, "Feel along the velvet.");
    choose(scene, "Work the loose nail free.");

    expect(scene.snapshot.choices.map((choice) => choice.text)).not.toContain(
      "Force the hinge with the nail.",
    );
  });

  it("reveals the drawer when looking at the table", () => {
    const scene = new CoffinScene();
    enterRoomByForce(scene);
    choose(scene, "Look around.");

    interact(scene, "look", "table");

    expect(scene.snapshot.spotted).toContain("drawer");
    expect(scene.snapshot.spotted).not.toContain("table");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("drawer");
    expect(scene.snapshot.choices.map((choice) => choice.text)).toContain("Look around.");
  });

  it("opens the drawer with enough strength and reveals the tin", () => {
    const scene = new CoffinScene();
    enterRoomByForce(scene);
    choose(scene, "Look around.");
    interact(scene, "look", "table");

    expect(scene.snapshot.attributes.strength).toBe(2);
    interact(scene, "use", "drawer");

    expect(scene.snapshot.spotted).toContain("tinderbox");
    expect(scene.snapshot.spotted).toContain("drawer");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("tin");
  });

  it("keeps the drawer stuck without strength", () => {
    const scene = new CoffinScene();
    choose(scene, "Feel along the velvet.");
    choose(scene, "Work the loose nail free.");
    choose(scene, "Trace where the wood resists.");
    choose(scene, "Force the hinge with the nail.");
    choose(scene, "Step into the room.");
    choose(scene, "Look around.");
    interact(scene, "look", "table");

    expect(scene.snapshot.attributes.strength).toBe(0);
    interact(scene, "use", "drawer");

    expect(scene.snapshot.spotted).not.toContain("tinderbox");
    expect(scene.snapshot.spotted).toContain("drawer");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("jams");
  });

  it("answers unauthored combinations with quiet flavor", () => {
    const scene = new CoffinScene();
    enterRoomByForce(scene);
    choose(scene, "Look around.");
    interact(scene, "look", "table");
    interact(scene, "use", "drawer");
    interact(scene, "use", "tinderbox");
    interact(scene, "use", "candle");
    choose(scene, "Look around.");

    interact(scene, "use", "bucket");

    expect(scene.snapshot.spotted).toContain("bucket");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("nothing comes of it");
    expect(scene.snapshot.choices.map((choice) => choice.text)).toContain("Look around.");
  });

  it("forces the drawer straight from the table with enough strength", () => {
    const scene = new CoffinScene();
    enterRoomByForce(scene);
    choose(scene, "Look around.");

    interact(scene, "use", "table");

    expect(scene.snapshot.spotted).not.toContain("table");
    expect(scene.snapshot.spotted).toContain("drawer");
    expect(scene.snapshot.spotted).toContain("tinderbox");
    const text = scene.snapshot.paragraphs.join(" ");
    expect(text).toContain("gives all at once");
    expect(text).toContain("tin");
  });

  it("finds the drawer under the table but cannot force it weak-handed", () => {
    const scene = new CoffinScene();
    choose(scene, "Feel along the velvet.");
    choose(scene, "Work the loose nail free.");
    choose(scene, "Trace where the wood resists.");
    choose(scene, "Force the hinge with the nail.");
    choose(scene, "Step into the room.");
    choose(scene, "Look around.");

    interact(scene, "use", "table");

    expect(scene.snapshot.spotted).not.toContain("table");
    expect(scene.snapshot.spotted).toContain("drawer");
    expect(scene.snapshot.spotted).not.toContain("tinderbox");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("jams");
  });

  it("moves the tin to hand when used in the drawer", () => {
    const scene = new CoffinScene();
    enterRoomByForce(scene);
    choose(scene, "Look around.");
    interact(scene, "look", "table");
    interact(scene, "use", "drawer");

    interact(scene, "use", "tinderbox");

    expect(scene.snapshot.inventory).toContain("tinderbox");
    expect(scene.snapshot.spotted).not.toContain("tinderbox");
  });

  it("cannot light the candle empty-handed", () => {
    const scene = new CoffinScene();
    enterRoomByForce(scene);

    interact(scene, "use", "candle");

    expect(scene.snapshot.imageId).toBe("cell-room");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("nothing to wake it with");
  });

  it("lights the candle with the tin and brightens the room", () => {
    const scene = new CoffinScene();
    enterRoomByForce(scene);
    choose(scene, "Look around.");
    interact(scene, "look", "table");
    interact(scene, "use", "drawer");
    interact(scene, "use", "tinderbox");

    interact(scene, "use", "candle");

    expect(scene.snapshot.imageId).toBe("cell-room-lit");

    interact(scene, "use", "candle");
    expect(scene.snapshot.imageId).toBe("cell-room-lit");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("needs nothing more");
  });

  it("reveals more of the room to a second look once lit", () => {
    const scene = new CoffinScene();
    enterRoomByForce(scene);
    choose(scene, "Look around.");
    interact(scene, "look", "table");
    interact(scene, "use", "drawer");
    interact(scene, "use", "tinderbox");
    interact(scene, "use", "candle");

    choose(scene, "Look around.");

    expect(scene.snapshot.spotted).toContain("hanging");
    expect(scene.snapshot.spotted).toContain("cage");
    expect(scene.snapshot.spotted).toContain("bucket");

    interact(scene, "look", "hanging");
    interact(scene, "look", "cage");
    interact(scene, "look", "bucket");

    choose(scene, "Look around.");
    expect(scene.snapshot.paragraphs.join(" ")).toContain(
      "Nothing in particular catches your eye.",
    );
  });

  it("ignores interact() calls for items that have not been discovered yet", () => {
    const scene = new CoffinScene();

    scene.interact("use", "tinderbox");

    expect(scene.snapshot.inventory).toEqual([]);
    expect(scene.snapshot.imageId).toBe("coffin");
    expect(scene.snapshot.choices.map((choice) => choice.text)).toContain(
      "Push against the wood above you.",
    );
  });

  it("covers the drawer, tinderbox, and candle look/use branches at every stage", () => {
    const scene = new CoffinScene();
    enterRoomByForce(scene);
    choose(scene, "Look around.");

    interact(scene, "look", "table");

    interact(scene, "look", "drawer");
    expect(scene.snapshot.paragraphs.join(" ")).toContain(
      "does not mean to come out politely",
    );

    interact(scene, "use", "drawer");
    expect(scene.snapshot.spotted).toContain("tinderbox");

    interact(scene, "use", "drawer");
    expect(scene.snapshot.paragraphs.join(" ")).toContain(
      "given you everything it had",
    );

    interact(scene, "look", "drawer");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("sags open");

    interact(scene, "look", "tinderbox");
    expect(scene.snapshot.paragraphs.join(" ")).toContain(
      "sits in the ruined drawer",
    );

    interact(scene, "use", "tinderbox");
    expect(scene.snapshot.inventory).toContain("tinderbox");

    interact(scene, "look", "tinderbox");
    expect(scene.snapshot.paragraphs.join(" ")).toContain(
      "Small, dry, and willing",
    );

    interact(scene, "use", "tinderbox");
    expect(scene.snapshot.paragraphs.join(" ")).toContain(
      "wants something worth lighting",
    );

    interact(scene, "look", "candle");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("tallow");

    interact(scene, "use", "candle");
    expect(scene.snapshot.imageId).toBe("cell-room-lit");

    interact(scene, "look", "candle");
    expect(scene.snapshot.paragraphs.join(" ")).toContain(
      "flame stands small and straight",
    );
  });
});

describe("item labels", () => {
  it("has exactly one label per item defined in the ink LIST", () => {
    const listItemIds = Object.keys((coffinStoryContent as any).listDefs.items);

    expect(Object.keys(ITEM_LABELS).sort()).toEqual(listItemIds.sort());
  });
});
