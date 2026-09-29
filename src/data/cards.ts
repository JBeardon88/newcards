import fungi from "./funguys.legacy.json";
import techno from "./technocracy.legacy.json";
import { RARITIES } from "./config";
import type {
  CardDefinition,
  CardType,
  Effect,
  Rarity,
  SetId,
} from "../engine/model";
type Legacy = {
  name: string;
  card_type: string;
  cost: number;
  attack: number;
  defense: number;
  description: string;
  flavor_text?: string;
  effects?: Effect[];
};
const types: Record<string, CardType> = {
  creature: "CREATURE",
  spell: "SPELL",
  equipment: "ARTIFACT",
  enchantment: "AUGMENTATION",
};
function normalize(c: Legacy, setId: SetId): CardDefinition {
  const cardType = types[c.card_type];
  const effects = (c.effects ?? []).map((e) => ({
    ...e,
    trigger:
      cardType === "ARTIFACT" && !e.trigger
        ? "constant"
        : e.trigger === "upkeep" || e.trigger === "start_of_turn"
          ? "on_upkeep"
          : (e.trigger ?? "constant"),
  }));
  let rules = c.description
    .replace(/equipment/gi, "artifact")
    .replace(/enchantment/gi, "augmentation")
    .replace(/enchanted/gi, "augmented")
    .replace(/discard pile/gi, "graveyard");
  if (c.name === "Holo Shield")
    rules = "Attached creature gains -1 attack and +3 health.";
  if (c.name === "Nightmare Gun") {
    rules =
      "While attached, at your upkeep deal 1 damage to any creature or player.";
    effects[0].target = "creature_or_player";
  }
  if (c.name === "Mycelium Guardian")
    rules =
      "Mycelium Network: +1 health while another friendly network creature is present.";
  return {
    definitionId: `${setId}:${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: c.name,
    setId,
    cardType,
    rarity: (Object.keys(RARITIES).find((r) => RARITIES[r].includes(c.name)) ??
      "COMMON") as Rarity,
    cost: c.cost,
    attack: c.attack,
    health: c.defense,
    rulesText: rules,
    flavorText:
      c.flavor_text ??
      (c as Legacy & { "flavor_text:"?: string })["flavor_text:"] ??
      "",
    effects,
    art: setId,
  };
}
export const definitions: CardDefinition[] = [
  ...fungi.map((c) => normalize(c as Legacy, "funguys")),
  ...techno.map((c) => normalize(c as Legacy, "technocracy")),
];
export const tokenDefinition: CardDefinition = {
  definitionId: "token:sporeling",
  name: "Sporeling",
  setId: "funguys",
  cardType: "CREATURE",
  rarity: "COMMON",
  cost: 0,
  attack: 1,
  health: 1,
  rulesText: "Ephemeral token. Not a minted collectible.",
  flavorText: "",
  effects: [],
  art: "funguys",
};
export const cards: Record<string, CardDefinition> = Object.fromEntries(
  [...definitions, tokenDefinition].map((c) => [c.definitionId, c]),
);
