import { sets } from "../content/catalog";
import { cards } from "../data/cards";
import type { CardInstance, MatchCard, GameState } from "../engine/model";
import { stats } from "../engine/rules";
export function Card({
  instance,
  matchCard,
  game,
  onClick,
  selected = false,
  disabled = false,
  label,
}: {
  instance?: CardInstance;
  matchCard?: MatchCard;
  game?: GameState;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const d = cards[(instance?.definitionId ?? matchCard?.definitionId)!];
  const power =
    game && matchCard
      ? stats(game, matchCard)
      : { attack: d.attack, health: d.health };
  return (
    <button
      title={`${d.name} · ${d.cost} energy · ${d.rulesText}`}
      disabled={disabled}
      onClick={onClick}
      className={`card ${d.art} ${selected ? "selected" : ""} ${matchCard?.tapped ? "tapped" : ""}`}
      aria-label={
        label ?? `${d.name}${instance ? ` #${instance.serialNumber}` : ""}`
      }
    >
      <div className="card-top">
        <strong>{d.name}</strong>
        <b className="cost">{d.cost}</b>
      </div>
      <div className="art">
        <span>
          {d.cardType === "CREATURE"
            ? sets[d.setId].art.symbol
            : d.cardType === "ARTIFACT"
              ? "⚒"
              : d.cardType === "SPELL"
                ? "ϟ"
                : "◎"}
        </span>
        <small>{sets[d.setId].art.title}</small>
      </div>
      <div className="card-type">
        {d.cardType} <span className={d.rarity.toLowerCase()}>{d.rarity}</span>
      </div>
      <p className="rules">
        {d.rulesText || "A creature ready to make its own history."}
      </p>
      <div className="card-bottom">
        <small>
          {instance
            ? `#${String(instance.serialNumber).padStart(6, "0")}`
            : "TOKEN"}{" "}
          {instance?.lifecycleStatus !== "ALIVE"
            ? instance?.lifecycleStatus
            : ""}
        </small>
        {d.cardType === "CREATURE" && (
          <b>
            {power.attack} / {power.health}
          </b>
        )}
      </div>
      {matchCard && (
        <div className="card-flags">
          {matchCard.tapped ? "Tapped · " : ""}
          {matchCard.sick && d.cardType === "CREATURE"
            ? "Summoning sick · "
            : ""}
          {matchCard.attachedTo ? "Attached" : ""}
          {game?.attackers.includes(matchCard.id) ? "Attacking" : ""}
        </div>
      )}
    </button>
  );
}
