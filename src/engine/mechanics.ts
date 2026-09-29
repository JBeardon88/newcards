import type { Effect } from "./model";

/** Explicit safe dispatch boundary. JSON can select these mechanics, never code. */
export const EFFECT_REGISTRY = {
  draw_cards: { handler: "applyEffect", queued: true, targeted: false },
  deal_damage: { handler: "applyEffect", queued: true, targeted: true },
  increase_energy: { handler: "applyEffect", queued: true, targeted: false },
  summon_token: { handler: "applyEffect", queued: true, targeted: false },
  destroy_equipment: { handler: "applyEffect", queued: true, targeted: true },
  destroy_enchantment: { handler: "applyEffect", queued: true, targeted: true },
  return_from_discard: { handler: "applyEffect", queued: true, targeted: true },
  gain_attack: {
    handler: "stats/applyEffect/DECLARE_ATTACKERS",
    queued: true,
    targeted: false,
  },
  gain_defense: { handler: "stats/applyEffect", queued: true, targeted: false },
  lose_attack: { handler: "applyEffect", queued: true, targeted: false },
  regenerate_health: { handler: "applyEffect", queued: true, targeted: false },
  grant_ability: { handler: "hasNetwork", queued: false, targeted: false },
  conditional_gain_attack: { handler: "stats", queued: false, targeted: false },
  equipment_cost_reduction: { handler: "cost", queued: false, targeted: false },
  increase_energy_regen: { handler: "upkeep", queued: false, targeted: false },
} as const;

/** Every registered queued mechanic must have a function in rules.ts. */
export type QueuedEffectType = {
  [
    K in keyof typeof EFFECT_REGISTRY
  ]: (typeof EFFECT_REGISTRY)[K]["queued"] extends true ? K : never;
}[keyof typeof EFFECT_REGISTRY];

export const KEYWORD_REGISTRY: Record<
  string,
  { cardType: "CREATURE"; effects: Effect[] }
> = {
  MYCELIUM_NETWORK: {
    cardType: "CREATURE",
    effects: [{ type: "mycelium_network", trigger: "constant" }],
  },
};

export function mechanic(type: string) {
  if (!Object.hasOwn(EFFECT_REGISTRY, type))
    throw Error(
      `Unsupported effect type "${type}". An engine implementation is required.`,
    );
  return EFFECT_REGISTRY[type as keyof typeof EFFECT_REGISTRY];
}
