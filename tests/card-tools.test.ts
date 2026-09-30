import { describe, it, expect } from "vitest";
import { loadContent } from "../src/content/validate";
import fixture from "./fixtures/content.json";
import { filterCards, deckSummary, EMPTY_FILTERS } from "../src/ui/cardTools";
import type { CardInstance } from "../src/engine/model";

const catalog = loadContent(fixture).cards;
function copy(
  definitionId: string,
  serialNumber: number,
  lifecycleStatus: CardInstance["lifecycleStatus"] = "ALIVE",
  currentOwnerId: CardInstance["currentOwnerId"] = "human",
): CardInstance {
  const d = catalog[definitionId];
  return {
    instanceId: `copy-${serialNumber}`,
    definitionId,
    serialNumber,
    setId: d.setId,
    rarity: d.rarity,
    packId: "test",
    mintedAt: "2026-09-30T00:00:00Z",
    originalOwnerId: "human",
    currentOwnerId,
    lifecycleStatus,
    history: [],
  };
}
const samples = [
  copy("funguys:fungal-scout", 1),
  copy("technocracy:plasma-rifle", 2),
  copy("technocracy:holo-shield", 3),
  copy("funguys:fungal-scout", 4, "DEAD"),
  copy("funguys:spore-burst", 5),
  copy("funguys:fungal-growth", 6),
  copy("funguys:elder-fungus", 7, "ALIVE", "ai"),
];
const instances = Object.fromEntries(samples.map((c) => [c.instanceId, c]));
describe("designer-facing card browsing", () => {
  it("combines name, set, type, rarity and status without mutating copies", () => {
    const before = structuredClone(samples);
    expect(
      filterCards(
        samples,
        {
          ...EMPTY_FILTERS,
          name: "  SHIELD  ",
          set: "technocracy",
          type: "ARTIFACT",
          rarity: "UNCOMMON",
          status: "ALIVE",
        },
        catalog,
      ).map((c) => c.instanceId),
    ).toEqual(["copy-3"]);
    expect(samples).toEqual(before);
    expect(
      filterCards(samples, { ...EMPTY_FILTERS, status: "DEAD" }, catalog).map(
        (c) => c.instanceId,
      ),
    ).toEqual(["copy-4"]);
  });
  it("sorts numeric energy, rarity and copy age with stable ties", () => {
    const byCost = filterCards(
      samples,
      { ...EMPTY_FILTERS, sort: "cost" },
      catalog,
    );
    expect(byCost.map((c) => catalog[c.definitionId].cost)).toEqual([
      1, 1, 2, 2, 2, 2, 5,
    ]);
    expect(byCost.slice(0, 2).map((c) => c.serialNumber)).toEqual([1, 4]);
    expect(
      filterCards(samples, { ...EMPTY_FILTERS, sort: "rarity" }, catalog)[0]
        .rarity,
    ).toBe("LEGENDARY");
    expect(
      filterCards(samples, { ...EMPTY_FILTERS, sort: "newest" }, catalog).map(
        (c) => c.serialNumber,
      ),
    ).toEqual([7, 6, 5, 4, 3, 2, 1]);
    const descending = filterCards(
      samples,
      { ...EMPTY_FILTERS, sort: "cost-desc" },
      catalog,
    );
    expect(catalog[descending[0].definitionId].cost).toBe(5);
  });
  it("counts all selected copies and reports unavailable or missing cards", () => {
    const summary = deckSummary(
      instances,
      [...samples.map((c) => c.instanceId), "missing"],
      catalog,
    );
    expect(summary).toEqual({
      total: 8,
      counts: { CREATURE: 3, ARTIFACT: 2, SPELL: 1, AUGMENTATION: 1 },
      unavailable: 3,
      missing: 1,
    });
    expect(deckSummary(instances, [], catalog).total).toBe(0);
    expect(
      deckSummary(instances, ["copy-2", "copy-3"], catalog).counts.ARTIFACT,
    ).toBe(2);
  });
});
