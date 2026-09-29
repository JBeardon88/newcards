import { cards } from "../data/cards";
import {
  other,
  type GameState,
  type Profile,
  type Lifecycle,
  type MatchSummary,
} from "../engine/model";
export interface LootPolicy {
  eligible(game: GameState): string[];
}
export const singleDeployedArtifact: LootPolicy = {
  eligible(s) {
    if (!s.winner) return [];
    return Object.values(s.cards)
      .filter(
        (c) =>
          !c.token &&
          c.owner === other(s.winner!) &&
          c.deployed &&
          c.zone !== "graveyard" &&
          cards[c.definitionId].cardType === "ARTIFACT",
      )
      .map((c) => c.id)
      .sort();
  },
};
export const terminalStatus = (definitionId: string): Lifecycle =>
  cards[definitionId].cardType === "CREATURE"
    ? "DEAD"
    : cards[definitionId].cardType === "SPELL"
      ? "CONSUMED"
      : "DESTROYED";
export function settlementPreview(s: GameState) {
  const real = Object.values(s.cards).filter((c) => !c.token);
  return {
    losses: real.filter((c) => c.zone === "graveyard").map((c) => c.id),
    survivors: real.filter((c) => c.zone !== "graveyard").map((c) => c.id),
    recovered: real
      .filter((c) => c.recovered && c.zone !== "graveyard")
      .map((c) => c.id),
    deployed: real
      .filter((c) => c.deployed && c.zone !== "graveyard")
      .map((c) => c.id),
    eligible: singleDeployedArtifact.eligible(s),
  };
}
/** Returns one complete new profile so persistence can atomically commit all consequences. */
export function settle(
  profile: Profile,
  lootId?: string,
  now = new Date().toISOString(),
): Profile {
  const s = profile.activeMatch;
  if (!s || s.status !== "FINISHED" || !s.winner)
    throw Error("Finish the match before settlement.");
  if (profile.matches.some((m) => m.matchId === s.matchId))
    throw Error("Match was already settled.");
  const preview = settlementPreview(s);
  const chosen = s.winner === "ai" ? preview.eligible[0] : lootId;
  if (chosen && !preview.eligible.includes(chosen))
    throw Error("Ineligible artifact loot.");
  const p = structuredClone(profile);
  for (const c of Object.values(s.cards)) {
    if (c.token) continue;
    const instance = p.instances[c.id];
    if (
      !instance ||
      instance.currentOwnerId !== c.owner ||
      instance.lifecycleStatus !== "ALIVE"
    )
      throw Error("Collection changed while the match was locked.");
    for (const e of s.events.filter(
      (e) =>
        e.cardId === c.id &&
        [
          "MATCH_ENTERED",
          "PLAYED",
          "EQUIPPED",
          "RETURNED_FROM_GRAVEYARD",
          "DESTROYED_IN_MATCH",
          "DISCARDED",
        ].includes(e.type),
    ))
      instance.history.push({
        type: e.type,
        timestamp: e.timestamp,
        matchId: s.matchId,
        owner: c.owner,
        opponent: other(c.owner),
        sourceId: e.sourceId,
        details: e.details,
      });
    if (c.zone === "graveyard") {
      instance.lifecycleStatus = terminalStatus(c.definitionId);
      instance.history.push({
        type: instance.lifecycleStatus,
        timestamp: now,
        matchId: s.matchId,
        owner: c.owner,
        details: "Still in graveyard at settlement; permanently unusable.",
      });
    } else
      instance.history.push({
        type: "SURVIVED_MATCH",
        timestamp: now,
        matchId: s.matchId,
        owner: c.owner,
        details: c.recovered
          ? "Recovered from the graveyard and survived."
          : "Returned to usable collection.",
      });
  }
  if (chosen) {
    const c = p.instances[chosen],
      previous = c.currentOwnerId;
    c.currentOwnerId = s.winner;
    for (const type of ["ARTIFACT_CAPTURED", "TRANSFERRED"])
      c.history.push({
        type,
        timestamp: now,
        matchId: s.matchId,
        owner: s.winner,
        previousOwner: previous,
        newOwner: s.winner,
        details: `Captured from ${previous} by ${s.winner}.`,
      });
  }
  const summary: MatchSummary = {
    matchId: s.matchId,
    winner: s.winner,
    result: s.result ?? "Completed",
    settledAt: now,
    seed: s.seed,
    ...preview,
    captured: chosen,
    game: structuredClone(s),
  };
  p.matches.push(summary);
  p.activeMatch = undefined;
  return p;
}
