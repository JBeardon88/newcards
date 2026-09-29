import Ajv, { type ValidateFunction } from "ajv";
import cardSchema from "../../content/schemas/card.schema.json";
import setSchema from "../../content/schemas/set.schema.json";
import effectSchema from "../../content/schemas/effect.schema.json";
import keywordSchema from "../../content/schemas/keyword.schema.json";
import raritySchema from "../../content/schemas/rarity.schema.json";
import effectReferenceSchema from "../../content/schemas/effect-reference.schema.json";
import { EFFECT_REGISTRY, KEYWORD_REGISTRY } from "../engine/mechanics";
import type { CardDefinition, Effect } from "../engine/model";

export interface SetDefinition {
  setId: string;
  name: string;
  description: string;
  version: number;
  starterPacks: number;
  pack: {
    common: number;
    uncommon: number;
    rare: number;
    legendaryChance: number;
  };
  art: { theme: "funguys" | "technocracy"; symbol: string; title: string };
}
export interface AuthoredCard extends CardDefinition {
  keywords: string[];
}
export interface ContentSource {
  path: string;
  data: unknown;
}
export interface ContentInput {
  sets: ContentSource[];
  cards: ContentSource[];
  tokens: ContentSource;
  keywords: ContentSource;
  effects: ContentSource;
  rarities: ContentSource;
}
const ajv = new Ajv({ allErrors: true, strict: true });
ajv.addSchema(effectSchema);
// Validate each known effect separately to avoid listing every unrelated schema
// branch when a designer misspells one field.
const validateCard = ajv.compile<AuthoredCard>({
  ...cardSchema,
  properties: {
    ...cardSchema.properties,
    effects: {
      type: "array",
      items: {
        type: "object",
        required: ["type"],
        properties: { type: { type: "string" } },
      },
    },
  },
});
const validateSet = ajv.compile<SetDefinition>(setSchema);
const validateKeyword = ajv.compile(keywordSchema);
const validateRarity = ajv.compile(raritySchema);
const validateEffectReference = ajv.compile(effectReferenceSchema);
const own = (o: object, key: string) => Object.hasOwn(o, key);

/** Same validator for browser, CLI, build and tests. Paths refer to authored JSON. */
export function loadContent(input: ContentInput) {
  const errors: string[] = [];
  const fail = (path: string, message: string) =>
    errors.push(`${path}: ${message}`);
  function validate(check: ValidateFunction, data: unknown, path: string) {
    if (check(data)) return true;
    for (const e of check.errors ?? []) {
      // Ajv's branch summaries add noise; concrete field errors are actionable.
      if (e.keyword === "anyOf") continue;
      fail(
        `${path}${e.instancePath}`,
        `${e.message} ${JSON.stringify(e.params)}`,
      );
    }
    return false;
  }
  function entries(source: ContentSource): unknown[] {
    if (Array.isArray(source.data)) return source.data;
    fail(source.path, "must be an array of entries");
    return [];
  }
  function dictionary(source: ContentSource, check: ValidateFunction) {
    const result = new Map<string, Record<string, unknown>>();
    entries(source).forEach((entry, index) => {
      const path = `${source.path}[${index}]`;
      if (!validate(check, entry, path)) return;
      const value = entry as Record<string, unknown>;
      const id = value.id as string;
      if (result.has(id)) fail(path, `duplicate ID "${id}"`);
      result.set(id, value);
    });
    return result;
  }
  const keywords = dictionary(input.keywords, validateKeyword);
  const effects = dictionary(input.effects, validateEffectReference);
  const rarities = dictionary(input.rarities, validateRarity);
  for (const [id, entry] of effects)
    if ((entry.example as Effect).type !== id)
      fail(input.effects.path, `example for "${id}" must use that effect type`);
  for (const [docs, registry, path] of [
    [keywords, KEYWORD_REGISTRY, input.keywords.path],
    [effects, EFFECT_REGISTRY, input.effects.path],
  ] as const) {
    for (const id of Object.keys(registry))
      if (!docs.get(id)?.implemented)
        fail(path, `implemented mechanic "${id}" needs its dictionary entry`);
    for (const [id, entry] of docs)
      if (entry.implemented && !own(registry, id))
        fail(
          path,
          `"${id}" has no engine handler; documentation alone cannot implement a mechanic`,
        );
  }
  for (const id of Object.keys(EFFECT_REGISTRY))
    if (!own(effectSchema.definitions, id))
      fail(
        "content/schemas/effect.schema.json",
        `missing contract for "${id}"`,
      );
  for (const id of Object.keys(effectSchema.definitions))
    if (!own(EFFECT_REGISTRY, id))
      fail(
        "content/schemas/effect.schema.json",
        `"${id}" has no engine handler`,
      );
  for (const id of ["COMMON", "UNCOMMON", "RARE", "LEGENDARY"])
    if (!rarities.has(id)) fail(input.rarities.path, `missing rarity "${id}"`);

  const sets: Record<string, SetDefinition> = Object.create(null);
  const folders = new Map<string, string>();
  const folder = (path: string) => path.slice(0, path.lastIndexOf("/"));
  for (const source of input.sets) {
    if (!validate(validateSet, source.data, source.path)) continue;
    const set = source.data as SetDefinition;
    if (own(sets, set.setId))
      fail(source.path, `duplicate set ID "${set.setId}"`);
    if (folder(source.path).split("/").at(-1) !== set.setId)
      fail(source.path, "setId must match its folder name");
    sets[set.setId] = set;
    folders.set(folder(source.path), set.setId);
    if (set.pack.common + set.pack.uncommon + set.pack.rare === 0)
      fail(source.path, "pack must have at least one slot");
  }
  if (!Object.keys(sets).length)
    fail("content/sets", "at least one set is required");
  const definitions: CardDefinition[] = [];
  const tokens: CardDefinition[] = [];
  const ids = new Set<string>();
  const seenFolders = new Set<string>();
  for (const source of [...input.cards, input.tokens]) {
    const isToken = source === input.tokens;
    const expectedSet = folders.get(folder(source.path));
    if (!isToken && !expectedSet)
      fail(
        source.path,
        "cards.json needs a matching set.json in the same folder",
      );
    if (!isToken) seenFolders.add(folder(source.path));
    entries(source).forEach((entry, index) => {
      const path = `${source.path}[${index}]`;
      if (!validate(validateCard, entry, path)) return;
      const c = entry as AuthoredCard;
      const label = `${path} (${c.definitionId})`;
      if (ids.has(c.definitionId)) fail(label, "duplicate definition ID");
      ids.add(c.definitionId);
      if (!own(sets, c.setId)) fail(label, `unknown set ID "${c.setId}"`);
      if (!isToken && c.setId !== expectedSet)
        fail(label, "setId must match the surrounding set.json");
      if (!c.definitionId.startsWith(`${isToken ? "token" : c.setId}:`))
        fail(
          label,
          `definitionId must start with "${isToken ? "token" : c.setId}:"`,
        );
      if (c.cardType === "CREATURE" && c.health < 1)
        fail(label, "creature health must be at least 1");
      if (isToken && c.cardType !== "CREATURE")
        fail(label, "tokens must be creatures");
      if (!rarities.has(c.rarity)) fail(label, `unknown rarity "${c.rarity}"`);
      for (const keyword of c.keywords) {
        if (
          !own(KEYWORD_REGISTRY, keyword) ||
          !keywords.get(keyword)?.implemented
        )
          fail(
            label,
            `unknown or unimplemented keyword "${keyword}"; see content/keywords/keywords.json`,
          );
        else if (c.cardType !== KEYWORD_REGISTRY[keyword].cardType)
          fail(
            label,
            `${keyword} can only be put on a CREATURE; use grant_ability for attachments`,
          );
      }
      c.effects.forEach((e, i) => {
        const p = `${label}.effects[${i}]`;
        if (!own(EFFECT_REGISTRY, e.type)) {
          fail(
            p,
            `unknown effect "${e.type}"; see content/keywords/effects.json; engine change required`,
          );
          return;
        }
        const check = ajv.getSchema(
          `effect.schema.json#/definitions/${e.type}`,
        );
        if (!check || !validate(check, e, p)) return;
        if (isToken && e.trigger === "on_summon")
          fail(
            p,
            "tokens appear without on_summon triggers; use a supported token trigger such as on_death",
          );
        if (!effects.get(e.type)?.implemented)
          fail(p, `effect "${e.type}" is not documented as implemented`);
        validateEffectUse(c, e, (message) => fail(p, message));
      });
      const { keywords: usedKeywords, ...definition } = structuredClone(c);
      definition.effects.push(
        ...usedKeywords.flatMap((k) =>
          own(KEYWORD_REGISTRY, k)
            ? structuredClone(KEYWORD_REGISTRY[k].effects)
            : [],
        ),
      );
      (isToken ? tokens : definitions).push(definition);
    });
  }
  for (const [path, setId] of folders) {
    if (!seenFolders.has(path)) fail(path, "missing cards.json");
    const pool = definitions.filter((c) => c.setId === setId);
    if (!pool.length)
      fail(
        `${path}/cards.json`,
        "set must contain at least one collectible card",
      );
    const pack = sets[setId].pack;
    const needed = [
      ["COMMON", pack.common > 0],
      ["UNCOMMON", pack.uncommon > 0],
      ["RARE", pack.rare > 0 && pack.legendaryChance < 1],
      ["LEGENDARY", pack.rare > 0 && pack.legendaryChance > 0],
    ] as const;
    for (const [rarity, required] of needed)
      if (required && !pool.some((c) => c.rarity === rarity))
        fail(
          `${path}/set.json`,
          `pack can draw ${rarity}, but cards.json has no ${rarity} card; add one or change pack slots/chance`,
        );
  }
  if (!tokens.some((c) => c.definitionId === "token:sporeling"))
    fail(input.tokens.path, "summon_token requires token:sporeling");
  if (errors.length)
    throw Error(
      `Content validation failed:\n${[...new Set(errors)].map((e) => `- ${e}`).join("\n")}`,
    );
  return {
    definitions,
    sets,
    cards: Object.fromEntries(
      [...definitions, ...tokens].map((c) => [c.definitionId, c]),
    ),
    tokenDefinition: tokens.find((c) => c.definitionId === "token:sporeling")!,
  };
}

function validateEffectUse(
  c: AuthoredCard,
  e: Effect,
  fail: (message: string) => void,
) {
  if (e.trigger === "on_cast" && c.cardType !== "SPELL")
    fail("on_cast requires a SPELL");
  if (e.trigger !== "on_cast" && c.cardType === "SPELL")
    fail("SPELL effects must use on_cast");
  if (e.trigger === "on_death" && c.cardType !== "CREATURE")
    fail("on_death requires a CREATURE");
  if (e.type === "conditional_gain_attack" && c.cardType !== "CREATURE")
    fail("conditional_gain_attack requires a CREATURE");
  const attached =
    ["creature", "equipped_creature", "enchanted_creature"].includes(
      e.target ?? "",
    ) &&
    [
      "gain_attack",
      "gain_defense",
      "lose_attack",
      "grant_ability",
      "regenerate_health",
    ].includes(e.type);
  if (attached) {
    if (c.cardType === "ARTIFACT") {
      if (e.target === "enchanted_creature")
        fail("ARTIFACT attachments use equipped_creature (or creature)");
      if (
        !["constant", "on_upkeep", "on_play_equipment"].includes(
          e.trigger ?? "",
        )
      )
        fail(
          "attached artifact effects need constant, on_upkeep or on_play_equipment; the artifact is unattached when summoned",
        );
    } else if (c.cardType === "AUGMENTATION") {
      if (e.target !== "enchanted_creature")
        fail(
          "AUGMENTATION attachments must use enchanted_creature so a bearer is selected on play",
        );
    } else fail("attached targets require an ARTIFACT or AUGMENTATION");
  }
  if (
    e.condition === "mycelium_network" &&
    e.target !== "creatures_you_control_with_mycelium_network"
  )
    fail(
      "mycelium_network condition requires creatures_you_control_with_mycelium_network target",
    );
}
