import { useEffect, useMemo, useRef, useState } from "react";
import type { GameCommand, GameState } from "../engine/model";
import { actor, execute } from "../engine/rules";
import { aiController } from "../engine/ai";

/** Presentation-only pacing. Every approved action still goes through the engine. */
export function AiTurn({
  game,
  send,
}: {
  game: GameState;
  send: (command: GameCommand) => boolean;
}) {
  const [automatic, setAutomatic] = useState(false);
  const [delay, setDelay] = useState(1800);
  const ai = game.status === "ACTIVE" && actor(game) === "ai";
  const command = useMemo(
    () => (ai ? aiController.choose(game) : undefined),
    [game, ai],
  );
  const preview = useMemo(
    () => (command ? execute(game, command) : undefined),
    [game, command],
  );
  const sendRef = useRef(send);
  sendRef.current = send;
  // A command key changes after every accepted state. This prevents rapid double clicks
  // from approving two actions, and avoids resetting the timer on unrelated UI renders.
  const key = `${game.matchId}:${game.commands.length}`;
  const submitted = useRef("");
  const approve = () => {
    if (!command || submitted.current === key) return;
    submitted.current = key;
    if (!sendRef.current(command)) {
      submitted.current = "";
      setAutomatic(false);
    }
  };
  useEffect(() => {
    if (!automatic || !command || preview?.error) return;
    const timer = setTimeout(() => {
      if (submitted.current !== key) {
        submitted.current = key;
        if (!sendRef.current(command)) {
          submitted.current = "";
          setAutomatic(false);
        }
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [automatic, command, delay, key, preview?.error]);
  const proposed = preview?.state.events
    .slice(game.events.length)
    .filter((e) => e.type !== "COMMAND");
  const commandIndexes = game.events.flatMap((e, i) =>
    e.type === "COMMAND" ? [i] : [],
  );
  const previousEnd = commandIndexes.at(-1) ?? -1;
  const previousStart = commandIndexes.at(-2) ?? -1;
  const recent = game.events
    .slice(previousStart + 1, previousEnd < 0 ? undefined : previousEnd)
    .filter((e) => e.type !== "MATCH_ENTERED");
  return (
    <div className="ai-tracker">
      <div className="ai-settings">
        <strong>Opponent pace</strong>
        <button className="secondary" onClick={() => setAutomatic(!automatic)}>
          {automatic ? "Pause approvals" : "Approve all (paced)"}
        </button>
        <label>
          Delay
          <select
            aria-label="AI action delay"
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
          >
            <option value={1000}>1 second</option>
            <option value={1800}>1.8 seconds</option>
            <option value={3000}>3 seconds</option>
          </select>
        </label>
      </div>
      {ai && (
        <div
          className="ai-prompt"
          role="dialog"
          aria-label="Approve opponent action"
          aria-live="polite"
        >
          <span className="eyebrow">
            {game.phase} ·{" "}
            {automatic ? "AUTO APPROVAL" : "AWAITING YOUR APPROVAL"}
          </span>
          <h2>{command?.type.replaceAll("_", " ")}</h2>
          <p>Preview — on approval:</p>
          {preview?.error ? (
            <p role="alert">{preview.error}</p>
          ) : (
            <ul>
              {!proposed?.length && (
                <li>
                  Advance from {game.phase} to {preview?.state.phase}.
                </li>
              )}
              {proposed?.map((e) => (
                <li key={e.sequence}>{e.details}</li>
              ))}
            </ul>
          )}
          {!automatic && (
            <button onClick={approve} disabled={!!preview?.error}>
              Approve next action
            </button>
          )}
          {automatic && (
            <p className="pace-note">
              Next action in {delay / 1000}s. Pause to review at your own pace.
            </p>
          )}
        </div>
      )}
      {recent.length > 0 && (
        <div className="last-action">
          <h3>Just happened</h3>
          <ul>
            {recent.slice(-8).map((e) => (
              <li key={e.sequence}>{e.details}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
