import { cards } from "../data/cards";
import { RULES } from "../data/config";
import { deckErrors } from "../economy/collection";
import { SeededRng } from "./rng";
import {
  other,
  type Owner,
  type Profile,
  type GameState,
  type GameCommand,
  type MatchCard,
  type Effect,
  type PendingEffect,
} from "./model";
export const definition = (c: MatchCard) => cards[c.definitionId];
export const zone = (s: GameState, o: Owner, z: string) =>
  Object.values(s.cards).filter((c) => c.owner === o && c.zone === z);
export const creatures = (s: GameState, o: Owner) =>
  zone(s, o, "battlefield").filter(
    (c) => definition(c).cardType === "CREATURE",
  );
export function actor(s: GameState): Owner {
  return (
    s.pending[0]?.owner ?? (s.phase === "BLOCK" ? other(s.active) : s.active)
  );
}
function event(
  s: GameState,
  type: string,
  details: string,
  cardId?: string,
  owner?: Owner,
  sourceId?: string,
) {
  s.events.push({
    type,
    details,
    cardId,
    owner,
    sourceId,
    sequence: s.events.length,
    timestamp: new Date(
      Date.parse(s.startedAt) + s.events.length,
    ).toISOString(),
  });
}
function hasNetwork(s: GameState, c: MatchCard): boolean {
  return (
    definition(c).effects.some((e) => e.type === "mycelium_network") ||
    zone(s, c.owner, "battlefield").some(
      (a) =>
        a.attachedTo === c.id &&
        definition(a).effects.some(
          (e) => e.type === "grant_ability" && e.value === "mycelium_network",
        ),
    )
  );
}
export function stats(
  s: GameState,
  c: MatchCard,
): { attack: number; health: number } {
  let attack = definition(c).attack + c.bonusAttack + c.temporaryAttack,
    health = definition(c).health + c.bonusHealth;
  const board = zone(s, c.owner, "battlefield");
  for (const a of board)
    for (const e of definition(a).effects) {
      if (e.trigger !== "constant") continue;
      const applies =
        a.attachedTo === c.id ||
        (e.target === "creatures_you_control_with_mycelium_network" &&
          hasNetwork(s, c));
      if (applies) {
        if (e.type === "gain_attack") attack += Number(e.value);
        if (e.type === "gain_defense") health += Number(e.value);
      }
    }
  if (
    hasNetwork(s, c) &&
    creatures(s, c.owner).some((a) => a.id !== c.id && hasNetwork(s, a))
  )
    health++;
  if (
    board.some(
      (a) => a.attachedTo === c.id && definition(a).cardType === "ARTIFACT",
    )
  )
    for (const e of definition(c).effects)
      if (e.type === "conditional_gain_attack") attack += Number(e.value);
  return { attack: Math.max(0, attack), health: health - c.damage };
}
export function cost(s: GameState, c: MatchCard): number {
  let n = definition(c).cost;
  if (definition(c).cardType === "ARTIFACT")
    for (const a of zone(s, c.owner, "battlefield"))
      for (const e of definition(a).effects)
        if (e.type === "equipment_cost_reduction") n -= Number(e.value);
  return Math.max(0, n);
}
function pay(s: GameState, o: Owner, n: number) {
  const p = s.players[o];
  if (p.energy < n) throw Error("Not enough energy.");
  p.energy -= n;
  p.temporaryEnergy = Math.max(0, p.temporaryEnergy - n);
}
function draw(s: GameState, o: Owner, n = 1) {
  for (let i = 0; i < n; i++) {
    const id = s.players[o].deck.shift();
    if (id) {
      s.cards[id].zone = "hand";
      event(s, "DRAWN", `${o} drew a card.`, id, o);
    } else {
      s.players[o].life -= ++s.players[o].fatigue;
      event(
        s,
        "FATIGUE",
        `${o} took ${s.players[o].fatigue} fatigue damage.`,
        undefined,
        o,
      );
    }
  }
}
function queue(s: GameState, c: MatchCard, trigger: string) {
  for (const e of definition(c).effects)
    if (e.trigger === trigger)
      s.pending.push({ sourceId: c.id, owner: c.owner, effect: e });
}
function grave(s: GameState, c: MatchCard, sourceId?: string) {
  const wasBoard = c.zone === "battlefield";
  c.zone = "graveyard";
  c.attachedTo = undefined;
  event(
    s,
    "DESTROYED_IN_MATCH",
    `${definition(c).name} entered the temporary graveyard.`,
    c.id,
    c.owner,
    sourceId,
  );
  for (const a of Object.values(s.cards))
    if (a.attachedTo === c.id) a.attachedTo = undefined;
  if (wasBoard && definition(c).cardType === "CREATURE")
    queue(s, c, "on_death");
}
function check(s: GameState) {
  let dead: MatchCard[];
  do {
    dead = Object.values(s.cards).filter(
      (c) =>
        c.zone === "battlefield" &&
        definition(c).cardType === "CREATURE" &&
        stats(s, c).health <= 0,
    );
    for (const c of dead) grave(s, c);
  } while (dead.length);
  const losers = (["human", "ai"] as const).filter(
    (o) => s.players[o].life <= 0,
  );
  if (losers.length) {
    s.status = "FINISHED";
    s.winner = losers.length === 2 ? other(s.active) : other(losers[0]);
    s.result =
      losers.length === 2
        ? "Simultaneous defeat: defending player wins the tie."
        : "Life reached zero.";
    s.pending = [];
    event(s, "MATCH_FINISHED", `${s.winner} wins. ${s.result}`);
  }
}
export function effectTargets(s: GameState, p: PendingEffect): string[] {
  const e = p.effect;
  const board = Object.values(s.cards).filter((c) => c.zone === "battlefield");
  if (e.type === "return_from_discard")
    return zone(s, p.owner, "graveyard")
      .filter((c) => !c.token && definition(c).cardType === "CREATURE")
      .map((c) => c.id);
  if (e.type === "destroy_equipment" || e.type === "destroy_enchantment")
    return board
      .filter(
        (c) =>
          definition(c).cardType ===
            (e.type === "destroy_equipment" ? "ARTIFACT" : "AUGMENTATION") &&
          (!e.target?.startsWith("enemy") || c.owner !== p.owner),
      )
      .map((c) => c.id);
  if (e.type === "deal_damage")
    return [
      ...board
        .filter(
          (c) =>
            definition(c).cardType === "CREATURE" &&
            (e.target !== "enemy_creature" || c.owner !== p.owner),
        )
        .map((c) => c.id),
      ...(e.target === "creature_or_player" ? ["human", "ai"] : []),
    ];
  return [];
}
function needsTarget(e: Effect) {
  return [
    "deal_damage",
    "destroy_equipment",
    "destroy_enchantment",
    "return_from_discard",
  ].includes(e.type);
}
function applyEffect(s: GameState, p: PendingEffect, targetId?: string) {
  const { effect: e, owner, sourceId } = p;
  const source = s.cards[sourceId];
  const n = Number(e.value ?? 0);
  const target = targetId ? s.cards[targetId] : undefined;
  switch (e.type) {
    case "draw_cards":
      draw(s, owner, n);
      break;
    case "increase_energy":
      s.players[owner].energy += n;
      if (e.duration) s.players[owner].temporaryEnergy += n;
      break;
    case "deal_damage":
      if (target) target.damage += n;
      else if (targetId === "human" || targetId === "ai")
        s.players[targetId].life -= n;
      break;
    case "destroy_equipment":
    case "destroy_enchantment":
      if (target) grave(s, target, sourceId);
      break;
    case "return_from_discard":
      if (target) {
        target.zone = "hand";
        target.damage = 0;
        target.bonusAttack = 0;
        target.bonusHealth = 0;
        target.temporaryAttack = 0;
        target.recovered = true;
        event(
          s,
          "RETURNED_FROM_GRAVEYARD",
          `${definition(target).name} returned to hand.`,
          target.id,
          owner,
          sourceId,
        );
      }
      break;
    case "summon_token":
      for (let i = 0; i < n; i++) {
        const id = `${s.matchId}:token:${s.events.length}:${i}`;
        s.cards[id] = {
          id,
          definitionId: "token:sporeling",
          owner,
          zone: "battlefield",
          tapped: true,
          sick: true,
          damage: 0,
          bonusAttack: 0,
          bonusHealth: 0,
          temporaryAttack: 0,
          deployed: true,
          recovered: false,
          token: true,
        };
        event(
          s,
          "TOKEN_CREATED",
          "A 1/1 Sporeling sprouted.",
          id,
          owner,
          sourceId,
        );
      }
      break;
    case "regenerate_health":
      if (source.attachedTo)
        s.cards[source.attachedTo].damage = Math.max(
          0,
          s.cards[source.attachedTo].damage - n,
        );
      break;
    case "gain_attack":
    case "gain_defense":
    case "lose_attack": {
      const affected =
        e.target === "all_enemy_creatures"
          ? creatures(s, other(owner))
          : e.target === "all_creatures_you_control"
            ? creatures(s, owner)
            : source.attachedTo
              ? [s.cards[source.attachedTo]]
              : [];
      for (const c of affected) {
        if (e.type === "gain_defense") c.bonusHealth += n;
        else if (e.duration)
          c.temporaryAttack += e.type === "lose_attack" ? -n : n;
        else c.bonusAttack += n;
      }
      break;
    }
  }
  event(
    s,
    "EFFECT",
    `${definition(source).name}: ${e.type}${targetId ? ` → ${target ? definition(target).name : targetId}` : ""}`,
    sourceId,
    owner,
    targetId,
  );
  check(s);
}
function drain(s: GameState) {
  while (s.pending.length && s.status === "ACTIVE") {
    const p = s.pending[0];
    if (needsTarget(p.effect)) {
      if (effectTargets(s, p).length) break;
      event(
        s,
        "EFFECT_SKIPPED",
        `${definition(s.cards[p.sourceId]).name}: no legal target.`,
        p.sourceId,
        p.owner,
      );
      s.pending.shift();
      continue;
    }
    s.pending.shift();
    applyEffect(s, p);
  }
}
function upkeep(s: GameState) {
  const o = s.active;
  let gain = RULES.energyPerUpkeep;
  for (const c of zone(s, o, "battlefield")) {
    c.tapped = false;
    c.sick = false;
    for (const e of definition(c).effects)
      if (e.type === "increase_energy_regen") gain += Number(e.value);
    if (definition(c).cardType !== "ARTIFACT" || c.attachedTo)
      queue(s, c, "on_upkeep");
  }
  s.pending = s.pending.filter(
    (p) => p.effect.type !== "increase_energy_regen",
  );
  s.players[o].energy += gain;
  event(s, "ENERGY", `${o} gained ${gain} energy.`, undefined, o);
  draw(s, o);
  check(s);
  drain(s);
}
export function createMatch(
  p: Profile,
  human: string[],
  ai: string[],
  seed: number,
  matchId: string = crypto.randomUUID(),
  startedAt = new Date().toISOString(),
): GameState {
  if (p.activeMatch)
    throw Error("A match already exists; finish and settle it first.");
  for (const [owner, ids] of [
    ["human", human],
    ["ai", ai],
  ] as const) {
    const errors = deckErrors(p, [...ids], owner);
    if (errors.length) throw Error(errors.join(" "));
  }
  const rng = new SeededRng(seed);
  const s: GameState = {
    matchId,
    seed,
    rngState: seed,
    startedAt,
    turn: 1,
    active: "human",
    phase: "UPKEEP",
    status: "ACTIVE",
    players: {
      human: {
        life: RULES.startingLife,
        energy: RULES.startingEnergy,
        temporaryEnergy: 0,
        fatigue: 0,
        deck: rng.shuffle(human),
      },
      ai: {
        life: RULES.startingLife,
        energy: RULES.startingEnergy,
        temporaryEnergy: 0,
        fatigue: 0,
        deck: rng.shuffle(ai),
      },
    },
    cards: {},
    attackers: [],
    pending: [],
    events: [],
    commands: [],
  };
  s.rngState = rng.state;
  for (const owner of ["human", "ai"] as const) {
    for (const id of s.players[owner].deck) {
      s.cards[id] = {
        id,
        definitionId: p.instances[id].definitionId,
        owner,
        zone: "deck",
        tapped: false,
        sick: true,
        damage: 0,
        bonusAttack: 0,
        bonusHealth: 0,
        temporaryAttack: 0,
        deployed: false,
        recovered: false,
      };
      event(
        s,
        "MATCH_ENTERED",
        `Entered match against ${other(owner)}.`,
        id,
        owner,
      );
    }
    draw(s, owner, RULES.openingHand);
  }
  upkeep(s);
  return s;
}
export const availableAttackers = (s: GameState) =>
  creatures(s, s.active)
    .filter((c) => !c.tapped && !c.sick)
    .map((c) => c.id);
export const availableBlockers = (s: GameState) =>
  creatures(s, other(s.active))
    .filter((c) => !c.tapped)
    .map((c) => c.id);
export function playTargets(s: GameState, c: MatchCard): string[] {
  const d = definition(c);
  if (
    d.cardType === "AUGMENTATION" &&
    d.effects.some((e) => e.target === "enchanted_creature")
  )
    return creatures(s, c.owner).map((c) => c.id);
  const e = d.effects.find(
    (e) =>
      (e.trigger === "on_cast" || e.trigger === "on_summon") && needsTarget(e),
  );
  return e
    ? effectTargets(s, { sourceId: c.id, owner: c.owner, effect: e })
    : [];
}
export function requiresPlayTarget(c: MatchCard): boolean {
  return (
    (definition(c).cardType === "AUGMENTATION" &&
      definition(c).effects.some((e) => e.target === "enchanted_creature")) ||
    (definition(c).cardType === "SPELL" &&
      definition(c).effects.some(
        (e) => e.trigger === "on_cast" && needsTarget(e),
      ))
  );
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}
/** Transactional reducer: invalid commands return the original state; caller state is never mutated. */
export function execute(
  state: GameState,
  command: GameCommand,
): { state: GameState; error?: string } {
  try {
    const s = structuredClone(state);
    assert(s.status === "ACTIVE", "Match is finished.");
    assert(command.actor === actor(s), "Wait for your priority.");
    const o = command.actor;
    if (command.type === "CONCEDE") {
      s.status = "FINISHED";
      s.winner = other(o);
      s.result = `${o} conceded.`;
      s.pending = [];
      event(s, "MATCH_FINISHED", s.result);
    } else if (s.pending.length) {
      assert(command.type === "SELECT_TARGET", "Select a legal target first.");
      const p = s.pending[0];
      assert(effectTargets(s, p).includes(command.targetId), "Illegal target.");
      s.pending.shift();
      applyEffect(s, p, command.targetId);
      drain(s);
    } else
      switch (command.type) {
        case "PLAY_CARD": {
          assert(
            s.phase === "MAIN" || s.phase === "MAIN2",
            "Play cards during a main phase.",
          );
          const c = s.cards[command.cardId];
          assert(
            c && c.owner === o && c.zone === "hand",
            "Card is not in your hand.",
          );
          const d = definition(c),
            targets = playTargets(s, c);
          if (requiresPlayTarget(c))
            assert(
              command.targetId && targets.includes(command.targetId),
              "Choose a legal target.",
            );
          if (command.targetId)
            assert(targets.includes(command.targetId), "Illegal target.");
          pay(s, o, cost(s, c));
          c.zone = d.cardType === "SPELL" ? "graveyard" : "battlefield";
          c.deployed = true;
          c.sick = true;
          c.tapped = d.cardType === "CREATURE";
          if (d.cardType === "AUGMENTATION") c.attachedTo = command.targetId;
          event(s, "PLAYED", `${o} played ${d.name}.`, c.id, o);
          if (d.cardType === "SPELL")
            event(
              s,
              "SPELL_TO_GRAVEYARD",
              `${d.name} entered the temporary graveyard.`,
              c.id,
              o,
            );
          queue(s, c, d.cardType === "SPELL" ? "on_cast" : "on_summon");
          if (d.cardType === "ARTIFACT")
            for (const a of zone(s, o, "battlefield"))
              queue(s, a, "on_play_equipment");
          if (
            command.targetId &&
            s.pending[0]?.sourceId === c.id &&
            needsTarget(s.pending[0].effect)
          ) {
            const p = s.pending.shift()!;
            applyEffect(s, p, command.targetId);
          }
          drain(s);
          break;
        }
        case "EQUIP_ARTIFACT": {
          assert(
            s.phase === "MAIN" || s.phase === "MAIN2",
            "Equip during a main phase.",
          );
          const c = s.cards[command.cardId],
            t = s.cards[command.targetId];
          assert(
            c &&
              c.owner === o &&
              c.zone === "battlefield" &&
              definition(c).cardType === "ARTIFACT",
            "Choose your deployed artifact.",
          );
          assert(
            t &&
              t.owner === o &&
              t.zone === "battlefield" &&
              definition(t).cardType === "CREATURE",
            "Choose your creature.",
          );
          assert(c.attachedTo !== t.id, "Already attached.");
          pay(s, o, RULES.equipCost);
          c.attachedTo = t.id;
          event(
            s,
            "EQUIPPED",
            `${definition(c).name} attached to ${definition(t).name}.`,
            c.id,
            o,
            t.id,
          );
          check(s);
          drain(s);
          break;
        }
        case "DECLARE_ATTACKERS": {
          assert(s.phase === "ATTACK", "Not the attack phase.");
          assert(
            new Set(command.cardIds).size === command.cardIds.length,
            "Duplicate attacker.",
          );
          assert(
            command.cardIds.every((id) => availableAttackers(s).includes(id)),
            "Illegal attacker (tapped or summoning sick).",
          );
          s.attackers = [...command.cardIds];
          for (const id of s.attackers) {
            s.cards[id].tapped = true;
            for (const a of zone(s, o, "battlefield"))
              for (const e of definition(a).effects)
                if (e.trigger === "on_attack" && e.type === "gain_attack")
                  s.cards[id].temporaryAttack += Number(e.value);
            event(
              s,
              "ATTACKED",
              `${definition(s.cards[id]).name} attacks.`,
              id,
              o,
            );
          }
          s.phase = s.attackers.length ? "BLOCK" : "MAIN2";
          break;
        }
        case "DECLARE_BLOCKERS": {
          assert(s.phase === "BLOCK", "Not the blocking phase.");
          const assignments = Object.entries(command.assignments);
          assert(
            new Set(Object.values(command.assignments)).size ===
              assignments.length,
            "A blocker can block only once.",
          );
          assert(
            assignments.every(
              ([a, b]) =>
                s.attackers.includes(a) && availableBlockers(s).includes(b),
            ),
            "Illegal blocker assignment.",
          );
          const damage = s.attackers.map((id) => {
            const a = s.cards[id],
              b = s.cards[command.assignments[id]];
            return {
              a,
              b,
              ad: stats(s, a).attack,
              bd: b ? stats(s, b).attack : 0,
            };
          });
          for (const { a, b, ad, bd } of damage) {
            if (b) {
              a.damage += bd;
              b.damage += ad;
              event(
                s,
                "COMBAT",
                `${definition(a).name} and ${definition(b).name} trade ${ad}/${bd} damage.`,
                a.id,
                a.owner,
                b.id,
              );
            } else {
              s.players[o].life -= ad;
              event(
                s,
                "COMBAT",
                `${definition(a).name} deals ${ad} to ${o}.`,
                a.id,
                a.owner,
              );
            }
          }
          s.attackers = [];
          s.phase = "MAIN2";
          check(s);
          drain(s);
          break;
        }
        case "DISCARD": {
          assert(
            s.phase === "END" && zone(s, o, "hand").length > RULES.maxHand,
            "Discard only to meet the end-turn hand limit.",
          );
          const c = s.cards[command.cardId];
          assert(
            c && c.owner === o && c.zone === "hand",
            "Choose a card in your hand.",
          );
          grave(s, c);
          event(s, "DISCARDED", `${definition(c).name} discarded.`, c.id, o);
          break;
        }
        case "END_TURN":
          assert(
            s.phase === "MAIN2" || s.phase === "END",
            "Finish combat first.",
          );
          s.phase = "END";
          if (zone(s, o, "hand").length > RULES.maxHand) break;
          finishTurn(s);
          break;
        case "PASS_PHASE":
          switch (s.phase) {
            case "UPKEEP":
              s.phase = "MAIN";
              break;
            case "MAIN":
              s.phase = "ATTACK";
              break;
            case "ATTACK":
              s.phase = "MAIN2";
              break;
            case "BLOCK":
              throw Error("Confirm blockers, including an empty selection.");
            case "MAIN2":
              s.phase = "END";
              break;
            case "END":
              assert(
                zone(s, o, "hand").length <= RULES.maxHand,
                "Discard down to seven cards.",
              );
              finishTurn(s);
              break;
          }
          break;
        default:
          throw Error("Unsupported command in this phase.");
      }
    s.commands.push(structuredClone(command));
    check(s);
    event(s, "COMMAND", `${command.actor}: ${command.type} → ${s.phase}`);
    return { state: s };
  } catch (e) {
    return { state, error: e instanceof Error ? e.message : "Invalid command" };
  }
}
function finishTurn(s: GameState) {
  for (const c of Object.values(s.cards)) c.temporaryAttack = 0;
  const p = s.players[s.active];
  p.energy -= p.temporaryEnergy;
  p.temporaryEnergy = 0;
  s.active = other(s.active);
  s.turn++;
  s.phase = "UPKEEP";
  upkeep(s);
}
