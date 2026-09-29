import { describe, it, expect } from "vitest";
import { contentInput, sets, cards as liveCards } from "../src/content/catalog";
import fixture from "./fixtures/content.json";
import {
  loadContent,
  type AuthoredCard,
  type ContentInput,
  type SetDefinition,
} from "../src/content/validate";
import { mechanic, EFFECT_REGISTRY } from "../src/engine/mechanics";
import { createProfile, mintPack, openPack } from "../src/economy/collection";
import { execute, stats } from "../src/engine/rules";
import type { GameState, MatchCard } from "../src/engine/model";

const input = (): ContentInput => structuredClone(fixture);
const firstCard = (data: ContentInput) =>
  (data.cards[0].data as AuthoredCard[])[0];
const firstSet = (data: ContentInput) => data.sets[0].data as SetDefinition;

describe("canonical content", () => {
  it("validates the live designer content without fixing its balance or size", () => {
    expect(() => loadContent(contentInput)).not.toThrow();
  });
  it("preserves all 44 baseline definitions and their order from commit 2753ca2", async () => {
    // Captured before migration, excluding ignored legacy token/destination fields.
    // Only the engine-test fixture is frozen. Designers can freely edit live content.
    const { definitions, cards } = loadContent(input());
    expect(definitions).toHaveLength(44);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(definitions)),
    );
    expect(
      Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
    ).toBe("8083c736ff52343fa8a90665c50a6933aa23339e2d57ba745b3a8d2d66c12eb1");
    expect(cards["token:sporeling"].attack).toBe(1);
    expect(definitions.some((c) => c.definitionId.startsWith("token:"))).toBe(
      false,
    );
  });
  it("can rename, rebalance and change rarity without changing identity", () => {
    const data = input();
    const c = firstCard(data);
    const id = c.definitionId;
    Object.assign(c, {
      name: "Scout renamed",
      cost: 2,
      attack: 3,
      health: 4,
      rarity: "RARE",
      flavorText: "New story",
      rulesText: "New text",
    });
    const result = loadContent(data).cards[id];
    expect(result).toMatchObject({
      definitionId: id,
      name: "Scout renamed",
      cost: 2,
      attack: 3,
      health: 4,
      rarity: "RARE",
      flavorText: "New story",
    });
    expect(firstCard(input()).name).toBe("Fungal Scout");
  });
  it("loads a new set and composed card entirely from supplied content", () => {
    const data = input();
    data.sets.push({
      path: "content/sets/garden/set.json",
      data: {
        ...firstSet(data),
        setId: "garden",
        name: "Garden",
        starterPacks: 0,
        pack: { common: 1, uncommon: 0, rare: 0, legendaryChance: 0 },
      },
    });
    data.cards.push({
      path: "content/sets/garden/cards.json",
      data: [
        {
          ...firstCard(data),
          definitionId: "garden:reader",
          setId: "garden",
          keywords: ["MYCELIUM_NETWORK"],
          effects: [
            { type: "draw_cards", trigger: "on_summon", value: 1 },
            { type: "increase_energy", trigger: "on_summon", value: 2 },
          ],
        },
      ],
    });
    const result = loadContent(data);
    expect(result.sets.garden.name).toBe("Garden");
    expect(result.cards["garden:reader"].effects.map((e) => e.type)).toEqual([
      "draw_cards",
      "increase_energy",
      "mycelium_network",
    ]);
    expect((data.cards.at(-1)!.data as AuthoredCard[])[0].effects).toHaveLength(
      2,
    );
  });
  it("uses each set's authored pack configuration and rejects unknown sets", () => {
    const p = createProfile(123);
    expect(() => mintPack(p, "missing")).toThrow("Unknown set");
    const setId = Object.keys(sets)[0];
    const original = sets[setId].pack;
    try {
      const rarity = loadContent(contentInput).definitions.find(
        (c) => c.setId === setId,
      )!.rarity;
      sets[setId].pack = {
        common: rarity === "COMMON" ? 2 : 0,
        uncommon: rarity === "UNCOMMON" ? 2 : 0,
        rare: ["RARE", "LEGENDARY"].includes(rarity) ? 2 : 0,
        legendaryChance: rarity === "LEGENDARY" ? 1 : 0,
      };
      const pack = mintPack(p, setId);
      const ids = openPack(p, pack.packId);
      expect(ids).toHaveLength(2);
      expect(ids.every((id) => p.instances[id].rarity === rarity)).toBe(true);
    } finally {
      sets[setId].pack = original;
    }
  });
  it("has explicit registry coverage and refuses unsupported dispatch", () => {
    expect(Object.keys(EFFECT_REGISTRY)).toHaveLength(15);
    expect(mechanic("deal_damage").targeted).toBe(true);
    expect(() => mechanic("HASTE")).toThrow("engine implementation");
  });
  it("plays a newly authored combination through the real engine", () => {
    const data = input();
    const c = firstCard(data);
    c.definitionId = "funguys:test-composed-reader";
    c.keywords = ["MYCELIUM_NETWORK"];
    c.effects = [
      { type: "draw_cards", trigger: "on_summon", value: 1 },
      { type: "increase_energy", trigger: "on_summon", value: 2 },
    ];
    const d = loadContent(data).cards[c.definitionId];
    const previous = liveCards[d.definitionId];
    liveCards[d.definitionId] = d;
    const unit = (id: string, zone: MatchCard["zone"]): MatchCard => ({
      id,
      definitionId: d.definitionId,
      owner: "human",
      zone,
      tapped: false,
      sick: false,
      damage: 0,
      bonusAttack: 0,
      bonusHealth: 0,
      temporaryAttack: 0,
      deployed: zone === "battlefield",
      recovered: false,
    });
    const state: GameState = {
      matchId: "content-combination",
      seed: 1,
      rngState: 1,
      startedAt: "2026-09-29T00:00:00.000Z",
      turn: 1,
      active: "human",
      phase: "MAIN",
      status: "ACTIVE",
      players: {
        human: {
          life: 20,
          energy: 10,
          temporaryEnergy: 0,
          fatigue: 0,
          deck: ["draw"],
        },
        ai: { life: 20, energy: 10, temporaryEnergy: 0, fatigue: 0, deck: [] },
      },
      cards: {
        reader: unit("reader", "hand"),
        ally: unit("ally", "battlefield"),
        draw: unit("draw", "deck"),
      },
      attackers: [],
      pending: [],
      events: [],
      commands: [],
    };
    try {
      const result = execute(state, {
        actor: "human",
        type: "PLAY_CARD",
        cardId: "reader",
      });
      expect(result.error).toBeUndefined();
      expect(result.state.cards.draw.zone).toBe("hand");
      expect(result.state.players.human.energy).toBe(10 - c.cost + 2);
      expect(stats(result.state, result.state.cards.reader).health).toBe(
        c.health + 1,
      );
      expect(stats(result.state, result.state.cards.ally).health).toBe(
        c.health + 1,
      );
      expect(state.cards.reader.zone).toBe("hand");
    } finally {
      if (previous) liveCards[d.definitionId] = previous;
      else delete liveCards[d.definitionId];
    }
  });
});

describe("actionable content errors", () => {
  it.each([
    [
      "duplicate IDs",
      (d: ContentInput) =>
        (d.cards[0].data as AuthoredCard[]).push(structuredClone(firstCard(d))),
      /duplicate definition ID/,
    ],
    [
      "unknown set",
      (d: ContentInput) => {
        firstCard(d).setId = "missing";
      },
      /unknown set ID/,
    ],
    [
      "unknown type",
      (d: ContentInput) => {
        Object.assign(firstCard(d), { cardType: "WIZARD" });
      },
      /cardType/,
    ],
    [
      "unknown rarity",
      (d: ContentInput) => {
        Object.assign(firstCard(d), { rarity: "MYTHIC" });
      },
      /rarity/,
    ],
    [
      "unknown keyword",
      (d: ContentInput) => {
        firstCard(d).keywords = ["HASTE"];
      },
      /unknown or unimplemented keyword/,
    ],
    [
      "unknown effect",
      (d: ContentInput) => {
        firstCard(d).effects = [{ type: "fly", trigger: "on_summon" }];
      },
      /unknown effect "fly"/,
    ],
    [
      "wrong trigger",
      (d: ContentInput) => {
        firstCard(d).effects = [
          { type: "draw_cards", trigger: "whenever", value: 1 },
        ];
      },
      /trigger/,
    ],
    [
      "wrong target",
      (d: ContentInput) => {
        firstCard(d).effects = [
          {
            type: "deal_damage",
            trigger: "on_summon",
            target: "everything",
            value: 1,
          },
        ];
      },
      /target/,
    ],
    [
      "missing value",
      (d: ContentInput) => {
        firstCard(d).effects = [{ type: "draw_cards", trigger: "on_summon" }];
      },
      /value/,
    ],
    [
      "fractional value",
      (d: ContentInput) => {
        firstCard(d).effects = [
          { type: "draw_cards", trigger: "on_summon", value: 1.5 },
        ];
      },
      /integer/,
    ],
    [
      "negative cost",
      (d: ContentInput) => {
        firstCard(d).cost = -1;
      },
      /cost/,
    ],
    [
      "zero creature health",
      (d: ContentInput) => {
        firstCard(d).health = 0;
      },
      /health must be at least 1/,
    ],
    [
      "misspelled field",
      (d: ContentInput) => {
        Object.assign(firstCard(d), { helth: 2 });
      },
      /helth/,
    ],
    [
      "malformed entry",
      (d: ContentInput) => {
        (d.cards[0].data as unknown[])[0] = null;
      },
      /must be object/,
    ],
    [
      "malformed list",
      (d: ContentInput) => {
        d.cards[0].data = {};
      },
      /must be an array/,
    ],
    [
      "missing companion",
      (d: ContentInput) => {
        d.sets.shift();
      },
      /matching set.json/,
    ],
    [
      "missing cards",
      (d: ContentInput) => {
        d.cards.shift();
      },
      /missing cards.json/,
    ],
    [
      "impossible pack",
      (d: ContentInput) => {
        (d.cards[0].data as AuthoredCard[]).forEach((c) => {
          c.rarity = "COMMON";
        });
      },
      /pack can draw UNCOMMON/,
    ],
    [
      "bad probability",
      (d: ContentInput) => {
        firstSet(d).pack.legendaryChance = 2;
      },
      /legendaryChance/,
    ],
    [
      "spell trigger on creature",
      (d: ContentInput) => {
        firstCard(d).effects = [
          { type: "draw_cards", trigger: "on_cast", value: 1 },
        ];
      },
      /on_cast requires a SPELL/,
    ],
    [
      "unattached effect",
      (d: ContentInput) => {
        firstCard(d).effects = [
          {
            type: "gain_attack",
            trigger: "constant",
            value: 1,
            target: "equipped_creature",
          },
        ];
      },
      /attached targets require/,
    ],
    [
      "ignored duration",
      (d: ContentInput) => {
        firstCard(d).effects = [
          {
            type: "gain_defense",
            trigger: "on_summon",
            target: "all_creatures_you_control",
            value: 1,
            duration: "end_of_turn",
          },
        ];
      },
      /duration/,
    ],
    [
      "ignored parameter",
      (d: ContentInput) => {
        firstCard(d).effects = [
          Object.assign(
            { type: "draw_cards", trigger: "on_summon", value: 1 },
            { chance: 0.5 },
          ),
        ];
      },
      /chance/,
    ],
    [
      "dictionary-only implementation",
      (d: ContentInput) => {
        (d.keywords.data as unknown[]).push({
          id: "HASTE",
          name: "Haste",
          description: "Attack immediately",
          implemented: true,
          rulesNotes: "Not implemented",
          parameters: "None",
        });
      },
      /no engine handler/,
    ],
    [
      "missing documentation",
      (d: ContentInput) => {
        d.effects.data = [];
      },
      /needs its dictionary entry/,
    ],
  ])("rejects %s", (_name, mutate, message) => {
    const data = input();
    mutate(data);
    expect(() => loadContent(data)).toThrow(message);
    expect(() => loadContent(data)).toThrow(/content\//);
  });
});
