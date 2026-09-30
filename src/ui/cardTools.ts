import { cards } from "../content/catalog";
import type { CardDefinition, CardInstance, CardType } from "../engine/model";

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  CREATURE: "Creatures",
  SPELL: "Spells",
  ARTIFACT: "Artifacts",
  AUGMENTATION: "Augmentations",
};
export const EMPTY_FILTERS = {
  name: "",
  set: "",
  type: "",
  rarity: "",
  status: "",
  sort: "name",
};
export type CardFiltersValue = typeof EMPTY_FILTERS;
const rarityRank = { COMMON: 0, UNCOMMON: 1, RARE: 2, LEGENDARY: 3 };

export function filterCards(
  instances: CardInstance[],
  filter: CardFiltersValue,
  catalog: Record<string, CardDefinition> = cards,
) {
  const query = filter.name.trim().toLowerCase();
  return instances
    .filter((c) => {
      const d = catalog[c.definitionId];
      return (
        d &&
        (!query || d.name.toLowerCase().includes(query)) &&
        (!filter.set || c.setId === filter.set) &&
        (!filter.type || d.cardType === filter.type) &&
        (!filter.rarity || c.rarity === filter.rarity) &&
        (!filter.status || c.lifecycleStatus === filter.status)
      );
    })
    .sort((a, b) => {
      const da = catalog[a.definitionId],
        db = catalog[b.definitionId];
      const byName = da.name.localeCompare(db.name);
      const primary =
        filter.sort === "name-desc"
          ? -byName
          : filter.sort === "cost"
            ? da.cost - db.cost
            : filter.sort === "cost-desc"
              ? db.cost - da.cost
              : filter.sort === "rarity"
                ? rarityRank[b.rarity] - rarityRank[a.rarity]
                : filter.sort === "newest"
                  ? b.serialNumber - a.serialNumber
                  : byName;
      return (
        primary ||
        byName ||
        a.serialNumber - b.serialNumber ||
        a.instanceId.localeCompare(b.instanceId)
      );
    });
}

export function deckSummary(
  instances: Record<string, CardInstance>,
  ids: string[],
  catalog: Record<string, CardDefinition> = cards,
) {
  const counts: Record<CardType, number> = {
    CREATURE: 0,
    SPELL: 0,
    ARTIFACT: 0,
    AUGMENTATION: 0,
  };
  let unavailable = 0,
    missing = 0;
  for (const id of ids) {
    const c = instances[id],
      d = c && catalog[c.definitionId];
    if (d) counts[d.cardType]++;
    else missing++;
    if (!d || c.currentOwnerId !== "human" || c.lifecycleStatus !== "ALIVE")
      unavailable++;
  }
  return { counts, total: ids.length, unavailable, missing };
}
