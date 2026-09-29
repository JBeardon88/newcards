import { sets } from "../content/catalog";
import { cards, definitions } from "../data/cards";
import { RULES } from "../data/config";
import { SeededRng } from "../engine/rng";
import type {
  Profile,
  Owner,
  SetId,
  CardInstance,
  Deck,
  Pack,
  Rarity,
} from "../engine/model";
const id = () => crypto.randomUUID();
export function mintCard(
  p: Profile,
  definitionId: string,
  owner: Owner,
  packId = "dev-grant",
  now = new Date().toISOString(),
): CardInstance {
  const d = cards[definitionId];
  if (!d || d.definitionId.startsWith("token:"))
    throw Error("Unknown collectible definition");
  const c: CardInstance = {
    instanceId: id(),
    definitionId,
    serialNumber: ++p.serial,
    setId: d.setId,
    rarity: d.rarity,
    packId,
    mintedAt: now,
    originalOwnerId: owner,
    currentOwnerId: owner,
    lifecycleStatus: "ALIVE",
    history: [
      {
        type: "MINTED",
        timestamp: now,
        owner,
        details: `Minted from ${packId}`,
      },
    ],
  };
  p.instances[c.instanceId] = c;
  return c;
}
export function mintPack(
  p: Profile,
  setId: SetId,
  owner: Owner = "human",
  now = new Date().toISOString(),
): Pack {
  if (!Object.hasOwn(sets, setId)) throw Error(`Unknown set "${setId}".`);
  const pack: Pack = {
    packId: id(),
    serialNumber: ++p.packSerial,
    setId,
    ownerId: owner,
    createdAt: now,
    instanceIds: [],
  };
  p.packs.push(pack);
  return pack;
}
export function openPack(
  p: Profile,
  packId: string,
  now = new Date().toISOString(),
): string[] {
  const pack = p.packs.find((x) => x.packId === packId);
  if (!pack || pack.openedAt) throw Error("Pack missing or already opened");
  const config = sets[pack.setId]?.pack;
  if (!config) throw Error(`Unknown set "${pack.setId}".`);
  const rng = new SeededRng(p.rngState);
  const slots: Rarity[] = [
    ...Array<Rarity>(config.common).fill("COMMON"),
    ...Array<Rarity>(config.uncommon).fill("UNCOMMON"),
    ...Array.from({ length: config.rare }, () =>
      rng.next() < config.legendaryChance
        ? ("LEGENDARY" as const)
        : ("RARE" as const),
    ),
  ];
  pack.instanceIds = slots.map(
    (r) =>
      mintCard(
        p,
        rng.pick(
          definitions.filter((d) => d.setId === pack.setId && d.rarity === r),
        ).definitionId,
        pack.ownerId,
        pack.packId,
        now,
      ).instanceId,
  );
  pack.openedAt = now;
  p.rngState = rng.state;
  return pack.instanceIds;
}
export function deckErrors(p: Profile, ids: string[], owner: Owner): string[] {
  const errors: string[] = [];
  if (ids.length !== RULES.deckSize)
    errors.push(`Deck needs ${RULES.deckSize} cards (${ids.length} selected).`);
  if (new Set(ids).size !== ids.length)
    errors.push("The same instance cannot be used twice.");
  const counts: Record<string, number> = {};
  for (const id of ids) {
    const c = p.instances[id];
    if (!c) {
      errors.push("Missing card instance.");
      continue;
    }
    if (c.currentOwnerId !== owner)
      errors.push("Card is not owned by this wallet.");
    if (c.lifecycleStatus !== "ALIVE")
      errors.push(`${cards[c.definitionId].name} is ${c.lifecycleStatus}.`);
    counts[c.definitionId] = (counts[c.definitionId] ?? 0) + 1;
  }
  if (Object.values(counts).some((n) => n > RULES.maxCopies))
    errors.push("Maximum two copies per definition.");
  return [...new Set(errors)];
}
export function autoBuild(
  p: Profile,
  owner: Owner,
  setId?: SetId,
  seed = p.rngState,
): string[] {
  const rng = new SeededRng(seed);
  const counts: Record<string, number> = {};
  const result: string[] = [];
  for (const c of rng.shuffle(
    Object.values(p.instances).filter(
      (c) =>
        c.currentOwnerId === owner &&
        c.lifecycleStatus === "ALIVE" &&
        (!setId || c.setId === setId),
    ),
  )) {
    if ((counts[c.definitionId] ?? 0) >= RULES.maxCopies) continue;
    counts[c.definitionId] = (counts[c.definitionId] ?? 0) + 1;
    result.push(c.instanceId);
    if (result.length === RULES.deckSize) break;
  }
  if (result.length < RULES.deckSize)
    throw Error(
      `Only ${result.length}/30 legal cards available${setId ? ` from ${setId}` : ""}. Open more packs or grant test cards.`,
    );
  return result;
}
export function saveDeck(
  p: Profile,
  ids: string[],
  name: string,
  deckId?: string,
): Deck {
  const errors = deckErrors(p, ids, "human");
  if (errors.length) throw Error(errors.join(" "));
  const deck = {
    deckId: deckId ?? id(),
    name: name.trim() || "Untitled deck",
    ownerId: "human" as const,
    instanceIds: [...ids],
  };
  p.decks = p.decks.filter((d) => d.deckId !== deck.deckId);
  p.decks.push(deck);
  return deck;
}
export function seedAI(p: Profile) {
  if (p.activeMatch) throw Error("Settle the active match before reseeding.");
  for (const d of definitions)
    for (let i = 0; i < 4; i++)
      mintCard(p, d.definitionId, "ai", "ai-test-grant");
}
export function createProfile(seed = 20260929): Profile {
  const p: Profile = {
    version: 1,
    wallets: {
      human: { id: "human", name: "Player" },
      ai: { id: "ai", name: "The Custodian" },
    },
    instances: {},
    packs: [],
    decks: [],
    serial: 0,
    packSerial: 0,
    rngState: seed,
    matches: [],
  };
  for (const set of Object.values(sets))
    for (let i = 0; i < set.starterPacks; i++) mintPack(p, set.setId);
  seedAI(p);
  return p;
}
