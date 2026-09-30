import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";

const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5180",
    "--strictPort",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let browser;
try {
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (d) => {
      if (String(d).includes("Local:")) resolve();
    });
    server.stderr.on("data", (d) => process.stderr.write(d));
    server.once("error", reject);
    server.once("exit", (code) => reject(Error(`Vite exited ${code}`)));
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ["--disable-gpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("http://127.0.0.1:5180");
  await page.locator(".pack").first().waitFor();
  const info = await page.evaluate(async () => {
    const { createProfile, mintCard, autoBuild, saveDeck } =
      await import("/src/economy/collection.ts");
    const { definitions, cards } = await import("/src/content/catalog.ts");
    const p = createProfile(123);
    for (const d of definitions)
      for (let i = 0; i < 2; i++) mintCard(p, d.definitionId, "human");
    const first = saveDeck(
      p,
      autoBuild(p, "human", undefined, 101),
      "Spore expedition",
    );
    const second = saveDeck(
      p,
      autoBuild(p, "human", undefined, 202),
      "Mixed workshop",
    );
    const fallen = first.instanceIds.find(
      (id) => !second.instanceIds.includes(id),
    );
    p.instances[fallen].lifecycleStatus = "DEAD";
    const counts = (deck) =>
      deck.instanceIds.reduce(
        (result, id) => {
          result[cards[p.instances[id].definitionId].cardType]++;
          return result;
        },
        { CREATURE: 0, SPELL: 0, ARTIFACT: 0, AUGMENTATION: 0 },
      );
    localStorage.setItem("newcards.profile", JSON.stringify(p));
    return {
      first: first.deckId,
      second: second.deckId,
      fallen,
      firstCounts: counts(first),
      secondCounts: counts(second),
    };
  });
  await page.reload();
  const navigate = (name) =>
    page.locator("nav").getByRole("button", { name, exact: true }).click();
  await navigate("Deck builder");
  const pool = page.locator(".deck-card-pool");
  const summary = page.getByRole("region", { name: "Deck statistics" });
  const counts = () =>
    summary
      .locator("dd")
      .evaluateAll((nodes) =>
        Object.fromEntries(
          nodes.map((n) => [n.dataset.cardType, Number(n.textContent)]),
        ),
      );
  const savedDecks = page.getByRole("region", { name: "Your saved decks" });
  await savedDecks.getByRole("button", { name: /Spore expedition/ }).click();
  assert.deepEqual(await counts(), info.firstCounts);
  assert.equal(
    await page
      .getByRole("button", { name: "Save deck", exact: true })
      .isDisabled(),
    true,
  );
  assert.match(
    await summary.textContent(),
    /1 selected card\(s\) are unavailable/,
  );
  await page
    .getByLabel("Filter type", { exact: true })
    .selectOption("ARTIFACT");
  await page
    .getByLabel("Filter set", { exact: true })
    .selectOption("technocracy");
  await page
    .getByLabel("Filter rarity", { exact: true })
    .selectOption("COMMON");
  await page.getByLabel("Search card name", { exact: true }).fill("Rifle");
  assert.ok((await pool.locator(".card").count()) > 0);
  assert.ok(
    (await pool.locator(".card-top strong").allTextContents()).every(
      (name) => name === "Plasma Rifle",
    ),
  );
  assert.deepEqual(
    await counts(),
    info.firstCounts,
    "Filters do not alter the selected deck or its statistics",
  );
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await pool.locator(".card").first().click();
  assert.equal((await counts()).ARTIFACT, 1);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.getByLabel("Filter status", { exact: true }).selectOption("DEAD");
  assert.equal(await pool.locator(".card").count(), 1);
  assert.equal(
    await pool.locator(".card").first().isDisabled(),
    true,
    "Lost cards remain visible but cannot be added",
  );
  assert.equal((await counts()).ARTIFACT, 1);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.getByLabel("Filter status", { exact: true }).selectOption("ALIVE");
  for (const sort of ["cost", "cost-desc"]) {
    await page.getByLabel("Sort cards", { exact: true }).selectOption(sort);
    const costs = (await pool.locator(".cost").allTextContents()).map(Number);
    assert.deepEqual(
      costs,
      [...costs].sort((a, b) => (sort === "cost" ? a - b : b - a)),
    );
  }
  await savedDecks.getByRole("button", { name: /Mixed workshop/ }).click();
  assert.deepEqual(await counts(), info.secondCounts);
  assert.equal(
    await page.getByLabel("Deck name").inputValue(),
    "Mixed workshop",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Save deck", exact: true })
      .isDisabled(),
    false,
  );
  await savedDecks.getByRole("button", { name: /Spore expedition/ }).click();
  await page
    .getByRole("button", { name: "Remove lost / captured cards", exact: true })
    .click();
  assert.equal(
    Object.values(await counts()).reduce((a, b) => a + b, 0),
    29,
  );
  await pool.locator(".card:not(.selected):not(:disabled)").first().click();
  assert.equal(
    Object.values(await counts()).reduce((a, b) => a + b, 0),
    30,
  );
  await page.getByRole("button", { name: "Save deck", exact: true }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("newcards.profile")),
  );
  assert.equal(
    saved.decks.length,
    2,
    "Editing a saved deck must update it, not make a duplicate",
  );
  assert.equal(
    saved.decks
      .find((d) => d.deckId === info.first)
      .instanceIds.includes(info.fallen),
    false,
  );
  await page.reload();
  await navigate("Deck builder");
  await savedDecks.getByRole("button", { name: /Spore expedition/ }).click();
  assert.equal(
    Object.values(await counts()).reduce((a, b) => a + b, 0),
    30,
  );
  await page
    .getByLabel("Filter type", { exact: true })
    .selectOption("ARTIFACT");
  if (process.env.PLAYWRIGHT_ARTIFACT_DIR) {
    await mkdir(process.env.PLAYWRIGHT_ARTIFACT_DIR, { recursive: true });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: join(process.env.PLAYWRIGHT_ARTIFACT_DIR, "deck-builder.png"),
    });
  }
  await navigate("Collection");
  await page
    .getByLabel("Filter type", { exact: true })
    .selectOption("CREATURE");
  await page.getByLabel("Search card name", { exact: true }).fill("Scout");
  assert.ok(
    (
      await page
        .locator(".collection-groups .card-top strong")
        .allTextContents()
    ).every((name) => name.includes("Scout")),
  );
  await navigate("Deck builder");
  assert.equal(
    await page.getByLabel("Filter type", { exact: true }).inputValue(),
    "ARTIFACT",
    "Deck filters are independent from collection filters",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Passed: saved deck selection, composition counts, combined filters, sorting, unavailable cards, persistent selection, editing/saving/reloading and independent collection filters.",
  );
} finally {
  await browser?.close();
  server.kill();
}
