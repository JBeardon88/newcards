export const RULES = {
  deckSize: 30,
  maxCopies: 2,
  startingLife: 20,
  startingEnergy: 2,
  energyPerUpkeep: 1,
  openingHand: 6,
  maxHand: 7,
  equipCost: 1,
};
export const PACK_RULES = {
  common: 8,
  uncommon: 3,
  rare: 1,
  legendaryChance: 0.1,
};
export const SETS = { funguys: "Funguys", technocracy: "Technocracy" };
export const RARITIES: Record<string, string[]> = {
  LEGENDARY: ["Elder Fungus", "Power Grid"],
  RARE: [
    "Spore Mother",
    "Networked Resilience",
    "Nightmare Gun",
    "Nanotech Armor",
  ],
  UNCOMMON: [
    "Biotech Shroom",
    "Fungal Growth",
    "Mycelium Armor",
    "Resilient Growth",
    "Regrowth",
    "Techno Scout",
    "Grenadier",
    "Holo Shield",
    "Plasma Blast",
    "Code Erasure",
  ],
};
