# Blockcards → Newcards

This is a fresh engine, not an architectural port. `JBeardon88/Blockcards` was read only; no files or branches there were changed.

## Authored-content boundary (September 2026)

The 44 runtime definitions from NewCards commit `2753ca2` were moved into
`content/sets/funguys/cards.json` and `content/sets/technocracy/cards.json`.
Names, IDs, ordering, stats, rarity, corrected rules text, flavor and effective
mechanics are unchanged. Set metadata, pack composition and Sporeling data are
authored JSON too. The legacy runtime files and name-based rarity table were
removed; the original files remain available in Git history.

The Mycelium Network effect is authored as a named keyword and expands to the
same internal effect. Legacy token name/stats and recovery destination fields,
which the engine ignored, were removed from effects. Sporeling stats now live in
the token definition; recovery still always returns a creature to hand. Legacy
lowercase effect IDs remain supported and documented, with no runtime renaming.
Token event text reads the token definition so future designer edits appear in
the log (the original token produces exactly the original message).

Migration verification matched the complete normalized-definition fingerprint
and compared the old/new engines through four complete games, with identical
state and events after every command. The original 48 test assertions remain;
their cards are now a frozen test-only fixture so designer edits cannot break
named engine scenarios. Test UUIDs are reproducible because random IDs affect
the AI's tie-breaking and could make an existing loss-count assertion flaky.

There is no save schema change. Keep existing definition IDs to preserve saved
collections. Content revisions are not snapshots: existing copies read updated
stats/text, minted rarities remain recorded, and historical replay requires the
original content revision. Set versions are metadata, not automatic migrations.

## Inspected reference material

Before implementation: `README.txt`, `funguys.json`, `sets/technobros.json`, `board.py`, `card.py`, `effects.py`, `combat.py`, `turns.py`, `player.py`, `ai.py`, and `game.py`.

Card source blobs: Funguys `7062384514495d3d932ef50d0a9aa0d43658370a`; Technocracy `86d7a23d5577176a40b1e9c05105cb76a803ff67`. The original JSON is preserved in Git history through commit `2753ca2`. The later content-boundary migration replaces runtime legacy files with canonical authored content under `content/`.

## Retained

- All 23 Funguys and 21 Technocracy card concepts, names, stats, costs, useful rules and flavor.
- 20 life, two initial energy, +1 natural upkeep energy, accumulated unspent energy, six-card opening hands, seven-card end-turn hand limit.
- 30-card decks, two-copy limit, upkeep/main/combat/second-main/end, tapping, summoning sickness, direct player damage and simultaneous creature combat.
- Persistent marked creature damage, equipment bonuses, draw/damage/removal effects, regeneration/cost modification, targeted/global augmentations and simple AI gameplay.
- Regrowth's intended graveyard-to-hand recovery, death tokens, attack/upkeep triggers and Mycelium identity.

## Normalized or repaired

- Equipment → **ARTIFACT**; enchantment → **AUGMENTATION**. Legacy trigger spellings (`upkeep`, `start_of_turn`) normalize to `on_upkeep`.
- Legacy effects defined in JSON but absent from the old dispatcher are implemented, rather than silently skipped.
- Power Grid/Battery Array/Energy Bloom add their listed upkeep regeneration exactly once. Board-derived constants disappear when their source does.
- Holo Shield's rules now disclose both effects from its data: -1 attack and +3 health.
- Nightmare Gun targets creatures or players at upkeep while attached, consistent with its “any target” rules text.
- Mycelium Network lacked a coherent implementation. MVP meaning: a network creature gets +1 health while another friendly network creature exists. Networked Resilience adds its own +1 health independently.
- Artifacts cost one energy to attach, may stack on one creature, and stay deployed when their bearer dies. Detached targeted augmentations persist but no longer affect the departed creature.
- Creature on-summon effects with no legal target are skipped, allowing deployment. Targeted spells and attached augmentations require a legal target before energy is paid.
- Added explicit empty-deck fatigue and defending-player simultaneous-defeat tiebreak to ensure matches terminate.
- Rarity is new, provisional editable data; the old pools did not have complete rarity information.
- Corrected a legacy `flavor_text:` typo during the original normalization, preserving the intended Neon Samurai flavor.

## Deliberately discarded

Terminal UI, `input()` targeting, presentation/rules coupling, object-reference ownership, name-based card selection, truncated temporary IDs, repeated effect processing, direct mutable state spread across modules, random calls inside rules, and AI shortcuts that bypass ownership or legal commands.

## New economic behavior

Unique minted copies, unopened and opened packs, persistent wallets/decks, append-only provenance, temporary graveyard versus permanent terminal status, post-match atomic settlement, modular one-artifact loot, versioned local persistence, deterministic replay groundwork and a transport interface. None of this claims blockchain security or implements networking.
