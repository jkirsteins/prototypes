import { InkList, Story } from "inkjs";
import scene1Content from "./scene1.json";

export type Scene1Build = "undetermined" | "strength" | "cautious" | "ingenious";

export type ItemVerb = "look" | "use" | "take";

export type Scene1Choice = {
  index: number;
  text: string;
};

export type Scene1Snapshot = {
  attributes: {
    caution: number;
    ingenuity: number;
    perception: number;
    sanity: number;
    strength: number;
  };
  build: Scene1Build;
  choices: Scene1Choice[];
  escaped: boolean;
  imageId: string;
  paragraphs: string[];
  spotted: string[];
  inventory: string[];
};

export class Scene1 {
  private readonly story = new Story(scene1Content);
  private paragraphs: string[] = [];
  private imageId = "coffin";

  constructor() {
    this.continueStory();
  }

  get snapshot(): Scene1Snapshot {
    return {
      attributes: {
        caution: this.numberVariable("caution"),
        ingenuity: this.numberVariable("ingenuity"),
        perception: this.numberVariable("perception"),
        sanity: this.numberVariable("sanity"),
        strength: this.numberVariable("strength"),
      },
      build: this.stringVariable("build") as Scene1Build,
      choices: this.story.currentChoices.map((choice, index) => ({
        index,
        text: choice.text,
      })),
      escaped: this.booleanVariable("escaped"),
      imageId: this.imageId,
      paragraphs: this.paragraphs,
      spotted: this.listVariable("spotted"),
      inventory: this.listVariable("inventory"),
    };
  }

  choose(choiceIndex: number): Scene1Snapshot {
    this.story.ChooseChoiceIndex(choiceIndex);
    this.continueStory();
    return this.snapshot;
  }

  interact(verb: ItemVerb, item: string): Scene1Snapshot {
    const isDiscovered =
      this.listVariable("spotted").includes(item) ||
      this.listVariable("inventory").includes(item);

    if (!isDiscovered) {
      return this.snapshot;
    }

    this.story.ChoosePathString("interact", true, [verb, item]);
    this.continueStory();
    return this.snapshot;
  }

  private continueStory(): void {
    this.paragraphs = [];

    while (this.story.canContinue) {
      const text = this.story.Continue()?.trim() ?? "";
      this.applyTags(this.story.currentTags ?? []);

      if (text) {
        this.paragraphs.push(text);
      }
    }
  }

  private applyTags(tags: string[]): void {
    for (const tag of tags) {
      const [rawKey, ...rawValue] = tag.split(":");
      const key = rawKey.trim();
      const value = rawValue.join(":").trim();

      if (key === "image" && value) {
        this.imageId = value;
      }
    }
  }

  private booleanVariable(name: string): boolean {
    return Boolean(this.story.variablesState.$(name));
  }

  private numberVariable(name: string): number {
    return Number(this.story.variablesState.$(name));
  }

  private stringVariable(name: string): string {
    return String(this.story.variablesState.$(name));
  }

  private listVariable(name: string): string[] {
    const value = this.story.variablesState.$(name);

    if (!(value instanceof InkList)) {
      return [];
    }

    return value.orderedItems
      .map((entry) => entry.Key.itemName)
      .filter((itemName): itemName is string => itemName !== null);
  }
}
