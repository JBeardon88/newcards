import { loadContent, type ContentInput } from "./validate";

// Raw imports let us name the offending file even when its JSON is malformed.
const files = import.meta.glob("../../content/**/*.json", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;
const sources = Object.entries(files)
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([path, raw]) => {
    path = path.replace("../../", "");
    try {
      return { path, data: JSON.parse(raw) as unknown };
    } catch (error) {
      throw Error(
        `${path}: invalid JSON. Check commas, quotes and brackets. ${String(error)}`,
      );
    }
  });
const required = (path: string) => {
  const source = sources.find((s) => s.path === path);
  if (!source) throw Error(`${path}: required content file is missing`);
  return source;
};
for (const source of sources)
  if (
    source.path.startsWith("content/sets/") &&
    !/^content\/sets\/[^/]+\/(set|cards)\.json$/.test(source.path)
  )
    throw Error(
      `${source.path}: unexpected set content file. Use content/sets/<set-id>/set.json and cards.json.`,
    );
export const contentInput: ContentInput = {
  sets: sources.filter((s) => /^content\/sets\/[^/]+\/set\.json$/.test(s.path)),
  cards: sources.filter((s) =>
    /^content\/sets\/[^/]+\/cards\.json$/.test(s.path),
  ),
  tokens: required("content/tokens/cards.json"),
  keywords: required("content/keywords/keywords.json"),
  effects: required("content/keywords/effects.json"),
  rarities: required("content/rarities.json"),
};
export const { definitions, cards, sets, tokenDefinition } =
  loadContent(contentInput);
export const SETS: Record<string, string> = Object.fromEntries(
  Object.values(sets).map((s) => [s.setId, s.name]),
);
