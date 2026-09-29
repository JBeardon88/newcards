# Designing NewCards content

Start here: **[Funguys cards](content/sets/funguys/cards.json)** or
**[Technocracy cards](content/sets/technocracy/cards.json)**.
These files are the game's card definitions. You do not need to edit TypeScript
to rebalance them, rename cards, change their text, or combine supported mechanics.

| What you want to edit                                        | File                                              |
| ------------------------------------------------------------ | ------------------------------------------------- |
| Cards, costs, stats, rarity, text, mechanics                 | `content/sets/<set-id>/cards.json`                |
| Set name, starter packs, pack composition, placeholder style | `content/sets/<set-id>/set.json`                  |
| Available named keywords                                     | `content/keywords/keywords.json`                  |
| Available effects, parameters, examples and limitations      | `content/keywords/effects.json`                   |
| Trigger and target vocabulary                                | [Mechanics reference](content/keywords/README.md) |
| Rarity descriptions                                          | `content/rarities.json`                           |
| Sporeling token stats and text                               | `content/tokens/cards.json`                       |

## Change a card — content only

Find the card by its `name`. To change its energy cost from three to two, change
`"cost": 3` to `"cost": 2`. Save the file, then run:

```sh
npm run content:validate
npm run dev
```

The first command checks your work without opening the game. Its errors name the
file, card and field to fix. The second starts the game. Refresh the browser after
editing content; restart the development command after adding a set folder.
`npm test` and `npm run build` also check content automatically.

`cost`, `attack` and `health` are whole numbers, zero or greater; a creature needs
at least one health. `rulesText` explains the card to players, while `flavorText`
is its story. Neither field executes rules. Update rules text to match changed
effects; the validator cannot judge English prose.

Keep the existing `definitionId` when renaming or balancing a card. It is the
permanent link used by saved copies and decks. Changing it creates a different
identity and leaves old copies referring to a missing card. For a new card, choose
a new ID such as `funguys:patient-gardener`. Never reuse an old ID for a different
card. The part before the colon must match `setId`.

JSON uses double quotes, commas between entries, and no comments or trailing
commas. Keep the surrounding square brackets when editing a card list. Optional
`metadata` can hold your own design notes, such as `{"designerNotes": "Try at cost 2"}`.

## Add a card to a set — content only

Copy a similar entry in that set's `cards.json`. Give it a unique `definitionId`,
then change its name, stats, rarity and text. For example, this is a complete card
you can add to Funguys (with a comma between it and the neighboring entry):

```json
{
  "definitionId": "funguys:patient-gardener",
  "name": "Patient Gardener",
  "setId": "funguys",
  "cardType": "CREATURE",
  "rarity": "COMMON",
  "cost": 2,
  "attack": 1,
  "health": 2,
  "rulesText": "Mycelium Network. On summon, draw a card.",
  "flavorText": "Good things take a little rain.",
  "keywords": ["MYCELIUM_NETWORK"],
  "effects": [{ "type": "draw_cards", "value": 1, "trigger": "on_summon" }],
  "art": "funguys"
}
```

Run validation, then find the card in **Dev lab** to mint a test copy. New cards
also join their set's pack pool and AI test grants. Existing AI collections get
new cards when you use the reseed control between matches.

The four card types are `CREATURE`, `SPELL`, `ARTIFACT`, and `AUGMENTATION`.
Spells resolve `on_cast` effects and go to the graveyard. Other types remain on
the battlefield. Artifacts attach using the existing one-energy action.
Augmentations with `enchanted_creature` effects choose a friendly bearer on play.

## Create a set — content only

1. Copy an existing folder under `content/sets/`, for example to `content/sets/garden/`.
2. In its `set.json`, set `setId` to `garden`, change `name` and `description`, and
   start `version` at 1. The folder name and `setId` must match. Use lowercase
   letters, numbers and hyphens, beginning with a letter.
3. In the copied `cards.json`, change every `setId` to `garden` and every
   `definitionId` prefix to `garden:`. Then edit or replace the copied cards.
4. Set `starterPacks` to the number granted to a **new** profile (zero is allowed).
   Adjust `pack` so every rarity it might draw exists in your cards.
5. Choose the placeholder appearance: set `art.theme` to `funguys` or `technocracy`,
   `art.symbol` to a short symbol, and `art.title` to the label printed in card art.
   Each card's `art` chooses one of those two existing CSS placeholder themes.
6. Run validation and restart the dev server. Your set appears in pack minting,
   filters and auto-build buttons automatically. No source-code registration is needed.

Sets need at least one card. A legal deck still needs 30 copies with at most two
of each definition; a single-set deck therefore needs at least 15 different
definitions and enough owned copies. A small experimental set can be used in a
mixed deck. Starter packs do not retroactively appear in saved profiles; use
**Mint pack** to try the new set there.

## Rarity and packs — content only

Each card declares `COMMON`, `UNCOMMON`, `RARE`, or `LEGENDARY`. Its name has no
role in rarity. These are the four supported tiers; adding another tier needs
an engine/application change.

Each set's `pack` contains:

```json
{ "common": 8, "uncommon": 3, "rare": 1, "legendaryChance": 0.1 }
```

This makes a 12-card pack: eight commons, three uncommons, and one rare slot.
Each rare slot independently has a 10% chance of becoming legendary. A legendary
**replaces** a rare; it does not add a card. `0` means never and `1` means always.
Cards are selected uniformly within the chosen rarity, with replacement, so
duplicates are possible. Slot counts must be nonnegative whole numbers with at
least one slot in total. Every possible slot needs at least one matching card.

Rarity changes affect newly minted copies. Existing copies retain the rarity
recorded when minted. Names, stats and rules resolve from the current definition,
so changing those affects existing copies too. Pack configuration is read when a
pack is opened, including packs already sitting unopened in a save.

## Use keywords and effects — content only

Open [keywords.json](content/keywords/keywords.json) for player-facing named
mechanics. Currently, `MYCELIUM_NETWORK` is the one implemented keyword. Add it
to a creature's `keywords` list. Do not put a duplicate network effect in `effects`.
To give the keyword through an attachment, use the `grant_ability` example in
[effects.json](content/keywords/effects.json).

Effects are the smaller building blocks. Copy an example with a compatible
trigger and target, and change its documented parameters. A card can have several
effects, which resolve in array order for a given trigger. Each effect chooses
its own target when needed; they do not automatically share a target. Constants
are derived from the board rather than resolved through that queue.

Use the exact identifiers in the reference. For compatibility, these are mostly
lowercase, such as `deal_damage`, not `DEAL_DAMAGE`. Some identifiers still say
`equipment`, `enchantment`, `defense`, or `discard`; the reference explains their
current meanings (artifact, augmentation, health, and graveyard).

An effect is supported only with its documented targets, triggers and parameters.
For example, `draw_cards` with `constant` is invalid: there is no defined time to
draw. A misspelled or unsupported mechanic fails validation instead of silently
doing nothing. Adding an entry to the dictionary alone does not implement it.

## A genuinely new mechanic — engine change required

If the desired behavior cannot be built from the documented vocabulary, describe
the new rule in plain language first. A programmer then:

1. Documents its identifier, behavior and parameters in the relevant dictionary.
2. Adds an explicit TypeScript implementation and registry entry in
   `src/engine/mechanics.ts` / `src/engine/rules.ts`.
3. Extends the relevant JSON Schema and any trigger/target compatibility checks.
4. Adds tests for resolution, targeting and deterministic replay as applicable.

JSON never runs arbitrary code. Haste, arbitrary token species, new card types,
new rarity tiers and new targeting rules require implementation. New artwork
rendering or placeholder styles also belong to the application side.

## Try changes safely

Playtest balance changes in a fresh match. Old saved copies keep their IDs, but
an active match can contain pending effects from the earlier definition. Replaying
an old match requires the same content and engine versions. A set's `version` is
your revision label, not an automatic save migration or a frozen rules snapshot.

Engine tests use frozen sample cards under `tests/fixtures/`; you do not edit those
to rebalance your game. The live files under root `content/` are always validated
separately. Keep Git commits of designs you want to compare or return to.
