# Architecture

## Objects and ownership

`src/engine/model.ts` defines serializable plain-data contracts. A `CardDefinition` is reusable immutable rules data. A `CardInstance` is a minted economic object with a full UUID, globally increasing local serial, pack/set/rarity, original and current owners, lifecycle status and append-only history. Names are labels, never identity keys.

`src/data` contains both legacy pools, normalization, provisional rarities, pack slots and configurable deck/game rules. All 44 definitions are supported. Ephemeral Sporeling tokens have a definition but deliberately have no collectible instance.

`src/economy/collection.ts` handles minting, opening, deck validation and seeded legal auto-building. Pure deck checks validate size, uniqueness, copy count, ownership and lifecycle. A saved deck is a reference list, not a second store of copies; it can become invalid after settlement. AI inventory obeys the same checks.

## Authoritative game boundary

`createMatch` validates both decks and creates isolated `MatchCard` records referring to their owned copies. `execute(GameState, GameCommand)` clones the input, checks priority and legality, applies rules, then returns a new state. Invalid commands return the unchanged input plus an error. React and AI never patch match state directly.

Commands cover playing, targeted effects, equipment, attackers, blockers, discards, phase advancement and concession. The current pools have no independent activated abilities requiring an `ACTIVATE_ABILITY` command. Effects use a queued target-selection boundary; the engine supplies valid choices and never asks for terminal input. Constants are derived from the live board instead of mutating definitions or accumulating duplicate buffs. State-based deaths are checked after damage and removal of bonuses; death triggers enter the queue. Simultaneous combat assigns all damage before checking deaths.

The deterministic PRNG is serializable Mulberry32, used for packs, shuffles and auto-building. The simple AI is deterministic and does not need random choices. Match events use stable offsets from the supplied start time, so replay does not consult the clock. Command and event histories are persisted with the match. Mint UUIDs, mint timestamps, and settlement timestamps are supplied outside rule processing.

`src/engine/ai.ts` is a `DecisionSource`: it reads its legal state and returns a command. `AiTurn` owns presentation-only approval and pacing in the Play screen. It previews an immutable engine result, then submits exactly one approved command; auto-approval uses a cancellable timer. Unmounting cancels playback. Human priority is never bypassed. The UI schedules one AI decision at a time. It neither creates free cards nor bypasses the engine. It does not consult the opposing hand or deck when making decisions.

## Settlement transaction

Temporary zones and permanent lifecycle status are different types in different records. During a match, collection ownership and lifecycle remain unchanged. Active match persistence locks the session to that match and prevents a second match or AI reseeding.

`src/economy/settlement.ts` derives a preview, checks the match has finished and its instances are still owned/alive, appends relevant match events to each object's provenance, converts remaining graveyard cards, records survivors, and applies the modular loot policy. It returns a complete **new** profile, never partially mutating the input. One successful persistence write commits the whole transaction and removes the active match. Repeated settlement is rejected. Lost copies stay in storage forever; captured copies retain their original owner and mint record.

The default `LootPolicy` selects surviving deployed artifacts belonging to the loser; hidden and destroyed artifacts are excluded. Humans may choose one or decline. AI uses a deterministic eligible-ID ordering. Both `ARTIFACT_CAPTURED` and `TRANSFERRED` record previous and new owners.

## Persistence and UI

`PersistenceAdapter` hides localStorage behind load/save/clear. Save schema version 1 is validated at load; unsupported versions are rejected and the UI exposes the raw save rather than resetting it. Future versions should add explicit migration functions in `deserialize`. No migrations exist because there is only one schema version so far.

React screens operate on economic services or issue engine commands. Failed storage writes surface as errors and leave the accepted UI profile unchanged. Active matches and pending settlement survive refresh. Full completed match snapshots support debugging/replay. This is deliberately a single-active-tab prototype, not an ACID multi-writer store.

Provenance is the product view of economic history, with timestamps, match/source/opponent fields and transfer metadata. It is appended at settlement, while in-flight events remain visible in the match log. Optional future transaction/state-hash/signature fields are data seams only; no cryptography is performed.

## Future remote boundary

`src/engine/transport.ts` defines only `TransportAdapter.send(command)` and event/state subscriptions. A future remote controller should feed commands into the exact same engine, not send mutable state patches. Before networking, add authenticated actor binding, command revisions, authoritative validation, per-player hidden-information projections, replay/rules-version negotiation, conflict handling and explicit disconnect/concession policy. The present full local `GameState` must not be broadcast unchanged to an adversarial opponent.

Blockchain, ownership proofs, signed settlement, matchmaking, transport implementations and accounts are intentionally absent. The aim is a playable loop and honest local object lifecycle before choosing those mechanisms.
