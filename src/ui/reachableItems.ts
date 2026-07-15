import type { GameItem } from "../game/types";

export type SplitRoomItems = {
  inline: GameItem[];
  additional: GameItem[];
};

export function splitRoomItemsByDescription(description: string, roomItems: GameItem[]): SplitRoomItems {
  const normalizedDescription = description.toLocaleLowerCase();

  return roomItems.reduce<SplitRoomItems>(
    (result, item) => {
      const bucket = normalizedDescription.includes(item.label.toLocaleLowerCase()) ? result.inline : result.additional;
      bucket.push(item);
      return result;
    },
    { inline: [], additional: [] },
  );
}
