import { chromium } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

// A separate test browser/profile; never touches a user's collection.
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5178",
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
    server.once("exit", (c) => reject(new Error(`Vite exited ${c}`)));
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ["--disable-gpu"],
  });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://127.0.0.1:5178");
  await page.locator(".pack").first().waitFor();
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    const { createProfile, mintCard, autoBuild } =
      await import("/src/economy/collection.ts");
    const { definitions, cards } = await import("/src/data/cards.ts");
    const { createMatch } = await import("/src/engine/rules.ts");
    const p = createProfile(123);
    for (const d of definitions)
      for (let i = 0; i < 2; i++) mintCard(p, d.definitionId, "human");
    const s = createMatch(p, autoBuild(p, "human"), autoBuild(p, "ai"), 123);
    // Populate a deliberately crowded test board to exercise bounded card lanes.
    for (const owner of ["human", "ai"]) {
      for (const [type, count] of [
        ["CREATURE", 6],
        ["ARTIFACT", 3],
        ["AUGMENTATION", 3],
      ]) {
        for (const c of Object.values(s.cards)
          .filter(
            (c) => c.owner === owner && cards[c.definitionId].cardType === type,
          )
          .slice(0, count)) {
          c.zone = "battlefield";
          c.deployed = true;
          c.sick = false;
          c.tapped = false;
          s.players[owner].deck = s.players[owner].deck.filter(
            (id) => id !== c.id,
          );
        }
      }
      for (const c of Object.values(s.cards)
        .filter((c) => c.owner === owner && c.zone === "deck")
        .slice(0, 7)) {
        c.zone = "hand";
        s.players[owner].deck = s.players[owner].deck.filter(
          (id) => id !== c.id,
        );
      }
      s.players[owner].energy = 30;
      s.players[owner].life = 200;
    }
    s.active = "ai";
    s.phase = "MAIN";
    p.activeMatch = s;
    localStorage.setItem("newcards.profile", JSON.stringify(p));
  });
  await page.reload();
  await page.getByRole("dialog", { name: "Approve opponent action" }).waitFor();
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [1280, 720],
    [1000, 650],
  ]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => ({
      height: innerHeight,
      width: innerWidth,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      rects: [
        ...document.querySelectorAll(".match-screen > .arena,.match-hand"),
      ].map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      }),
    }));
    assert.ok(
      layout.scrollHeight <= height + 1,
      `Vertical page overflow at ${width}x${height}: ${JSON.stringify(layout)}`,
    );
    assert.ok(
      layout.scrollWidth <= width + 1,
      `Horizontal page overflow at ${width}x${height}`,
    );
    assert.equal(layout.rects.length, 3);
    for (const r of layout.rects)
      assert.ok(
        r.top >= 0 && r.bottom <= height && r.left >= 0 && r.right <= width,
        "Battlefields and hand must be in view",
      );
    const clipped = await page.evaluate(() =>
      [
        ...document.querySelectorAll(".arena .card-row, .match-hand .card-row"),
      ].flatMap((row) => {
        const bounds = row.getBoundingClientRect();
        return [...row.querySelectorAll(".card")]
          .filter((card) => {
            const r = card.getBoundingClientRect();
            return (
              r.left < bounds.left - 1 ||
              r.right > bounds.right + 1 ||
              r.top < bounds.top - 1 ||
              r.bottom > bounds.bottom + 1
            );
          })
          .map((card) => card.getAttribute("aria-label"));
      }),
    );
    assert.deepEqual(
      clipped,
      [],
      "Normal populated board and seven-card hand must not require scrolling",
    );
    console.log(`Board fits ${width} × ${height}`);
  }
  if (process.env.UI_SCREENSHOT)
    await page.screenshot({ path: process.env.UI_SCREENSHOT });
  const count = () =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("newcards.profile")).activeMatch
          .commands.length,
    );
  const before = await count();
  await page.waitForTimeout(2100);
  assert.equal(await count(), before, "AI must await approval by default");
  await page
    .getByRole("button", { name: "Approve next action", exact: true })
    .click();
  assert.equal(await count(), before + 1);
  await page.waitForTimeout(1300);
  assert.equal(
    await count(),
    before + 1,
    "Manual approval allows exactly one action",
  );
  await page.getByLabel("AI action delay").selectOption("1000");
  await page
    .getByRole("button", { name: "Approve all (paced)", exact: true })
    .click();
  await page.waitForTimeout(400);
  assert.equal(
    await count(),
    before + 1,
    "Approve all must not instantly run a turn",
  );
  await page.waitForFunction(
    (n) =>
      JSON.parse(localStorage.getItem("newcards.profile")).activeMatch.commands
        .length === n,
    before + 2,
    { timeout: 2000 },
  );
  await page
    .getByRole("button", { name: "Pause approvals", exact: true })
    .click();
  const paused = await count();
  await page.waitForTimeout(1300);
  assert.equal(
    await count(),
    paused,
    "Pause cancels the next scheduled action",
  );
  await page
    .getByRole("button", { name: "Approve all (paced)", exact: true })
    .click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Collection", exact: true })
    .click();
  const away = await count();
  await page.waitForTimeout(1300);
  assert.equal(await count(), away, "Leaving play pauses the AI");
  await page
    .locator("nav")
    .getByRole("button", { name: "Play", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve next action", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Approve next action", exact: true })
    .waitFor();
  assert.equal(
    await count(),
    away,
    "Reload preserves the pending decision and defaults to manual",
  );
  // Human combat priority must never be auto-approved.
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("newcards.profile"));
    const s = p.activeMatch;
    const unit = Object.values(s.cards).find(
      (c) => c.owner === "ai" && c.zone === "battlefield",
    );
    s.active = "ai";
    s.phase = "BLOCK";
    s.attackers = [unit.id];
    s.pending = [];
    localStorage.setItem("newcards.profile", JSON.stringify(p));
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Resolve combat", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Approve all (paced)", exact: true })
    .click();
  const defending = await count();
  await page.waitForTimeout(2100);
  assert.equal(
    await count(),
    defending,
    "Human blocking remains a human decision",
  );
  await page
    .getByRole("button", { name: /^Graveyard ·/ })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Temporary graveyard", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Close graveyard ×", exact: true })
    .click();
  assert.deepEqual(errors, []);
  console.log(
    "Passed: manual approval, paced auto-play, pause, navigation, refresh, human blocking, graveyard overlay; no browser errors.",
  );
} finally {
  await browser?.close();
  server.kill();
}
