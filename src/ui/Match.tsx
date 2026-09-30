import { useEffect, useRef, useState, type DragEvent } from "react";
import type {
  GameCommand,
  GameState,
  Profile,
  MatchCard,
  Owner,
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
import { AiTurn } from "./AiTurn";
const CARD_DRAG_TYPE = "application/x-newcards-card";
type PlayPrompt =
  | { kind: "error"; message: string }
  | { kind: "target"; cardId: string; targets: string[] };
export function Match({
  profile,
  send,
  inspect,
}: {
  profile: Profile;
  send: (c: GameCommand, onFailure?: (message: string) => void) => boolean;
  inspect: (id: string) => void;
}) {
  const s = profile.activeMatch!;
  const [selected, setSelected] = useState<string>();
  const [attackers, setAttackers] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<Record<string, string>>({});
  const [equip, setEquip] = useState<string>();
  const [target, setTarget] = useState("");
  const [graveyard, setGraveyard] = useState<"human" | "ai">();
  const [dragging, setDragging] = useState<string>();
  const dragCard = useRef<string | undefined>(undefined);
  const [prompt, setPrompt] = useState<PlayPrompt>();
  const dialog = useRef<HTMLDialogElement>(null);
  const dismissDialog = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (prompt) {
      if (!dialog.current?.open) dialog.current?.showModal();
      dismissDialog.current?.focus();
    } else if (dialog.current?.open) dialog.current.close();
  }, [prompt]);
  const mine = actor(s) === "human";
  const main =
    mine && !s.pending.length && (s.phase === "MAIN" || s.phase === "MAIN2");
  const choice = selected ? s.cards[selected] : undefined;
  const options = choice ? playTargets(s, choice) : [];
  const dragTargets =
    dragging && s.cards[dragging] ? playTargets(s, s.cards[dragging]) : [];
  const name = (id: string) =>
    s.cards[id]
      ? `${definition(s.cards[id]).name} #${profile.instances[id]?.serialNumber ?? "token"}`
      : profile.wallets[id as "human" | "ai"].name;
  const submit = (c: GameCommand) => {
    const accepted = send(c, (message) =>
      setPrompt({ kind: "error", message }),
    );
    if (accepted) {
      setSelected(undefined);
      setTarget("");
      setEquip(undefined);
      setPrompt(undefined);
    }
    return accepted;
  };
  const endDrag = () => {
    dragCard.current = undefined;
    setDragging(undefined);
  };
  const rejectDrop = (message: string) => setPrompt({ kind: "error", message });
  const drop = (event: DragEvent, owner?: Owner) => {
    const id = dragCard.current;
    if (!id) return; // Ignore files and drags from other pages.
    event.preventDefault();
    event.stopPropagation();
    const payload = event.dataTransfer.getData(CARD_DRAG_TYPE);
    endDrag();
    if (payload !== id)
      return rejectDrop(
        "That drag was interrupted. Please drag the card from your hand again.",
      );
    if (!owner)
      return rejectDrop(
        "Drop cards onto the board or a highlighted target to play them.",
      );
    const c = s.cards[id];
    if (!c || c.owner !== "human" || c.zone !== "hand")
      return rejectDrop("That card is no longer in your hand.");
    if (s.status !== "ACTIVE")
      return rejectDrop("This match has already finished.");
    if (!mine) return rejectDrop("Wait for your turn before playing a card.");
    if (s.pending.length)
      return rejectDrop(
        "Choose a target for the pending effect before playing another card.",
      );
    if (!main)
      return rejectDrop(
        "Cards can only be played during a main phase. Continue to your next main phase first.",
      );
    if (s.players.human.energy < cost(s, c))
      return rejectDrop(
        `${definition(c).name} costs ${cost(s, c)} energy. You have ${s.players.human.energy}.`,
      );
    const targets = playTargets(s, c);
    const targetId = (event.target as Element).closest<HTMLElement>(
      "[data-drop-target]",
    )?.dataset.dropTarget;
    if (targets.length) {
      if (targetId) {
        if (!targets.includes(targetId))
          return rejectDrop(
            "That isn't a legal target for this card. Drop it on your board to choose from its legal targets.",
          );
        submit({ actor: "human", type: "PLAY_CARD", cardId: id, targetId });
      } else setPrompt({ kind: "target", cardId: id, targets });
    } else if (requiresPlayTarget(c)) {
      rejectDrop("There are no legal targets for this card right now.");
    } else if (owner !== "human") {
      rejectDrop("Play this card onto your side of the board.");
    } else submit({ actor: "human", type: "PLAY_CARD", cardId: id });
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
      dragging={dragging === c.id}
      dropTarget={!!dragging && main && dragTargets.includes(c.id)}
      onDragStart={
        c.owner === "human" && c.zone === "hand"
          ? (event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData(CARD_DRAG_TYPE, c.id);
              dragCard.current = c.id;
              setDragging(c.id);
            }
          : undefined
      }
      onDragEnd={endDrag}
    />
  );
  return (
    <div
      className="match-screen"
      onDragOver={(event) => {
        if (!dragCard.current) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => drop(event)}
    >
      <div className="match-top">
        <div>
          <strong>
            Turn {s.turn} · {s.phase}
          </strong>
          <small>
            {mine ? "Your decision" : "Opponent action"} · Seed {s.seed}
          </small>
        </div>
        <span className="board-hint">
          {dragging
            ? "Drop on your board to play · Highlighted cards and players are legal targets"
            : "Drag from your hand to play · Or click to select and inspect"}
        </span>
      </div>
      {(["ai", "human"] as const).map((o) => (
        <section
          className={`arena ${o} ${dragging && main && o === "human" ? "drop-ready" : ""}`}
          key={o}
          aria-label={`${profile.wallets[o].name} battlefield`}
          onDrop={(event) => drop(event, o)}
        >
          <div className="player-bar">
            <h2>{profile.wallets[o].name}</h2>
            <b
              data-drop-target={o}
              className={
                dragging && main && dragTargets.includes(o)
                  ? "drop-target"
                  : undefined
              }
              title={`Drop here to target ${profile.wallets[o].name}`}
            >
              ♥ {s.players[o].life}
            </b>
            <b>ϟ {s.players[o].energy}</b>
            <span>
              Deck {s.players[o].deck.length} · Hand{" "}
              {zone(s, o, "hand").length}{" "}
            </span>
            <button
              className="graveyard-button secondary"
              onClick={() => setGraveyard(o)}
            >
              Graveyard · {zone(s, o, "graveyard").length}
            </button>
          </div>
          <div className="battle-lanes">
            <div className="creature-lane">
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
          </div>
        </section>
      ))}
      <div className="match-sidebar">
        <AiTurn game={s} send={send} paused={!!dragging || !!prompt} />
        <div className="decision-panel" aria-live="polite">
          {main && !choice && !equip && (
            <>
              <h2>Your main phase</h2>
              <p>
                Drag a card from your hand onto the board, or click it to choose
                a play. Click a deployed artifact to attach it.
              </p>
            </>
          )}
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
                  <p>{definition(choice).rulesText}</p>
                  <button
                    className="secondary"
                    onClick={() => inspect(choice.id)}
                  >
                    Inspect card history
                  </button>
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
      </div>
      <section className="match-hand">
        <h2>
          Your hand <small>{zone(s, "human", "hand").length} cards</small>
        </h2>
        <div
          className="card-row"
          style={{
            gridTemplateColumns: `repeat(${Math.max(1, zone(s, "human", "hand").length)}, minmax(64px, 1fr))`,
          }}
        >
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
      <dialog
        ref={dialog}
        className="play-dialog"
        aria-labelledby="play-dialog-title"
        aria-describedby="play-dialog-description"
        onCancel={() => setPrompt(undefined)}
        onClose={() => setPrompt(undefined)}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons =
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            );
          const first = buttons[0],
            last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <span className="eyebrow">
          {prompt?.kind === "target"
            ? "Choose where it lands"
            : "Card not played"}
        </span>
        <h2 id="play-dialog-title">
          {prompt?.kind === "target"
            ? "Choose a target"
            : "Can't play that card"}
        </h2>
        <p id="play-dialog-description">
          {prompt?.kind === "error"
            ? prompt.message
            : prompt?.kind === "target"
              ? `${name(prompt.cardId)} needs a target. Choose one below to play it, or cancel to keep it in your hand.`
              : ""}
        </p>
        {prompt?.kind === "target" && (
          <div className="actions target-choices">
            {prompt.targets.map((id) => (
              <button
                key={id}
                onClick={() =>
                  submit({
                    actor: "human",
                    type: "PLAY_CARD",
                    cardId: prompt.cardId,
                    targetId: id,
                  })
                }
              >
                {name(id)}
              </button>
            ))}
          </div>
        )}
        <button
          className="secondary"
          ref={dismissDialog}
          onClick={() => setPrompt(undefined)}
        >
          {prompt?.kind === "target" ? "Cancel" : "Got it"}
        </button>
      </dialog>
      {graveyard && (
        <div className="modal-backdrop" onClick={() => setGraveyard(undefined)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Temporary graveyard"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              autoFocus
              onClick={() => setGraveyard(undefined)}
            >
              Close graveyard ×
            </button>
            <h2>{profile.wallets[graveyard].name} · Temporary graveyard</h2>
            <p>These cards remain recoverable until settlement.</p>
            <div className="card-grid">
              {zone(s, graveyard, "graveyard").map((c) => render(c))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
