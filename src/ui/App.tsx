import { useEffect, useState } from "react";
import type {
  CardInstance,
  GameCommand,
  Profile,
  SetId,
} from "../engine/model";
import { cards, definitions } from "../data/cards";
import { SETS, sets } from "../content/catalog";
import {
  autoBuild,
  createProfile,
  deckErrors,
  mintCard,
  mintPack,
  openPack,
  saveDeck,
  seedAI,
} from "../economy/collection";
import {
  settle,
  settlementPreview,
  terminalStatus,
} from "../economy/settlement";
import { actor, createMatch, execute } from "../engine/rules";
import { aiController } from "../engine/ai";
import { LocalPersistence, STORAGE_KEY } from "../persistence/storage";
import { Card } from "./Card";
import { Match } from "./Match";
const persistence = new LocalPersistence(localStorage);
const screens = [
  "Wallet",
  "Packs",
  "Collection",
  "Deck builder",
  "Play",
  "Settlement",
  "Dev lab",
] as const;
type Screen = (typeof screens)[number];
function initial() {
  try {
    const saved = persistence.load();
    if (saved) return { profile: saved, error: "" };
    const p = createProfile();
    persistence.save(p);
    return { profile: p, error: "" };
  } catch (e) {
    return { profile: undefined, error: String(e) };
  }
}
export function App() {
  const [boot] = useState(initial);
  const [profile, setProfile] = useState<Profile | undefined>(boot.profile);
  const [error, setError] = useState(boot.error);
  const [screen, setScreen] = useState<Screen>(
    boot.profile?.activeMatch
      ? boot.profile.activeMatch.status === "FINISHED"
        ? "Settlement"
        : "Play"
      : "Packs",
  );
  const [detail, setDetail] = useState<string>();
  const [revealed, setRevealed] = useState<string[]>([]);
  const [filter, setFilter] = useState({
    set: "",
    type: "",
    rarity: "",
    status: "",
    name: "",
    owner: "human",
  });
  const [draft, setDraft] = useState<string[]>([]);
  const [deckName, setDeckName] = useState("My first expedition");
  const [deckId, setDeckId] = useState<string>();
  const [seed, setSeed] = useState(20260929);
  const [loot, setLoot] = useState("");
  const [grant, setGrant] = useState(definitions[0].definitionId);
  const [notice, setNotice] = useState("");
  const commit = (next: Profile) => {
    persistence.save(next);
    setProfile(next);
  };
  const run = (fn: (p: Profile) => void) => {
    try {
      if (!profile) return false;
      const next = structuredClone(profile);
      fn(next);
      commit(next);
      setError("");
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    }
  };
  const send = (command: GameCommand) =>
    run((p) => {
      if (!p.activeMatch) throw Error("No active match.");
      const result = execute(p.activeMatch, command);
      if (result.error) throw Error(result.error);
      p.activeMatch = result.state;
      if (result.state.status === "FINISHED") setScreen("Settlement");
    });
  useEffect(() => {
    const listener = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        try {
          const p = persistence.load();
          if (p) setProfile(p);
        } catch (e) {
          setError(String(e));
        }
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  if (!profile)
    return (
      <main>
        <h1>Save could not be loaded</h1>
        <p role="alert">{error}</p>
        <p>
          Your existing save has not been overwritten. Copy it before resetting.
        </p>
        <textarea readOnly value={localStorage.getItem(STORAGE_KEY) ?? ""} />
        <button
          onClick={() => {
            if (confirm("Delete this unreadable local profile?")) {
              persistence.clear();
              location.reload();
            }
          }}
        >
          Reset local profile
        </button>
      </main>
    );
  const p = profile,
    owned = Object.values(p.instances).filter(
      (c) => c.currentOwnerId === "human",
    );
  const inspect = (id: string) => {
    if (p.instances[id]) setDetail(id);
  };
  const build = (setId?: SetId) => {
    try {
      setDraft(autoBuild(p, "human", setId, seed));
      setDeckId(undefined);
      setDeckName(`${setId ? SETS[setId] : "Mixed"} expedition`);
      setScreen("Deck builder");
      setError("");
    } catch (e) {
      setError(String(e));
    }
  };
  const start = (ids: string[]) =>
    run((next) => {
      next.activeMatch = createMatch(
        next,
        ids,
        autoBuild(next, "ai", undefined, seed + 1),
        seed,
      );
      setScreen("Play");
      setLoot("");
    });
  const open = (packId: string) =>
    run((next) => {
      setRevealed(openPack(next, packId));
      setScreen("Packs");
    });
  const packButtons = (
    <div className="actions">
      {(Object.keys(SETS) as SetId[]).map((set) => (
        <button
          className="secondary"
          key={set}
          onClick={() =>
            run((next) => {
              mintPack(next, set);
              setNotice(`${SETS[set]} test pack minted.`);
            })
          }
        >
          Mint {SETS[set]} pack · free test
        </button>
      ))}
    </div>
  );
  const autoButtons = (
    <div className="actions">
      {Object.values(sets).map((set) => (
        <button key={set.setId} onClick={() => build(set.setId)}>
          Auto-build {set.name}
        </button>
      ))}
      <button onClick={() => build()}>Auto-build Mixed</button>
    </div>
  );
  const detailCard = detail ? p.instances[detail] : undefined;
  const filtered = Object.values(p.instances).filter(
    (c) =>
      c.currentOwnerId === filter.owner &&
      (!filter.set || c.setId === filter.set) &&
      (!filter.type || cards[c.definitionId].cardType === filter.type) &&
      (!filter.rarity || c.rarity === filter.rarity) &&
      (!filter.status || c.lifecycleStatus === filter.status) &&
      cards[c.definitionId].name
        .toLowerCase()
        .includes(filter.name.toLowerCase()),
  );
  const groups = filtered.reduce<Record<string, CardInstance[]>>((acc, c) => {
    (acc[c.definitionId] ??= []).push(c);
    return acc;
  }, {});
  const losses = p.activeMatch ? settlementPreview(p.activeMatch) : undefined;
  return (
    <div
      className={`app ${screen === "Play" && p.activeMatch?.status === "ACTIVE" ? "playing" : ""}`}
    >
      <aside>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setScreen("Wallet");
          }}
        >
          N<span>NEWCARDS</span>
        </a>
        <p className="tagline">Objects with histories.</p>
        <nav>
          {screens.map((s) => (
            <button
              className={s === screen ? "active" : ""}
              key={s}
              onClick={() => setScreen(s)}
            >
              {s}
              {s === "Packs" && (
                <small>
                  {
                    p.packs.filter((x) => x.ownerId === "human" && !x.openedAt)
                      .length
                  }
                </small>
              )}
            </button>
          ))}
        </nav>
        <div className="local-badge">
          <i /> LOCAL TEST ECONOMY<small>No accounts. No real money.</small>
        </div>
      </aside>
      <main>
        <header>
          <span>FUNGUYS × TECHNOCRACY</span>
          <span>
            ◉ Player wallet ·{" "}
            {owned.filter((c) => c.lifecycleStatus === "ALIVE").length} usable
          </span>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button className="text-button" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        {screen === "Wallet" && (
          <>
            <div className="hero">
              <span className="eyebrow">PERSISTENT CARD GAME · MVP 0.1</span>
              <h1>
                Cards are things.
                <br />
                Risk something real.
              </h1>
              <p>
                Mint a collection. Take it into battle. Every survivor, every
                loss, every captured artifact belongs to a story.
              </p>
              <button onClick={() => setScreen("Packs")}>
                Open your packs →
              </button>
              <button
                className="secondary"
                onClick={() => setScreen("Deck builder")}
              >
                Build an expedition
              </button>
            </div>
            <div className="stats-grid">
              {["ALIVE", "DEAD", "CONSUMED", "DESTROYED"].map((status) => (
                <div key={status}>
                  <strong>
                    {owned.filter((c) => c.lifecycleStatus === status).length}
                  </strong>
                  <span>
                    {status === "ALIVE" ? "Usable cards" : status.toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
            <section>
              <h2>Your saved decks</h2>
              {!p.decks.length && (
                <p>No decks yet. Open packs, then select 30 usable cards.</p>
              )}
              {p.decks.map((d) => (
                <div className="list-row" key={d.deckId}>
                  <b>{d.name}</b>
                  <span>{d.instanceIds.length} cards</span>
                  <span>
                    {deckErrors(p, d.instanceIds, "human").length
                      ? "Needs rebuilding"
                      : "Legal"}
                  </span>
                  <button
                    disabled={
                      !!p.activeMatch ||
                      !!deckErrors(p, d.instanceIds, "human").length
                    }
                    onClick={() => start(d.instanceIds)}
                  >
                    Play AI
                  </button>
                </div>
              ))}
            </section>
            <h2>Settled expeditions</h2>
            {p.matches
              .slice()
              .reverse()
              .map((m) => (
                <div className="list-row" key={m.matchId}>
                  <b>{m.winner === "human" ? "Victory" : "Defeat"}</b>
                  <span>
                    {m.losses.length} cards lost ·{" "}
                    {m.captured ? "1 artifact captured" : "No capture"}
                  </span>
                  <small>{new Date(m.settledAt).toLocaleString()}</small>
                </div>
              ))}
            {p.activeMatch && (
              <button
                onClick={() =>
                  setScreen(
                    p.activeMatch?.status === "FINISHED"
                      ? "Settlement"
                      : "Play",
                  )
                }
              >
                Resume current match
              </button>
            )}
          </>
        )}
        {screen === "Packs" && (
          <>
            <Title
              eyebrow="MINT / DISCOVER / OWN"
              title="Your next story is unopened."
            />
            <p>
              Each pack belongs to one set: 8 common, 3 uncommon, and 1
              rare-or-better. Every reveal mints twelve unique copies.
            </p>
            {packButtons}
            <div className="packs">
              {p.packs
                .filter((x) => x.ownerId === "human" && !x.openedAt)
                .map((pack) => (
                  <button
                    className={`pack ${sets[pack.setId].art.theme}`}
                    key={pack.packId}
                    onClick={() => open(pack.packId)}
                  >
                    <span>12 UNIQUE CARDS</span>
                    <b>{sets[pack.setId].art.symbol}</b>
                    <h2>{SETS[pack.setId]}</h2>
                    <small>PACK #{pack.serialNumber}</small>
                    <strong>Open pack →</strong>
                  </button>
                ))}
            </div>
            {revealed.length > 0 && (
              <section>
                <h2>Twelve objects. Twelve beginnings.</h2>
                <div className="card-grid">
                  {revealed.map((id) => (
                    <Card
                      key={id}
                      instance={p.instances[id]}
                      onClick={() => inspect(id)}
                    />
                  ))}
                </div>
              </section>
            )}
            <details>
              <summary>
                Opened pack history (
                {
                  p.packs.filter((x) => x.ownerId === "human" && x.openedAt)
                    .length
                }
                )
              </summary>
              {p.packs
                .filter((x) => x.ownerId === "human" && x.openedAt)
                .map((x) => (
                  <button
                    className="secondary"
                    key={x.packId}
                    onClick={() => setRevealed(x.instanceIds)}
                  >
                    {SETS[x.setId]} #{x.serialNumber} ·{" "}
                    {new Date(x.openedAt!).toLocaleDateString()}
                  </button>
                ))}
            </details>
          </>
        )}
        {screen === "Collection" && (
          <>
            <Title
              eyebrow="THE LOCAL WALLET"
              title="Every copy is its own object."
            />
            <div className="filters">
              <input
                aria-label="Search card name"
                placeholder="Search card name…"
                value={filter.name}
                onChange={(e) => setFilter({ ...filter, name: e.target.value })}
              />
              {(
                [
                  ["set", Object.keys(SETS)],
                  ["type", ["CREATURE", "SPELL", "ARTIFACT", "AUGMENTATION"]],
                  ["rarity", ["COMMON", "UNCOMMON", "RARE", "LEGENDARY"]],
                  ["status", ["ALIVE", "DEAD", "CONSUMED", "DESTROYED"]],
                ] as const
              ).map(([field, values]) => (
                <select
                  aria-label={`Filter ${field}`}
                  key={field}
                  value={filter[field]}
                  onChange={(e) =>
                    setFilter({ ...filter, [field]: e.target.value })
                  }
                >
                  <option value="">All {field}s</option>
                  {values.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ))}
              <select
                aria-label="Collection owner"
                value={filter.owner}
                onChange={(e) =>
                  setFilter({ ...filter, owner: e.target.value })
                }
              >
                <option value="human">Player wallet</option>
                <option value="ai">AI wallet</option>
              </select>
            </div>
            <p>
              {filtered.length} individual copies · {Object.keys(groups).length}{" "}
              definitions
            </p>
            <div className="collection-groups">
              {Object.entries(groups).map(([def, instances]) => (
                <section key={def}>
                  <h3>
                    {cards[def].name} <small>× {instances.length}</small>
                  </h3>
                  <Card
                    instance={instances[0]}
                    onClick={() => inspect(instances[0].instanceId)}
                  />
                  <div
                    className="copy-list"
                    aria-label={`${cards[def].name} individual copies`}
                  >
                    {instances.map((c) => (
                      <button
                        key={c.instanceId}
                        className="secondary"
                        onClick={() => inspect(c.instanceId)}
                      >
                        #{String(c.serialNumber).padStart(6, "0")} ·{" "}
                        {c.lifecycleStatus}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            {!filtered.length && (
              <p className="empty">
                No matching cards. Open a pack or change your filters.
              </p>
            )}
          </>
        )}
        {screen === "Deck builder" && (
          <>
            <Title
              eyebrow="OWNERSHIP BEFORE STRATEGY"
              title="Choose what you’re willing to risk."
            />
            {autoButtons}
            <div className="deck-toolbar">
              <input
                aria-label="Deck name"
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
              />
              <b>{draft.length}/30</b>
              <button
                disabled={!!deckErrors(p, draft, "human").length}
                onClick={() =>
                  run((next) => {
                    const d = saveDeck(next, draft, deckName, deckId);
                    setDeckId(d.deckId);
                    setNotice("Deck saved.");
                  })
                }
              >
                Save deck
              </button>
              <button
                disabled={
                  !!p.activeMatch || !!deckErrors(p, draft, "human").length
                }
                onClick={() => start(draft)}
              >
                Play this deck
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setDraft([]);
                  setDeckId(undefined);
                }}
              >
                Clear selection
              </button>
            </div>
            <p className="notice">
              Exactly 30 owned, alive instances; at most two per definition.
              Click a card to add or remove it. Decks containing lost or
              captured cards must be rebuilt.
            </p>
            {deckErrors(p, draft, "human").map((e) => (
              <p className="validation" key={e}>
                {e}
              </p>
            ))}
            <div className="actions">
              {p.decks.map((d) => (
                <button
                  className="secondary"
                  key={d.deckId}
                  onClick={() => {
                    setDraft(d.instanceIds);
                    setDeckName(d.name);
                    setDeckId(d.deckId);
                  }}
                >
                  Edit {d.name}
                </button>
              ))}
            </div>
            {draft.some(
              (id) =>
                !p.instances[id] ||
                p.instances[id].lifecycleStatus !== "ALIVE" ||
                p.instances[id].currentOwnerId !== "human",
            ) && (
              <button
                onClick={() =>
                  setDraft(
                    draft.filter(
                      (id) =>
                        p.instances[id]?.lifecycleStatus === "ALIVE" &&
                        p.instances[id].currentOwnerId === "human",
                    ),
                  )
                }
              >
                Remove lost / captured cards
              </button>
            )}
            <div className="card-grid">
              {owned
                .filter((c) => c.lifecycleStatus === "ALIVE")
                .map((c) => {
                  const selected = draft.includes(c.instanceId);
                  const full =
                    draft.length >= 30 ||
                    draft.filter(
                      (id) => p.instances[id]?.definitionId === c.definitionId,
                    ).length >= 2;
                  return (
                    <Card
                      key={c.instanceId}
                      instance={c}
                      selected={selected}
                      disabled={!selected && full}
                      onClick={() =>
                        setDraft(
                          selected
                            ? draft.filter((id) => id !== c.instanceId)
                            : [...draft, c.instanceId],
                        )
                      }
                    />
                  );
                })}
            </div>
          </>
        )}
        {screen === "Play" &&
          (p.activeMatch ? (
            p.activeMatch.status === "FINISHED" ? (
              <>
                <h1>Match complete.</h1>
                <button onClick={() => setScreen("Settlement")}>
                  Review settlement
                </button>
              </>
            ) : (
              <Match
                key={p.activeMatch.matchId}
                profile={p}
                send={send}
                inspect={inspect}
              />
            )
          ) : (
            <>
              <Title
                eyebrow="PLAY AGAINST THE CUSTODIAN"
                title="Take your collection into battle."
              />
              <p>
                Both wallets risk real local instances. Play ends at settlement,
                where losses and ownership changes become permanent.
              </p>
              {p.decks.map((d) => (
                <div className="list-row" key={d.deckId}>
                  <b>{d.name}</b>
                  <button
                    disabled={!!deckErrors(p, d.instanceIds, "human").length}
                    onClick={() => start(d.instanceIds)}
                  >
                    Play AI
                  </button>
                  <small>
                    {deckErrors(p, d.instanceIds, "human").join(" ")}
                  </small>
                </div>
              ))}
              {autoButtons}
              <button
                className="secondary"
                onClick={() => setScreen("Deck builder")}
              >
                Open deck builder
              </button>
            </>
          ))}
        {screen === "Settlement" && (
          <>
            {p.activeMatch?.status === "FINISHED" && losses ? (
              <>
                <Title
                  eyebrow="THE CONSEQUENCES"
                  title={
                    p.activeMatch.winner === "human"
                      ? "Victory. Claim the story."
                      : "Defeat. Count the cost."
                  }
                />
                <p>
                  Winner: {p.wallets[p.activeMatch.winner!].name} · Loser:{" "}
                  {
                    p.wallets[p.activeMatch.winner === "human" ? "ai" : "human"]
                      .name
                  }
                  . {p.activeMatch.result}
                </p>
                <p className="notice">
                  Nothing below is permanent until you commit settlement.
                  Refreshing keeps this result pending.
                </p>
                {(
                  ["CREATURE", "SPELL", "ARTIFACT", "AUGMENTATION"] as const
                ).map((type) => {
                  const ids = losses.losses.filter(
                    (id) =>
                      cards[p.instances[id].definitionId].cardType === type,
                  );
                  return (
                    <section key={type}>
                      <h2>
                        {type} →{" "}
                        {type === "CREATURE"
                          ? "DEAD"
                          : type === "SPELL"
                            ? "CONSUMED"
                            : "DESTROYED"}{" "}
                        <small>{ids.length}</small>
                      </h2>
                      <div className="card-row">
                        {ids.map((id) => (
                          <div key={id}>
                            <small>
                              {p.instances[id].currentOwnerId}'s card
                            </small>
                            <Card
                              instance={p.instances[id]}
                              onClick={() => inspect(id)}
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
                <section>
                  <h2>Escaped the graveyard · {losses.recovered.length}</h2>
                  <div className="card-row">
                    {losses.recovered.map((id) => (
                      <Card
                        key={id}
                        instance={p.instances[id]}
                        onClick={() => inspect(id)}
                      />
                    ))}
                  </div>
                </section>
                <section>
                  <h2>Surviving deployed cards · {losses.deployed.length}</h2>
                  <div className="card-row">
                    {losses.deployed.map((id) => (
                      <Card
                        key={id}
                        instance={p.instances[id]}
                        onClick={() => inspect(id)}
                      />
                    ))}
                  </div>
                  <p>
                    {losses.survivors.length} total survivors, including cards
                    in hand and deck.
                  </p>
                </section>
                <section>
                  <h2>Artifact loot</h2>
                  {!losses.eligible.length ? (
                    <p>No surviving deployed enemy artifacts qualify.</p>
                  ) : (
                    <>
                      <p>
                        {p.activeMatch.winner === "human"
                          ? "Choose up to one artifact to capture. It remains alive and becomes yours."
                          : "The Custodian will capture the first eligible artifact deterministically."}
                      </p>
                      <div className="card-row">
                        {losses.eligible.map((id, i) => (
                          <Card
                            key={id}
                            instance={p.instances[id]}
                            selected={
                              p.activeMatch!.winner === "ai"
                                ? i === 0
                                : loot === id
                            }
                            onClick={() =>
                              p.activeMatch!.winner === "human" &&
                              setLoot(loot === id ? "" : id)
                            }
                          />
                        ))}
                      </div>
                      <p>
                        Ownership:{" "}
                        {p.activeMatch.winner === "human"
                          ? "AI → Player"
                          : "Player → AI"}{" "}
                        ·{" "}
                        {p.activeMatch.winner === "human"
                          ? loot
                            ? cards[p.instances[loot].definitionId].name
                            : "No loot selected"
                          : cards[p.instances[losses.eligible[0]].definitionId]
                              .name}
                      </p>
                    </>
                  )}
                </section>
                <button
                  onClick={() => {
                    try {
                      const next = settle(p, loot || undefined);
                      commit(next);
                      setNotice(
                        `Settlement committed. ${losses.losses.length} cards permanently lost across both wallets.${next.matches.at(-1)?.captured ? " Artifact ownership transferred." : ""}`,
                      );
                      setScreen("Collection");
                      setError("");
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  Commit settlement & return to collection
                </button>
              </>
            ) : (
              <>
                <h1>No pending settlement.</h1>
                <p>Complete a match to review losses and artifact loot.</p>
                <button onClick={() => setScreen("Play")}>Go to play</button>
              </>
            )}
          </>
        )}
        {screen === "Dev lab" && (
          <>
            <Title
              eyebrow="EXPERIMENT / INSPECT / REPEAT"
              title="Development lab"
            />
            <p>
              Test minting is free. Grants create real instances with
              provenance. AI reseeding adds new copies and preserves existing
              histories.
            </p>
            {packButtons}
            <div className="actions">
              <select
                aria-label="Card definition to mint"
                value={grant}
                onChange={(e) => setGrant(e.target.value)}
              >
                {definitions.map((d) => (
                  <option key={d.definitionId} value={d.definitionId}>
                    {SETS[d.setId]} · {d.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  run((next) => {
                    const c = mintCard(next, grant, "human");
                    setDetail(c.instanceId);
                  })
                }
              >
                Mint specific card
              </button>
              <button
                onClick={() =>
                  run((next) => {
                    for (const d of definitions)
                      for (let i = 0; i < 2; i++)
                        mintCard(next, d.definitionId, "human");
                    setNotice(
                      "Granted two of every definition (88 unique copies).",
                    );
                  })
                }
              >
                Grant two of every card
              </button>
              <button
                disabled={!!p.activeMatch}
                onClick={() =>
                  run((next) => {
                    seedAI(next);
                    setNotice("AI collection reseeded with new instances.");
                  })
                }
              >
                Reseed AI collection
              </button>
            </div>
            <div className="actions">
              <label>
                RNG seed
                <input
                  aria-label="RNG seed"
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) >>> 0)}
                />
              </label>
              <button
                onClick={() =>
                  run((next) => {
                    next.rngState = seed;
                    setNotice("Pack RNG seed set.");
                  })
                }
              >
                Set mint seed
              </button>
              <button
                disabled={!!p.activeMatch}
                onClick={() => {
                  try {
                    start(autoBuild(p, "human", undefined, seed));
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                Quick launch mixed AI match
              </button>
              <button
                disabled={
                  !p.activeMatch ||
                  p.activeMatch.status === "FINISHED" ||
                  actor(p.activeMatch) !== "human"
                }
                onClick={() =>
                  p.activeMatch && send(aiController.choose(p.activeMatch))
                }
              >
                AI step for human (test)
              </button>
            </div>
            <button
              className="secondary"
              onClick={() =>
                run((next) => {
                  next.decks = [];
                  setDraft([]);
                  setDeckId(undefined);
                })
              }
            >
              Clear saved decks
            </button>
            <button
              className="danger"
              onClick={() => {
                if (
                  confirm(
                    "Delete all local ownership, provenance, decks and matches? This cannot be undone.",
                  )
                ) {
                  try {
                    const fresh = createProfile();
                    commit(fresh);
                    setDraft([]);
                    setDetail(undefined);
                    setRevealed([]);
                    setScreen("Packs");
                    setError("");
                  } catch (e) {
                    setError(String(e));
                  }
                }
              }}
            >
              Reset entire local profile
            </button>
            <details>
              <summary>Unopened packs</summary>
              {p.packs
                .filter((x) => !x.openedAt && x.ownerId === "human")
                .map((x) => (
                  <button key={x.packId} onClick={() => open(x.packId)}>
                    Open {SETS[x.setId]} #{x.serialNumber}
                  </button>
                ))}
            </details>
            <details>
              <summary>Serialized current GameState</summary>
              <pre>{JSON.stringify(p.activeMatch ?? null, null, 2)}</pre>
            </details>
            <details>
              <summary>Command / event history</summary>
              <pre>
                {JSON.stringify(
                  p.activeMatch
                    ? {
                        commands: p.activeMatch.commands,
                        events: p.activeMatch.events,
                      }
                    : p.matches.at(-1)?.game,
                  null,
                  2,
                )}
              </pre>
            </details>
            <details>
              <summary>Raw collection and provenance</summary>
              <pre>{JSON.stringify(p.instances, null, 2)}</pre>
            </details>
          </>
        )}
        <footer>
          LOCAL MVP · Cards persist on this browser · Save version {p.version}
        </footer>
      </main>
      {detailCard && (
        <div className="modal-backdrop" onClick={() => setDetail(undefined)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Card provenance"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              onClick={() => setDetail(undefined)}
              autoFocus
            >
              Close ×
            </button>
            <div className="detail-heading">
              <Card instance={detailCard} />
              <div>
                <span className="eyebrow">ONE OBJECT. ITS ENTIRE HISTORY.</span>
                <h1>
                  {cards[detailCard.definitionId].name}
                  <br />
                  <small>
                    #{String(detailCard.serialNumber).padStart(6, "0")}
                  </small>
                </h1>
                <p className="status-pill">{detailCard.lifecycleStatus}</p>
                <p>
                  Original owner: {p.wallets[detailCard.originalOwnerId].name}
                  <br />
                  Current owner: {p.wallets[detailCard.currentOwnerId].name}
                </p>
                <p>
                  Minted {new Date(detailCard.mintedAt).toLocaleString()}
                  <br />
                  Pack{" "}
                  {p.packs.find((x) => x.packId === detailCard.packId)
                    ?.serialNumber ?? detailCard.packId}
                </p>
                <em>{cards[detailCard.definitionId].flavorText}</em>
              </div>
            </div>
            <div className="stats-grid">
              {[
                ["MATCH_ENTERED", "Matches entered"],
                ["SURVIVED_MATCH", "Survived"],
                ["PLAYED", "Deployed / cast"],
                ["ARTIFACT_CAPTURED", "Captures"],
              ].map(([type, label]) => (
                <div key={type}>
                  <strong>
                    {detailCard.history.filter((e) => e.type === type).length}
                  </strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <ol className="timeline">
              {detailCard.history
                .slice()
                .reverse()
                .map((e, i) => (
                  <li key={i}>
                    <b>{e.type.replaceAll("_", " ")}</b>
                    <p>{e.details}</p>
                    <small>
                      {new Date(e.timestamp).toLocaleString()}{" "}
                      {e.matchId ? `· Match ${e.matchId.slice(0, 8)}` : ""}
                      {e.previousOwner
                        ? ` · ${e.previousOwner} → ${e.newOwner}`
                        : ""}
                    </small>
                  </li>
                ))}
            </ol>
            <details>
              <summary>Identity and raw provenance</summary>
              <pre>{JSON.stringify(detailCard, null, 2)}</pre>
            </details>
            {p.activeMatch && (
              <p>
                Current match events appear in the match log; provenance is
                appended when settlement commits.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Title({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
    </div>
  );
}
