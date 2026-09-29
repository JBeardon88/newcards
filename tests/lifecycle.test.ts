import { describe, it, expect } from "vitest";
import { definitions, cards } from "../src/data/cards";
import {
  autoBuild,
  createProfile,
  deckErrors,
  mintCard,
  mintPack,
  openPack,
  saveDeck,
  seedAI,
} from "../src/economy/collection";
import {
  singleDeployedArtifact,
  settle,
  settlementPreview,
} from "../src/economy/settlement";
import {
  actor,
  availableAttackers,
  availableBlockers,
  createMatch,
  execute,
  stats,
  zone,
} from "../src/engine/rules";
import { aiController } from "../src/engine/ai";
import { SeededRng } from "../src/engine/rng";
import { LocalPersistence, deserialize } from "../src/persistence/storage";
import type {
  GameState,
  GameCommand,
  Lifecycle,
  Owner,
  Profile,
  MatchCard,
} from "../src/engine/model";
const now = "2026-09-29T14:00:00.000Z";
function collection() {
  const p = createProfile(123);
  for (const d of definitions)
    for (let i = 0; i < 2; i++)
      mintCard(p, d.definitionId, "human", "test", now);
  return p;
}
function fixture() {
  const p = collection();
  const s = createMatch(
    p,
    autoBuild(p, "human"),
    autoBuild(p, "ai"),
    10,
    "test-match",
    now,
  );
  s.phase = "MAIN";
  s.players.human.energy = 50;
  s.players.ai.energy = 50;
  return { p, s };
}
function add(
  p: Profile,
  s: GameState,
  name: string,
  owner: Owner = "human",
  zone: MatchCard["zone"] = "hand",
) {
  const d = definitions.find((d) => d.name === name)!;
  const c = mintCard(p, d.definitionId, owner, "test", now);
  s.cards[c.instanceId] = {
    id: c.instanceId,
    definitionId: d.definitionId,
    owner,
    zone,
    tapped: false,
    sick: false,
    damage: 0,
    bonusAttack: 0,
    bonusHealth: 0,
    temporaryAttack: 0,
    deployed: zone === "battlefield",
    recovered: false,
  };
  return c.instanceId;
}
function command(s: GameState, c: GameCommand) {
  const result = execute(s, c);
  expect(result.error).toBeUndefined();
  return result.state;
}
function finish(p: Profile, s: GameState, winner: Owner = "human") {
  s.status = "FINISHED";
  s.winner = winner;
  s.result = "Test completed";
  p.activeMatch = s;
  return p;
}
describe("minting and wallet integrity", () => {
  it("starts with six unopened single-set packs and honest AI instances", () => {
    const p = createProfile();
    expect(p.packs).toHaveLength(6);
    expect(p.packs.filter((x) => x.setId === "funguys")).toHaveLength(3);
    expect(
      Object.values(p.instances).filter((c) => c.currentOwnerId === "human"),
    ).toHaveLength(0);
    expect(deckErrors(p, autoBuild(p, "ai"), "ai")).toEqual([]);
  });
  it("opens six packs into exactly 72 unique human instances with separate serials", () => {
    const p = createProfile();
    for (const pack of p.packs) openPack(p, pack.packId, now);
    const own = Object.values(p.instances).filter(
      (c) => c.currentOwnerId === "human",
    );
    expect(own).toHaveLength(72);
    expect(new Set(own.map((c) => c.instanceId)).size).toBe(72);
    expect(new Set(own.map((c) => c.serialNumber)).size).toBe(72);
    for (const pack of p.packs) {
      expect(pack.instanceIds).toHaveLength(12);
      expect(
        pack.instanceIds.every((id) => p.instances[id].setId === pack.setId),
      ).toBe(true);
      expect(
        pack.instanceIds.filter((id) => p.instances[id].rarity === "COMMON"),
      ).toHaveLength(8);
      expect(
        pack.instanceIds.filter((id) => p.instances[id].rarity === "UNCOMMON"),
      ).toHaveLength(3);
    }
    expect(own.every((c) => c.history[0].type === "MINTED")).toBe(true);
    expect(() => openPack(p, p.packs[0].packId)).toThrow("already opened");
  });
  it("reproduces seeded pack definitions while minting distinct UUIDs", () => {
    const a = createProfile(42),
      b = createProfile(42);
    const aa = openPack(a, a.packs[0].packId),
      bb = openPack(b, b.packs[0].packId);
    expect(aa.map((id) => a.instances[id].definitionId)).toEqual(
      bb.map((id) => b.instances[id].definitionId),
    );
    expect(aa).not.toEqual(bb);
  });
  it("keeps captures and terminal histories during AI reseeding", () => {
    const p = collection();
    const c = Object.values(p.instances)[0];
    c.lifecycleStatus = "DEAD";
    const count = p.serial;
    seedAI(p);
    expect(p.instances[c.instanceId].lifecycleStatus).toBe("DEAD");
    expect(p.serial).toBe(count + definitions.length * 4);
  });
  it("round-trips instances, packs, provenance and decks through persistence", () => {
    const p = collection();
    openPack(p, p.packs[0].packId, now);
    saveDeck(p, autoBuild(p, "human"), "Test");
    const map = new Map<string, string>();
    const adapter = new LocalPersistence({
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        map.set(k, v);
      },
      removeItem: (k) => {
        map.delete(k);
      },
    });
    adapter.save(p);
    expect(adapter.load()).toEqual(p);
    expect(deserialize(JSON.stringify(p))).toEqual(p);
    expect(() => deserialize('{"version":2}')).toThrow("Unsupported");
  });
});
describe("decks", () => {
  it("requires exactly thirty cards", () => {
    const p = collection();
    expect(deckErrors(p, autoBuild(p, "human"), "human")).toEqual([]);
    expect(
      deckErrors(p, autoBuild(p, "human").slice(1), "human").join(),
    ).toContain("30");
  });
  it("rejects duplicate instance IDs and more than two copies", () => {
    const p = collection(),
      ids = autoBuild(p, "human");
    expect(deckErrors(p, [...ids.slice(1), ids[1]], "human").join()).toContain(
      "same instance",
    );
    const d = p.instances[ids[0]].definitionId;
    const more = [
      mintCard(p, d, "human").instanceId,
      mintCard(p, d, "human").instanceId,
      mintCard(p, d, "human").instanceId,
    ];
    expect(deckErrors(p, [...ids.slice(3), ...more], "human").join()).toContain(
      "two copies",
    );
  });
  it("rejects cards owned by another wallet", () => {
    const p = collection();
    expect(deckErrors(p, autoBuild(p, "ai"), "human").join()).toContain(
      "not owned",
    );
  });
  it.each(["DEAD", "CONSUMED", "DESTROYED"] as Lifecycle[])(
    "rejects %s cards",
    (status) => {
      const p = collection(),
        ids = autoBuild(p, "human");
      p.instances[ids[0]].lifecycleStatus = status;
      expect(deckErrors(p, ids, "human").join()).toContain(status);
      expect(autoBuild(p, "human")).not.toContain(ids[0]);
    },
  );
  it.each(["funguys", "technocracy", undefined] as const)(
    "auto-builder enforces ownership, copy limit and set restriction %s",
    (set) => {
      const p = collection(),
        ids = autoBuild(p, "human", set, 99);
      expect(deckErrors(p, ids, "human")).toEqual([]);
      expect(
        ids.every((id) => p.instances[id].currentOwnerId === "human"),
      ).toBe(true);
      if (set)
        expect(ids.every((id) => p.instances[id].setId === set)).toBe(true);
      else expect(new Set(ids.map((id) => p.instances[id].setId)).size).toBe(2);
      expect(autoBuild(p, "human", set, 99)).toEqual(ids);
    },
  );
  it("reports insufficient collection without fabricating copies", () => {
    const p = createProfile();
    expect(() => autoBuild(p, "human")).toThrow("0/30");
    expect(() => saveDeck(p, [], "Invalid")).toThrow("30");
  });
});
describe("determinism and commands", () => {
  it("reproduces the PRNG sequence and shuffle", () => {
    const a = new SeededRng(1),
      b = new SeededRng(1);
    expect(a.next()).toBe(0.6270739405881613);
    expect(b.next()).toBe(0.6270739405881613);
    expect(a.next()).toBe(b.next());
  });
  it("shuffles without modifying the input", () => {
    const original = [1, 2, 3, 4, 5];
    expect(new SeededRng(5).shuffle(original)).toEqual(
      new SeededRng(5).shuffle(original),
    );
    expect(original).toEqual([1, 2, 3, 4, 5]);
  });
  it("creates repeatable serializable match state with opening draw and upkeep", () => {
    const p = collection(),
      h = autoBuild(p, "human"),
      a = autoBuild(p, "ai");
    const s = createMatch(p, h, a, 88, "id", now);
    expect(s).toEqual(createMatch(p, h, a, 88, "id", now));
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(zone(s, "human", "hand")).toHaveLength(7);
    expect(zone(s, "ai", "hand")).toHaveLength(6);
    expect(s.players.human.energy).toBe(3);
  });
  it("rejects illegal play atomically, including wrong actor, zone, phase and energy", () => {
    const { p, s } = fixture();
    const id = add(p, s, "Plasma Rifle");
    s.players.human.energy = 0;
    const before = JSON.stringify(s);
    expect(
      execute(s, { actor: "human", type: "PLAY_CARD", cardId: id }).error,
    ).toContain("energy");
    expect(JSON.stringify(s)).toBe(before);
    expect(
      execute(s, { actor: "ai", type: "PLAY_CARD", cardId: id }).error,
    ).toContain("priority");
    s.players.human.energy = 10;
    s.phase = "ATTACK";
    expect(
      execute(s, { actor: "human", type: "PLAY_CARD", cardId: id }).error,
    ).toContain("main");
    s.phase = "MAIN";
    expect(
      execute(s, { actor: "human", type: "PLAY_CARD", cardId: "missing" })
        .error,
    ).toContain("hand");
  });
  it("pays energy and enters creatures tapped and summoning sick", () => {
    const { p, s } = fixture(),
      id = add(p, s, "Fungal Scout");
    const next = command(s, { actor: "human", type: "PLAY_CARD", cardId: id });
    expect(next.players.human.energy).toBe(49);
    expect(next.cards[id]).toMatchObject({
      zone: "battlefield",
      sick: true,
      tapped: true,
    });
    next.phase = "ATTACK";
    expect(availableAttackers(next)).not.toContain(id);
    expect(
      execute(next, {
        actor: "human",
        type: "DECLARE_ATTACKERS",
        cardIds: [id],
      }).error,
    ).toContain("Illegal attacker");
  });
  it("untaps and removes sickness only during owner upkeep", () => {
    const { p, s } = fixture(),
      id = add(p, s, "Fungal Scout", "human", "battlefield");
    s.cards[id].sick = true;
    s.cards[id].tapped = true;
    s.active = "ai";
    s.phase = "END";
    const n = command(s, { actor: "ai", type: "PASS_PHASE" });
    expect(n.cards[id]).toMatchObject({ sick: false, tapped: false });
    expect(n.active).toBe("human");
  });
  it("draws two cards and sends the cast spell to the graveyard", () => {
    const { p, s } = fixture(),
      id = add(p, s, "Data Surge");
    const size = zone(s, "human", "hand").length;
    const n = command(s, { actor: "human", type: "PLAY_CARD", cardId: id });
    expect(n.cards[id].zone).toBe("graveyard");
    expect(zone(n, "human", "hand")).toHaveLength(size + 1);
  });
  it("validates targeting before charging energy", () => {
    const { p, s } = fixture(),
      id = add(p, s, "Spore Burst");
    const n = execute(s, {
      actor: "human",
      type: "PLAY_CARD",
      cardId: id,
      targetId: "human",
    });
    expect(n.error).toContain("target");
    expect(n.state).toBe(s);
  });
  it("deals direct combat damage and taps attackers", () => {
    const { p, s } = fixture(),
      id = add(p, s, "Edgerunner Soldier", "human", "battlefield");
    s.phase = "ATTACK";
    let n = command(s, {
      actor: "human",
      type: "DECLARE_ATTACKERS",
      cardIds: [id],
    });
    expect(n.cards[id].tapped).toBe(true);
    expect(actor(n)).toBe("ai");
    n = command(n, { actor: "ai", type: "DECLARE_BLOCKERS", assignments: {} });
    expect(n.players.ai.life).toBe(17);
    expect(n.phase).toBe("MAIN2");
  });
  it("blocks and applies simultaneous combat damage, moving dead creatures to graveyard", () => {
    const { p, s } = fixture(),
      a = add(p, s, "Edgerunner Soldier", "human", "battlefield"),
      b = add(p, s, "Cyborg Gunner", "ai", "battlefield");
    s.phase = "ATTACK";
    let n = command(s, {
      actor: "human",
      type: "DECLARE_ATTACKERS",
      cardIds: [a],
    });
    n = command(n, {
      actor: "ai",
      type: "DECLARE_BLOCKERS",
      assignments: { [a]: b },
    });
    expect(n.cards[a].zone).toBe("graveyard");
    expect(n.cards[b].zone).toBe("graveyard");
    expect(n.players.ai.life).toBe(20);
    expect(p.instances[a].lifecycleStatus).toBe("ALIVE");
  });
  it("rejects tapped blockers and duplicate blocker assignments", () => {
    const { p, s } = fixture(),
      a = add(p, s, "Fungal Scout", "human", "battlefield"),
      a2 = add(p, s, "Fungal Scout", "human", "battlefield"),
      b = add(p, s, "Fungal Scout", "ai", "battlefield");
    s.phase = "ATTACK";
    const n = command(s, {
      actor: "human",
      type: "DECLARE_ATTACKERS",
      cardIds: [a, a2],
    });
    expect(
      execute(n, {
        actor: "ai",
        type: "DECLARE_BLOCKERS",
        assignments: { [a]: b, [a2]: b },
      }).error,
    ).toContain("once");
    n.cards[b].tapped = true;
    expect(availableBlockers(n)).not.toContain(b);
    expect(
      execute(n, {
        actor: "ai",
        type: "DECLARE_BLOCKERS",
        assignments: { [a]: b },
      }).error,
    ).toContain("Illegal");
  });
  it.each([
    ["EMP Pulse", "Plasma Rifle"],
    ["Code Erasure", "Battery Array"],
  ])("uses %s to destroy %s", (spell, target) => {
    const { p, s } = fixture(),
      id = add(p, s, spell),
      victim = add(p, s, target, "ai", "battlefield");
    const n = command(s, {
      actor: "human",
      type: "PLAY_CARD",
      cardId: id,
      targetId: victim,
    });
    expect(n.cards[victim].zone).toBe("graveyard");
    expect(n.cards[id].zone).toBe("graveyard");
  });
  it("returns a dead creature to hand with Regrowth", () => {
    const { p, s } = fixture(),
      id = add(p, s, "Regrowth"),
      victim = add(p, s, "Fungal Scout", "human", "graveyard");
    const n = command(s, {
      actor: "human",
      type: "PLAY_CARD",
      cardId: id,
      targetId: victim,
    });
    expect(n.cards[victim]).toMatchObject({ zone: "hand", recovered: true });
    expect(
      n.events.some(
        (e) => e.type === "RETURNED_FROM_GRAVEYARD" && e.cardId === victim,
      ),
    ).toBe(true);
  });
  it("keeps equipment alive when its bearer dies and removes stat effects on destruction", () => {
    const { p, s } = fixture(),
      a = add(p, s, "Plasma Rifle", "human", "battlefield"),
      unit = add(p, s, "Fungal Scout", "human", "battlefield"),
      spell = add(p, s, "Spore Burst", "ai");
    let n = command(s, {
      actor: "human",
      type: "EQUIP_ARTIFACT",
      cardId: a,
      targetId: unit,
    });
    expect(stats(n, n.cards[unit]).attack).toBe(3);
    expect(n.players.human.energy).toBe(49);
    n.active = "ai";
    n = command(n, {
      actor: "ai",
      type: "PLAY_CARD",
      cardId: spell,
      targetId: unit,
    });
    expect(n.cards[unit].zone).toBe("graveyard");
    expect(n.cards[a].zone).toBe("battlefield");
    expect(n.cards[a].attachedTo).toBeUndefined();
  });
  it("handles death tokens without minting economic instances", () => {
    const { p, s } = fixture(),
      unit = add(p, s, "Spore Mother", "ai", "battlefield"),
      spell = add(p, s, "Plasma Blast");
    const count = p.serial;
    const n = command(s, {
      actor: "human",
      type: "PLAY_CARD",
      cardId: spell,
      targetId: unit,
    });
    expect(Object.values(n.cards).filter((c) => c.token)).toHaveLength(2);
    expect(p.serial).toBe(count);
  });
  it("requires a legal target for upkeep gun damage", () => {
    const { p, s } = fixture(),
      gun = add(p, s, "Nightmare Gun", "human", "battlefield"),
      unit = add(p, s, "Fungal Scout", "human", "battlefield");
    s.cards[gun].attachedTo = unit;
    s.active = "ai";
    s.phase = "END";
    let n = command(s, { actor: "ai", type: "PASS_PHASE" });
    expect(n.pending[0].sourceId).toBe(gun);
    expect(execute(n, { actor: "human", type: "PASS_PHASE" }).error).toContain(
      "target",
    );
    n = command(n, { actor: "human", type: "SELECT_TARGET", targetId: "ai" });
    expect(n.players.ai.life).toBe(19);
  });
  it("keeps accumulated energy, adds regeneration, and expires temporary energy", () => {
    const { p, s } = fixture();
    add(p, s, "Battery Array", "human", "battlefield");
    const spell = add(p, s, "Energy Infusion");
    let n = command(s, { actor: "human", type: "PLAY_CARD", cardId: spell });
    expect(n.players.human.energy).toBe(51);
    n.phase = "END";
    for (const c of zone(n, "human", "hand").slice(7)) c.zone = "deck";
    n = command(n, { actor: "human", type: "PASS_PHASE" });
    expect(n.players.human.energy).toBe(49);
    n.phase = "END";
    n = command(n, { actor: "ai", type: "PASS_PHASE" });
    expect(n.players.human.energy).toBe(51);
  });
  it("requires hand-limit discards and makes them vulnerable at settlement", () => {
    const { p, s } = fixture();
    const id = add(p, s, "Fungal Scout");
    s.phase = "END";
    expect(execute(s, { actor: "human", type: "PASS_PHASE" }).error).toContain(
      "Discard",
    );
    const n = command(s, { actor: "human", type: "DISCARD", cardId: id });
    expect(n.cards[id].zone).toBe("graveyard");
  });
});
describe("settlement and provenance", () => {
  it.each([
    ["Fungal Scout", "DEAD"],
    ["Data Surge", "CONSUMED"],
    ["Plasma Rifle", "DESTROYED"],
    ["Battery Array", "DESTROYED"],
  ])("permanently marks %s as %s only at settlement", (name, status) => {
    const { p, s } = fixture(),
      id = add(p, s, name, "human", "graveyard");
    expect(p.instances[id].lifecycleStatus).toBe("ALIVE");
    finish(p, s);
    const n = settle(p, undefined, now);
    expect(n.instances[id].lifecycleStatus).toBe(status);
    expect(p.instances[id].lifecycleStatus).toBe("ALIVE");
    expect(n.instances[id].history.at(-1)?.type).toBe(status);
    expect(() => settle(n)).toThrow();
  });
  it("keeps a recovered creature alive at settlement", () => {
    const { p, s } = fixture(),
      spell = add(p, s, "Regrowth"),
      unit = add(p, s, "Fungal Scout", "human", "graveyard");
    const n = command(s, {
      actor: "human",
      type: "PLAY_CARD",
      cardId: spell,
      targetId: unit,
    });
    finish(p, n);
    const result = settle(p, undefined, now);
    expect(result.instances[unit].lifecycleStatus).toBe("ALIVE");
    expect(result.instances[unit].history.map((e) => e.type)).toContain(
      "RETURNED_FROM_GRAVEYARD",
    );
    expect(result.matches[0].recovered).toContain(unit);
    expect(result.instances[spell].lifecycleStatus).toBe("CONSUMED");
  });
  it("preserves undeployed cards and surviving artifacts", () => {
    const { p, s } = fixture(),
      a = add(p, s, "Plasma Rifle", "human", "battlefield");
    finish(p, s);
    const n = settle(p, undefined, now);
    expect(n.instances[a].lifecycleStatus).toBe("ALIVE");
    expect(n.instances[a].history.at(-1)?.type).toBe("SURVIVED_MATCH");
  });
  it("only offers surviving deployed losing artifacts", () => {
    const { p, s } = fixture(),
      eligible = add(p, s, "Plasma Rifle", "ai", "battlefield"),
      hidden = add(p, s, "Plasma Rifle", "ai"),
      dead = add(p, s, "Plasma Rifle", "ai", "graveyard");
    s.cards[dead].deployed = true;
    finish(p, s);
    expect(singleDeployedArtifact.eligible(s)).toEqual([eligible]);
    expect(singleDeployedArtifact.eligible(s)).not.toContain(hidden);
    expect(() => settle(p, hidden)).toThrow("Ineligible");
  });
  it("transfers one artifact and appends correct capture provenance", () => {
    const { p, s } = fixture(),
      id = add(p, s, "Plasma Rifle", "ai", "battlefield");
    finish(p, s);
    const n = settle(p, id, now),
      c = n.instances[id];
    expect(c.currentOwnerId).toBe("human");
    expect(c.originalOwnerId).toBe("ai");
    expect(c.lifecycleStatus).toBe("ALIVE");
    expect(c.history.find((e) => e.type === "ARTIFACT_CAPTURED")).toMatchObject(
      { previousOwner: "ai", newOwner: "human", matchId: s.matchId },
    );
    expect(c.history.at(-1)?.type).toBe("TRANSFERRED");
    expect(deserialize(JSON.stringify(n)).instances[id]).toEqual(c);
  });
  it("AI chooses loot deterministically and prevents reseeding during a match", () => {
    const { p, s } = fixture();
    add(p, s, "Plasma Rifle", "human", "battlefield");
    add(p, s, "Energy Blade", "human", "battlefield");
    finish(p, s, "ai");
    expect(() => seedAI(p)).toThrow("Settle");
    const n = settle(p);
    expect(n.matches[0].captured).toBe(singleDeployedArtifact.eligible(s)[0]);
    expect(n.instances[n.matches[0].captured!].currentOwnerId).toBe("ai");
  });
  it("rejects settlement of active matches and ownership changes under an active match", () => {
    const { p, s } = fixture();
    p.activeMatch = s;
    expect(() => settle(p)).toThrow("Finish");
    finish(p, s);
    p.instances[Object.keys(s.cards)[0]].lifecycleStatus = "DEAD";
    expect(() => settle(p)).toThrow("locked");
  });
});
describe("complete command-driven games", () => {
  it.each([1, 17, 412, 999])(
    "finishes, settles, reloads and rebuilds honestly with seed %s",
    (seed) => {
      const p = collection();
      let s = createMatch(
        p,
        autoBuild(p, "human", undefined, seed),
        autoBuild(p, "ai", undefined, seed + 1),
        seed,
        `match-${seed}`,
        now,
      );
      const initial = structuredClone(s);
      let steps = 0;
      while (s.status === "ACTIVE" && steps++ < 1600) {
        const c = aiController.choose(s);
        const result = execute(s, c);
        expect(result.error, JSON.stringify(c)).toBeUndefined();
        s = result.state;
      }
      expect(s.status).toBe("FINISHED");
      expect(steps).toBeLessThan(1600);
      let replay = initial;
      for (const c of s.commands) replay = command(replay, c);
      expect(replay).toEqual(s);
      p.activeMatch = s;
      const before = JSON.stringify(p.instances);
      const preview = settlementPreview(s);
      expect(JSON.stringify(p.instances)).toBe(before);
      const result = settle(p, preview.eligible[0], now);
      expect(result.matches).toHaveLength(1);
      expect(result.activeMatch).toBeUndefined();
      expect(result.matches[0].losses.length).toBeGreaterThan(0);
      expect(deserialize(JSON.stringify(result))).toEqual(result);
      expect(deckErrors(result, autoBuild(result, "human"), "human")).toEqual(
        [],
      );
    },
  );
});
