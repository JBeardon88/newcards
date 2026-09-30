import { SETS } from "../content/catalog";
import {
  EMPTY_FILTERS,
  CARD_TYPE_LABELS,
  type CardFiltersValue,
} from "./cardTools";

export function CardFilters({
  value,
  onChange,
}: {
  value: CardFiltersValue;
  onChange: (value: CardFiltersValue) => void;
}) {
  return (
    <>
      <input
        aria-label="Search card name"
        placeholder="Search card name…"
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
      />
      {(
        [
          ["set", Object.keys(SETS)],
          ["type", Object.keys(CARD_TYPE_LABELS)],
          ["rarity", ["COMMON", "UNCOMMON", "RARE", "LEGENDARY"]],
          ["status", ["ALIVE", "DEAD", "CONSUMED", "DESTROYED"]],
        ] as const
      ).map(([field, options]) => (
        <select
          key={field}
          aria-label={`Filter ${field}`}
          value={value[field]}
          onChange={(e) => onChange({ ...value, [field]: e.target.value })}
        >
          <option value="">
            All{" "}
            {field === "status"
              ? "statuses"
              : field === "rarity"
                ? "rarities"
                : `${field}s`}
          </option>
          {options.map((id) => (
            <option key={id} value={id}>
              {field === "set" ? SETS[id] : id}
            </option>
          ))}
        </select>
      ))}
      <select
        aria-label="Sort cards"
        value={value.sort}
        onChange={(e) => onChange({ ...value, sort: e.target.value })}
      >
        <option value="name">Name · A–Z</option>
        <option value="name-desc">Name · Z–A</option>
        <option value="cost">Energy · low to high</option>
        <option value="cost-desc">Energy · high to low</option>
        <option value="rarity">Rarity · rarest first</option>
        <option value="newest">Newest copies first</option>
      </select>
      <button
        className="secondary"
        onClick={() => onChange({ ...EMPTY_FILTERS })}
      >
        Clear filters
      </button>
    </>
  );
}
