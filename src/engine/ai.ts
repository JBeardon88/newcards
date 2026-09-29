import type { GameCommand, GameState } from "./model";
import {
  actor,
  availableAttackers,
  availableBlockers,
  cost,
  creatures,
  definition,
  effectTargets,
  execute,
  playTargets,
  requiresPlayTarget,
  stats,
  zone,
} from "./rules";
export interface DecisionSource {
  choose(state: GameState): GameCommand;
}
/** Reads state, returns commands. Never mutates authoritative state or looks at opposing hands. */
export const aiController: DecisionSource = {
  choose(s) {
    const o = actor(s);
    const command = (c: Omit<GameCommand, "actor">) =>
      ({ ...c, actor: o }) as GameCommand;
    if (s.pending.length) {
      const targets = effectTargets(s, s.pending[0]);
      const target =
        targets.find(
          (id) =>
            id !== o &&
            (id === "human" || id === "ai" || s.cards[id].owner !== o),
        ) ?? targets[0];
      return { actor: o, type: "SELECT_TARGET", targetId: target };
    }
    if (s.phase === "MAIN" || s.phase === "MAIN2") {
      const hand = zone(s, o, "hand").sort((a, b) => {
        const rank = (c: typeof a) =>
          definition(c).cardType === "CREATURE"
            ? 0
            : definition(c).cardType === "ARTIFACT"
              ? 1
              : 2;
        return (
          rank(a) - rank(b) ||
          cost(s, a) - cost(s, b) ||
          a.id.localeCompare(b.id)
        );
      });
      for (const c of hand) {
        const targets = playTargets(s, c);
        if (
          cost(s, c) > s.players[o].energy ||
          (requiresPlayTarget(c) && !targets.length)
        )
          continue;
        const target =
          targets.find(
            (id) =>
              id !== o &&
              (id === "human" || id === "ai" || s.cards[id].owner !== o),
          ) ?? targets[0];
        const cmd: GameCommand = {
          actor: o,
          type: "PLAY_CARD",
          cardId: c.id,
          ...(target ? { targetId: target } : {}),
        };
        if (!execute(s, cmd).error) return cmd;
      }
      const artifact = zone(s, o, "battlefield").find(
        (c) => definition(c).cardType === "ARTIFACT" && !c.attachedTo,
      );
      const unit = creatures(s, o).sort(
        (a, b) => stats(s, b).attack - stats(s, a).attack,
      )[0];
      if (artifact && unit && s.players[o].energy >= 1)
        return {
          actor: o,
          type: "EQUIP_ARTIFACT",
          cardId: artifact.id,
          targetId: unit.id,
        };
    }
    if (s.phase === "ATTACK")
      return {
        actor: o,
        type: "DECLARE_ATTACKERS",
        cardIds: availableAttackers(s).filter(
          (id) => stats(s, s.cards[id]).attack > 0,
        ),
      };
    if (s.phase === "BLOCK") {
      const available = availableBlockers(s);
      const assignments: Record<string, string> = {};
      for (const a of s.attackers) {
        const idx = available.findIndex(
          (id) =>
            stats(s, s.cards[id]).health > stats(s, s.cards[a]).attack ||
            stats(s, s.cards[id]).attack >= stats(s, s.cards[a]).health ||
            s.players[o].life <= stats(s, s.cards[a]).attack + 3,
        );
        if (idx >= 0) assignments[a] = available.splice(idx, 1)[0];
      }
      return { actor: o, type: "DECLARE_BLOCKERS", assignments };
    }
    if (s.phase === "END" && zone(s, o, "hand").length > 7)
      return {
        actor: o,
        type: "DISCARD",
        cardId: zone(s, o, "hand").at(-1)!.id,
      };
    return command({ type: "PASS_PHASE" });
  },
};
