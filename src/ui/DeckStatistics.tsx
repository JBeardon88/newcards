import type { CardInstance, CardType } from "../engine/model";
import { CARD_TYPE_LABELS, deckSummary } from "./cardTools";

export function DeckStatistics({
  instances,
  ids,
}: {
  instances: Record<string, CardInstance>;
  ids: string[];
}) {
  const summary = deckSummary(instances, ids);
  return (
    <section className="deck-summary" aria-label="Deck statistics">
      <h2>
        Deck composition <small>{summary.total} cards selected</small>
      </h2>
      <dl className="deck-statistics">
        {(Object.entries(CARD_TYPE_LABELS) as [CardType, string][]).map(
          ([type, label]) => (
            <div key={type}>
              <dt>{label}</dt>
              <dd data-card-type={type}>{summary.counts[type]}</dd>
            </div>
          ),
        )}
      </dl>
      {summary.unavailable > 0 && (
        <p className="validation">
          {summary.unavailable} selected card(s) are unavailable and need
          replacing.
          {summary.missing > 0
            ? ` ${summary.missing} missing card(s) cannot be counted by type.`
            : ""}
        </p>
      )}
      <small>
        Counts include the entire selection, even cards hidden by your filters.
      </small>
    </section>
  );
}
