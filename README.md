# Newcards

A playable, browser-local collectible card game where each copy is a persistent object with an owner, a serial number and a history. Mint packs → build a deck → play the AI → recover endangered cards → settle permanent losses and artifact loot → build again.

Fresh TypeScript / React / Vite architecture, using 44 card definitions from **Blockcards**. No blockchain, currency, accounts, backend, or online multiplayer. This is an experimental design environment, not a secure economy. Browser saves can be edited or cleared by their owner.

## Run

Node.js 20.19+ or 22.12+ recommended (tested with Node 24).

```sh
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). In GitHub Codespaces, open port **5173** in the **Ports** panel, then select **Open in Browser**. Vite binds to `0.0.0.0` for port forwarding.

```sh
npm run content:validate # check designer content
npm test           # content validation plus headless engine / economy tests
npm run test:watch
npm run build     # strict TypeScript check and production build
npm run preview   # serve built application
```

## Your first expedition

1. Open the six starter packs: three Funguys and three Technocracy. Each contains twelve uniquely minted copies (72 human-owned cards total).
2. Visit **Collection** and click any copy to inspect its identity and history.
3. In **Deck builder**, select instances manually or auto-build Funguys, Technocracy, or Mixed. Save a 30-card deck with no more than two copies of a definition. Random packs do **not** guarantee enough distinct cards for a single-set deck; mint more free test packs when the builder reports insufficient cards.
4. Click **Play AI**. Advance upkeep into main phase. Drag a hand card onto your board to play it, or onto a highlighted creature/player life total to target it. Dropping a targeted card on empty board space opens a target picker; cancel keeps it in hand. Illegal drops show a popup explaining why, without spending energy. You can also click a hand card, choose a legal target, and confirm play. Artifacts deploy first; click a deployed artifact to attach it for one energy.
5. Advance to attack, select ready creatures, and confirm attackers. On defense, select one blocker per attacker and resolve combat. Continue through second main and end phase. Discard down to seven when prompted.
6. At match end, review **Settlement**, select up to one eligible enemy artifact if you won, then **Commit settlement**.
7. Return to collection: terminal cards remain inspectable, captures have new owners, and every copy has an appended history. Rebuild decks containing lost or captured copies.

## Play layout and opponent pacing

The play table fits the browser viewport at **1000 × 650 CSS pixels or larger**. Both battlefields and your hand remain visible. Cards keep a compact 5:7 portrait shape and never expand to fill an empty lane. Board cards are capped at 104 pixels wide; hand cards at 116 pixels, with modest resizing for shorter screens. Crowded board lanes wrap and scroll internally; hands scroll sideways when needed. Full rules remain available on hover or in the selected-card panel. Below the minimum size, the page can scroll to preserve readable controls. Graveyards open in an overlay; the decision/log column scrolls independently.

The opponent **waits for your approval by default**. Its action prompt previews what the next command will do and lists what just happened. Click **Approve next action** to advance one decision, or **Approve all (paced)** for one command every 1, 1.8 (default), or 3 seconds. **Pause approvals** cancels the upcoming automatic action. Human target/blocking decisions are never auto-approved. Leaving Play pauses the AI; returning or refreshing defaults to manual approval without losing match progress.

Browser regression checks (optional; the ordinary engine tests need no browser):

```sh
npx playwright install chromium
npm run test:ui
npm run test:drag
```

These check viewport fit, manual approval, paced playback, pause, navigation, refresh, human blocking, graveyard inspection, drag/drop targeting and invalid-play popups. Drag/drop uses desktop browser dragging; click controls remain available for keyboard and touch use. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` may point to an existing Chromium executable. Set `PLAYWRIGHT_ARTIFACT_DIR` to save screenshots from the drag/drop checks.

## Rules implemented

- 20 starting life, 30-card decks, maximum two copies per definition.
- Six-card opening hands; both players start with two energy. Upkeep adds one energy plus deployed regeneration effects, draws a card and readies your creatures. Unspent normal energy accumulates. Temporary energy expires at turn end.
- Upkeep → main → attack → block (if attacked) → second main → end.
- Newly summoned creatures enter tapped and summoning sick. One blocker per attacker; a blocker cannot be reused. Combat damage is simultaneous; unblocked creatures hit the defending player. No stack, instants, multi-blocks, or combat tricks in this MVP.
- Damage remains on creatures between turns, as in the legacy game. Regeneration heals marked damage. Temporary attack changes expire at end of turn.
- Artifacts deploy separately, attach for one energy, and survive their bearer dying. Multiple artifacts may attach to a creature. Destroyed artifact bonuses disappear immediately. Targeted augmentations remain on the board but stop affecting a creature after it leaves.
- Mycelium Network gives +1 health while another friendly network creature is present. Cards can grant the keyword. This makes an undefined legacy concept explicit.
- Death tokens are ephemeral match objects, never minted collectibles or loot.
- Empty-deck draws cause escalating fatigue damage (1, 2, 3…). Simultaneous defeat awards the defending player the win. These explicit fallback rules prevent endless matches.
- All cards still in a graveyard at settlement, **including hand-limit discards**, receive their type's permanent consequence: creature → DEAD, spell → CONSUMED, artifact/augmentation → DESTROYED. Regrowth returns a creature to hand during the same match; if it stays out of the graveyard, it survives.
- The winner may capture one surviving, actually deployed enemy artifact. The human may decline; the AI chooses the first eligible instance in sorted ID order.
- Conceding ends a match but does not undo losses or avoid loot.

## Persistence and experimentation

State is stored under `newcards.profile` in this browser's localStorage, including the active match, unopened/opened packs, both wallets, instances, decks and full completed match records. Reload resumes pending play or settlement. Commit uses one persistence write; failed storage writes do not update the UI's accepted profile. Use one active gameplay tab: this local prototype is not a concurrent database. Origin, browser, and private-mode storage are separate; clearing browser data deletes the collection.

The **Dev lab** can mint packs, mint one definition, grant two of every definition, set pack/match seeds, launch matches, have the controller make a human decision for testing, reseed AI inventory, inspect state/commands/events/provenance, clear decks and reset the profile. Reseeding adds new AI copies and retains old histories; it is blocked during a match.

Card design lives under `content/sets/`, including explicit IDs, rarity, stats, text and effects. Set files control pack composition. Start with [CONTENT_GUIDE.md](CONTENT_GUIDE.md); the keyword/effect vocabulary is in `content/keywords/`. Run `npm run content:validate` to check edits. Validation also runs before development, tests and builds. UI cards use existing CSS placeholder themes, no external image or font service.

## Boundaries and limitations

The rules and settlement tests run without React. Deterministic replay requires the same starting state, seed, match ID, start timestamp and command sequence. UUIDs and mint timestamps are external economic inputs, not game randomness. This is a local authoritative engine, **not** a hidden-information or cryptographic protocol. AI uses its own real instances; its deck may eventually need reseeding. Save files grow with history and remain subject to browser storage quotas. Unsupported future schema versions are rejected without silently overwriting the old save.

See [ARCHITECTURE.md](ARCHITECTURE.md) and [MIGRATION_NOTES.md](MIGRATION_NOTES.md).
