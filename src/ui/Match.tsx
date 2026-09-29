import { useState } from "react";
import type {
  GameCommand,
  GameState,
  Profile,
  MatchCard,
} from "../engine/model";
import {
  actor,
  availableAttackers,
  availableBlockers,
  creatures,
  definition,
  effectTargets,
  playTargets,
  requiresPlayTarget,
  zone,
  cost,
} from "../engine/rules";
import { Card } from "./Card";
export function Match({
  profile,
  send,
  inspect,
}: {
  profile: Profile;
  send: (c: GameCommand) => void;
  inspect: (id: string) => void;
}) {
  const s = profile.activeMatch!;
  const [selected, setSelected] = useState<string>();
  const [attackers, setAttackers] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<Record<string, string>>({});
  const [equip, setEquip] = useState<string>();
  const [target, setTarget] = useState("");
  const mine = actor(s) === "human";
  const main =
    mine && !s.pending.length && (s.phase === "MAIN" || s.phase === "MAIN2");
  const choice = selected ? s.cards[selected] : undefined;
  const options = choice ? playTargets(s, choice) : [];
  const name = (id: string) =>
    s.cards[id]
      ? `${definition(s.cards[id]).name} #${profile.instances[id]?.serialNumber ?? "token"}`
      : profile.wallets[id as "human" | "ai"].name;
  const submit = (c: GameCommand) => {
    send(c);
    setSelected(undefined);
    setTarget("");
    setEquip(undefined);
  };
  const render = (
    c: MatchCard,
    onClick = () => inspect(c.id),
    chosen = false,
  ) => (
    <Card
      key={c.id}
      instance={profile.instances[c.id]}
      matchCard={c}
      game={s}
      onClick={onClick}
      selected={chosen}
    />
  );
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            MATCH {s.matchId.slice(0, 8)} · SEED {s.seed}
          </span>
          <h1>Risk makes history.</h1>
        </div>
        <div className="phase">
          Turn {s.turn} · {s.phase}
          <small>{mine ? "Your decision" : "The Custodian is thinking…"}</small>
        </div>
      </div>
      <div className="notice">
        Damage stays on creatures between turns. Newly summoned creatures enter
        tapped. Artifacts cost 1 energy to attach. Cards in the graveyard are
        recoverable until settlement.
      </div>
      {(["ai", "human"] as const).map((o) => (
        <section className={`arena ${o}`} key={o}>
          <div className="player-bar">
            <h2>{profile.wallets[o].name}</h2>
            <b>♥ {s.players[o].life}</b>
            <b>ϟ {s.players[o].energy}</b>
            <span>
              Deck {s.players[o].deck.length} · Hand {zone(s, o, "hand").length}{" "}
              · Graveyard {zone(s, o, "graveyard").length}
            </span>
          </div>
          <h3>Creatures</h3>
          <div className="card-row">
            {creatures(s, o).map((c) =>
              render(
                c,
                () => {
                  if (
                    o === "human" &&
                    mine &&
                    s.phase === "ATTACK" &&
                    availableAttackers(s).includes(c.id)
                  )
                    setAttackers((a) =>
                      a.includes(c.id)
                        ? a.filter((id) => id !== c.id)
                        : [...a, c.id],
                    );
                  else inspect(c.id);
                },
                attackers.includes(c.id),
              ),
            )}
            {!creatures(s, o).length && (
              <p className="empty">No creatures deployed</p>
            )}
          </div>
          <div className="environs">
            {(["ARTIFACT", "AUGMENTATION"] as const).map((type) => (
              <div key={type}>
                <h3>{type === "ARTIFACT" ? "Artifacts" : "Augmentations"}</h3>
                <div className="card-row">
                  {zone(s, o, "battlefield")
                    .filter((c) => definition(c).cardType === type)
                    .map((c) =>
                      render(
                        c,
                        () => {
                          if (main && o === "human" && type === "ARTIFACT") {
                            setEquip(c.id);
                            setSelected(undefined);
                            setTarget("");
                          } else inspect(c.id);
                        },
                        equip === c.id,
                      ),
                    )}
                </div>
              </div>
            ))}
          </div>
          <details>
            <summary>
              Temporary graveyard ({zone(s, o, "graveyard").length})
            </summary>
            <div className="card-row">
              {zone(s, o, "graveyard").map((c) => render(c))}
            </div>
          </details>
        </section>
      ))}
      <div className="decision-panel" aria-live="polite">
        {mine && s.pending.length > 0 ? (
          <>
            <h2>Choose a target for {name(s.pending[0].sourceId)}</h2>
            <p>{s.pending[0].effect.type}</p>
            <div className="actions">
              {effectTargets(s, s.pending[0]).map((id) => (
                <button
                  key={id}
                  onClick={() =>
                    submit({
                      actor: "human",
                      type: "SELECT_TARGET",
                      targetId: id,
                    })
                  }
                >
                  {name(id)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {mine && s.phase === "ATTACK" && (
              <>
                <h2>Declare attackers</h2>
                <p>
                  Click your untapped, ready creatures above. Selected cards
                  have a gold border.
                </p>
                <button
                  onClick={() => {
                    submit({
                      actor: "human",
                      type: "DECLARE_ATTACKERS",
                      cardIds: attackers.filter((id) =>
                        availableAttackers(s).includes(id),
                      ),
                    });
                    setAttackers([]);
                  }}
                >
                  Attack with {attackers.length} selected
                </button>
                <button
                  onClick={() => {
                    submit({
                      actor: "human",
                      type: "DECLARE_ATTACKERS",
                      cardIds: availableAttackers(s),
                    });
                    setAttackers([]);
                  }}
                >
                  Attack with all ready creatures
                </button>
              </>
            )}
            {mine && s.phase === "BLOCK" && (
              <>
                <h2>Assign blockers</h2>
                <p>
                  Each creature may block one attacker. Unblocked attackers
                  damage your life.
                </p>
                {s.attackers.map((id) => (
                  <label className="block-assignment" key={id}>
                    {name(id)}
                    <select
                      value={blocks[id] ?? ""}
                      onChange={(e) =>
                        setBlocks((b) => {
                          const next = { ...b };
                          if (e.target.value) next[id] = e.target.value;
                          else delete next[id];
                          return next;
                        })
                      }
                    >
                      <option value="">Do not block</option>
                      {availableBlockers(s).map((b) => (
                        <option
                          key={b}
                          value={b}
                          disabled={Object.entries(blocks).some(
                            ([a, v]) => a !== id && v === b,
                          )}
                        >
                          {name(b)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <button
                  onClick={() => {
                    submit({
                      actor: "human",
                      type: "DECLARE_BLOCKERS",
                      assignments: Object.fromEntries(
                        Object.entries(blocks).filter(([id]) =>
                          s.attackers.includes(id),
                        ),
                      ),
                    });
                    setBlocks({});
                  }}
                >
                  Resolve combat
                </button>
              </>
            )}
            {main && choice && (
              <>
                <h2>
                  Play {definition(choice).name} · {cost(s, choice)} energy
                </h2>
                {options.length > 0 && (
                  <label>
                    Target
                    <select
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">Choose target</option>
                      {options.map((id) => (
                        <option key={id} value={id}>
                          {name(id)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {requiresPlayTarget(choice) && !options.length && (
                  <p>No legal targets available.</p>
                )}
                <button
                  disabled={
                    s.players.human.energy < cost(s, choice) ||
                    (requiresPlayTarget(choice) && !target)
                  }
                  onClick={() =>
                    submit({
                      actor: "human",
                      type: "PLAY_CARD",
                      cardId: choice.id,
                      ...(target ? { targetId: target } : {}),
                    })
                  }
                >
                  Confirm play
                </button>
                <button
                  className="secondary"
                  onClick={() => setSelected(undefined)}
                >
                  Cancel
                </button>
              </>
            )}
            {main && equip && (
              <>
                <h2>Attach {name(equip)} · 1 energy</h2>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">Choose your creature</option>
                  {creatures(s, "human").map((c) => (
                    <option key={c.id} value={c.id}>
                      {name(c.id)}
                    </option>
                  ))}
                </select>
                <button
                  disabled={!target || s.players.human.energy < 1}
                  onClick={() =>
                    submit({
                      actor: "human",
                      type: "EQUIP_ARTIFACT",
                      cardId: equip,
                      targetId: target,
                    })
                  }
                >
                  Attach artifact
                </button>
              </>
            )}
            {mine &&
              s.phase === "END" &&
              zone(s, "human", "hand").length > 7 && (
                <p>
                  Discard {zone(s, "human", "hand").length - 7} card(s): click
                  cards in your hand. Discarded cards risk permanent loss at
                  settlement.
                </p>
              )}
            {mine && s.phase !== "BLOCK" && (
              <button
                className="secondary"
                disabled={
                  s.phase === "END" && zone(s, "human", "hand").length > 7
                }
                onClick={() => submit({ actor: "human", type: "PASS_PHASE" })}
              >
                {s.phase === "END"
                  ? "End turn"
                  : s.phase === "ATTACK"
                    ? "Skip attack"
                    : "Continue phase →"}
              </button>
            )}
          </>
        )}
      </div>
      <section>
        <h2>
          Your hand <small>{zone(s, "human", "hand").length} cards</small>
        </h2>
        <div className="card-row">
          {zone(s, "human", "hand").map((c) =>
            render(
              c,
              () => {
                if (
                  mine &&
                  s.phase === "END" &&
                  !s.pending.length &&
                  zone(s, "human", "hand").length > 7
                )
                  submit({ actor: "human", type: "DISCARD", cardId: c.id });
                else if (main) {
                  setSelected(c.id);
                  setEquip(undefined);
                  setTarget("");
                } else inspect(c.id);
              },
              selected === c.id,
            ),
          )}
        </div>
      </section>
      <details open>
        <summary>Recent match events</summary>
        <ol className="game-log">
          {s.events
            .slice(-16)
            .reverse()
            .map((e) => (
              <li key={e.sequence}>{e.details}</li>
            ))}
        </ol>
      </details>
      {mine && (
        <button
          className="danger"
          onClick={() => {
            if (
              confirm(
                "Concede this match? Cards in your graveyard will still be lost at settlement, and the AI may capture an artifact.",
              )
            )
              submit({ actor: "human", type: "CONCEDE" });
          }}
        >
          Concede match
        </button>
      )}
    </>
  );
}
