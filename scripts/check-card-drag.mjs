import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";

// Isolated browser context and profile; never touches the player's collection.
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5179",
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
    viewport: { width: 1366, height: 768 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("http://127.0.0.1:5179");
  await page.locator(".pack").first().waitFor();
  const saved = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("newcards.profile")));
  const state = async () => (await saved()).activeMatch;
  const hand = (id) => page.locator(`.match-hand [data-card-id="${id}"]`);
  const unit = (id) => page.locator(`.arena [data-card-id="${id}"]`);
  const board = page.locator(".arena.human h3").first();
  const opponent = page.locator(".arena.ai h3").first();
  const popup = page.getByRole("dialog", {
    name: "Can't play that card",
    exact: true,
  });
  const targetPicker = page.getByRole("dialog", {
    name: "Choose a target",
    exact: true,
  });
  async function fixture(options = {}) {
    const ids = await page.evaluate(async (options) => {
      const { createProfile, mintCard, autoBuild } =
        await import("/src/economy/collection.ts");
      const { definitions } = await import("/src/content/catalog.ts");
      const { createMatch } = await import("/src/engine/rules.ts");
      const p = createProfile(123);
      for (const d of definitions)
        for (let i = 0; i < 2; i++) mintCard(p, d.definitionId, "human");
      const s = createMatch(
        p,
        autoBuild(p, "human"),
        autoBuild(p, "ai"),
        123,
        "drag-test",
        "2026-09-29T00:00:00.000Z",
      );
      for (const c of Object.values(s.cards)) c.zone = "deck";
      for (const owner of ["human", "ai"]) {
        s.players[owner].deck = Object.values(s.cards)
          .filter((c) => c.owner === owner)
          .map((c) => c.id);
        s.players[owner].life = 200;
        s.players[owner].energy = options.energy ?? 20;
      }
      s.phase = options.phase ?? "MAIN";
      s.active = options.active ?? "human";
      s.commands = [];
      s.events = [];
      s.pending = [];
      const add = (name, owner = "human", zone = "hand") => {
        const d = definitions.find((d) => d.name === name);
        if (!d) throw Error(`Browser fixture needs ${name}`);
        const c = mintCard(p, d.definitionId, owner);
        s.cards[c.instanceId] = {
          id: c.instanceId,
          definitionId: d.definitionId,
          owner,
          zone,
          tapped: false,
          sick: false,
          damage: 0,
          bonusAttack: 0,
          bonusHealth: 0,
          temporaryAttack: 0,
          deployed: zone === "battlefield",
          recovered: false,
        };
        return c.instanceId;
      };
      const ids = {};
      for (const name of [
        "Fungal Scout",
        "Fungal Growth",
        "Spore Burst",
        "Plasma Blast",
        "Data Surge",
        "Regrowth",
        "Plasma Rifle",
      ])
        ids[name] = add(name);
      ids.friend = add("Biotech Shroom", "human", "battlefield");
      ids.enemy = add("Cybernetic Enforcer", "ai", "battlefield");
      if (options.pending)
        s.pending = [
          {
            sourceId: ids.friend,
            owner: "human",
            effect: {
              type: "deal_damage",
              value: 1,
              target: "enemy_creature",
              trigger: "on_summon",
            },
          },
        ];
      p.activeMatch = s;
      localStorage.setItem("newcards.profile", JSON.stringify(p));
      return ids;
    }, options);
    await page.reload();
    await hand(ids["Fungal Scout"]).waitFor();
    return ids;
  }
  async function rejected(id, destination, message) {
    const before = await saved();
    await hand(id).dragTo(destination);
    await popup.waitFor();
    assert.match(await popup.textContent(), message);
    assert.deepEqual(
      await saved(),
      before,
      "An invalid drop must not change state, energy or persistence",
    );
    assert.equal(await hand(id).count(), 1);
    await popup.getByRole("button", { name: "Got it" }).click();
    await popup.waitFor({ state: "hidden" });
  }
  const screenshot = async (name) => {
    if (!process.env.PLAYWRIGHT_ARTIFACT_DIR) return;
    await mkdir(process.env.PLAYWRIGHT_ARTIFACT_DIR, { recursive: true });
    await page.screenshot({
      path: join(process.env.PLAYWRIGHT_ARTIFACT_DIR, name),
    });
  };

  let ids = await fixture();
  await screenshot("card-borders.png");
  assert.equal(
    await hand(ids["Fungal Scout"]).getAttribute("draggable"),
    "true",
  );
  assert.equal(await unit(ids.enemy).getAttribute("draggable"), "false");
  await hand(ids["Fungal Scout"]).dragTo(board);
  await unit(ids["Fungal Scout"]).waitFor();
  let s = await state();
  assert.equal(s.players.human.energy, 19);
  assert.equal(s.commands.length, 1, "A drop must submit exactly one command");
  assert.equal(s.cards[ids["Fungal Scout"]].tapped, true);
  assert.equal(s.cards[ids["Fungal Scout"]].sick, true);

  await rejected(ids["Data Surge"], opponent, /your side of the board/);
  await rejected(
    ids["Data Surge"],
    page.locator(".match-top"),
    /Drop cards onto the board/,
  );
  await rejected(ids["Spore Burst"], unit(ids.friend), /isn't a legal target/);
  await rejected(ids.Regrowth, board, /no legal targets/);

  await hand(ids["Spore Burst"]).dragTo(unit(ids.enemy));
  await hand(ids["Spore Burst"]).waitFor({ state: "detached" });
  s = await state();
  assert.equal(s.cards[ids.enemy].damage, 2);
  assert.equal(s.cards[ids["Spore Burst"]].zone, "graveyard");
  assert.equal(s.commands.at(-1).targetId, ids.enemy);

  const beforeChoice = await saved();
  await hand(ids["Fungal Growth"]).dragTo(board);
  await targetPicker.waitFor();
  assert.deepEqual(
    await saved(),
    beforeChoice,
    "Choosing a target does not spend energy",
  );
  await screenshot("choose-drop-target.png");
  await page.keyboard.press("Escape");
  await targetPicker.waitFor({ state: "hidden" });
  assert.deepEqual(
    await saved(),
    beforeChoice,
    "Cancelling a target picker keeps the card in hand",
  );
  await hand(ids["Fungal Growth"]).dragTo(board);
  await targetPicker.getByRole("button", { name: /^Biotech Shroom/ }).click();
  await targetPicker.waitFor({ state: "hidden" });
  assert.equal(
    (await state()).cards[ids["Fungal Growth"]].attachedTo,
    ids.friend,
  );

  await hand(ids["Plasma Blast"]).dragTo(
    page.locator('.arena.ai [data-drop-target="ai"]'),
  );
  await hand(ids["Plasma Blast"]).waitFor({ state: "detached" });
  assert.equal((await state()).players.ai.life, 197);

  await hand(ids["Plasma Rifle"]).dragTo(unit(ids.friend));
  await unit(ids["Plasma Rifle"]).waitFor();
  assert.equal(
    (await state()).cards[ids["Plasma Rifle"]].attachedTo,
    undefined,
    "Artifact drops deploy; attaching remains its own action",
  );

  await hand(ids["Data Surge"]).click();
  await page.getByRole("button", { name: "Confirm play", exact: true }).click();
  await hand(ids["Data Surge"]).waitFor({ state: "detached" });
  assert.equal(
    (await state()).cards[ids["Data Surge"]].zone,
    "graveyard",
    "Click-to-play remains available",
  );

  for (const [options, message] of [
    [{ energy: 0 }, /costs 1 energy. You have 0/],
    [{ phase: "ATTACK" }, /only be played during a main phase/],
    [{ active: "ai" }, /Wait for your turn/],
    [{ pending: true }, /pending effect/],
  ]) {
    ids = await fixture(options);
    await rejected(ids["Fungal Scout"], board, message);
  }

  ids = await fixture();
  // Even a match-winning play must stay on the table if persistence fails.
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("newcards.profile"));
    p.activeMatch.players.ai.life = 1;
    localStorage.setItem("newcards.profile", JSON.stringify(p));
  });
  await page.reload();
  await hand(ids["Plasma Blast"]).waitFor();
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "newcards.profile") throw new Error("Test storage full");
      return setItem.call(this, key, value);
    };
  });
  await rejected(
    ids["Plasma Blast"],
    page.locator('.arena.ai [data-drop-target="ai"]'),
    /Test storage full/,
  );
  await page.reload();
  await hand(ids["Fungal Scout"]).waitFor();

  ids = await fixture({ active: "ai" });
  await page
    .getByRole("button", { name: "Approve all (paced)", exact: true })
    .click();
  await hand(ids["Fungal Scout"]).dragTo(board);
  await popup.waitFor();
  const pausedCommands = (await state()).commands.length;
  await page.waitForTimeout(2100);
  assert.equal(
    (await state()).commands.length,
    pausedCommands,
    "AI waits while a drop popup is open",
  );
  await popup.getByRole("button", { name: "Got it" }).click();
  await page
    .getByRole("button", { name: "Pause approvals", exact: true })
    .click();

  ids = await fixture({ energy: 0 });
  await page.setViewportSize({ width: 1000, height: 650 });
  await hand(ids["Fungal Scout"]).dragTo(board);
  await popup.waitFor();
  await screenshot("illegal-drop-popup.png");
  const bounds = await popup.boundingBox();
  assert.ok(
    bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= 1000 &&
      bounds.y + bounds.height <= 650,
    "Popup fits the supported viewport",
  );
  await page.keyboard.press("Tab");
  assert.ok(
    await popup.evaluate((el) => el.contains(document.activeElement)),
    "Modal traps keyboard focus",
  );
  await page.keyboard.press("Escape");
  await popup.waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  console.log(
    "Passed: real drag/drop, direct creature/player targets, target picker/cancel, artifact deployment, click fallback, illegal drops, failed saves, keyboard modal and small viewport; no browser errors.",
  );
} finally {
  await browser?.close();
  server.kill();
}
