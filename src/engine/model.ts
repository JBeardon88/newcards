export type Owner = "human" | "ai";
export type CardType = "CREATURE" | "SPELL" | "ARTIFACT" | "AUGMENTATION";
export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "LEGENDARY";
export type Lifecycle = "ALIVE" | "DEAD" | "CONSUMED" | "DESTROYED";
// Set identity is validated against the content catalog, not a hard-coded union.
export type SetId = string;
export interface Effect {
  type: string;
  value?: number | string;
  trigger?: string;
  target?: string;
  duration?: string;
  condition?: string;
}
export interface CardDefinition {
  definitionId: string;
  name: string;
  setId: SetId;
  cardType: CardType;
  rarity: Rarity;
  cost: number;
  attack: number;
  health: number;
  rulesText: string;
  flavorText: string;
  effects: Effect[];
  art: string;
}
export interface HistoryEvent {
  type: string;
  timestamp: string;
  matchId?: string;
  owner?: Owner;
  previousOwner?: Owner;
  newOwner?: Owner;
  opponent?: Owner;
  sourceId?: string;
  details?: string;
  transactionHash?: string;
  stateHash?: string;
  signature?: string;
}
export interface CardInstance {
  instanceId: string;
  definitionId: string;
  serialNumber: number;
  setId: SetId;
  rarity: Rarity;
  packId: string;
  mintedAt: string;
  originalOwnerId: Owner;
  currentOwnerId: Owner;
  lifecycleStatus: Lifecycle;
  history: HistoryEvent[];
}
export interface Pack {
  packId: string;
  serialNumber: number;
  setId: SetId;
  ownerId: Owner;
  createdAt: string;
  openedAt?: string;
  instanceIds: string[];
}
export interface Deck {
  deckId: string;
  name: string;
  ownerId: Owner;
  instanceIds: string[];
}
export type Zone = "deck" | "hand" | "battlefield" | "graveyard";
export interface MatchCard {
  id: string;
  definitionId: string;
  owner: Owner;
  zone: Zone;
  tapped: boolean;
  sick: boolean;
  damage: number;
  bonusAttack: number;
  bonusHealth: number;
  temporaryAttack: number;
  attachedTo?: string;
  deployed: boolean;
  recovered: boolean;
  token?: boolean;
}
export interface PlayerState {
  life: number;
  energy: number;
  temporaryEnergy: number;
  fatigue: number;
  deck: string[];
}
export type Phase = "UPKEEP" | "MAIN" | "ATTACK" | "BLOCK" | "MAIN2" | "END";
export interface GameEvent {
  type: string;
  sequence: number;
  timestamp: string;
  owner?: Owner;
  cardId?: string;
  sourceId?: string;
  details: string;
}
export type GameCommand = { actor: Owner } & (
  | { type: "PLAY_CARD"; cardId: string; targetId?: string }
  | { type: "EQUIP_ARTIFACT"; cardId: string; targetId: string }
  | { type: "DECLARE_ATTACKERS"; cardIds: string[] }
  | { type: "DECLARE_BLOCKERS"; assignments: Record<string, string> }
  | { type: "SELECT_TARGET"; targetId: string }
  | { type: "DISCARD"; cardId: string }
  | { type: "PASS_PHASE" }
  | { type: "END_TURN" }
  | { type: "CONCEDE" }
);
export interface PendingEffect {
  sourceId: string;
  owner: Owner;
  effect: Effect;
}
export interface GameState {
  matchId: string;
  seed: number;
  rngState: number;
  startedAt: string;
  turn: number;
  active: Owner;
  phase: Phase;
  status: "ACTIVE" | "FINISHED";
  winner?: Owner;
  result?: string;
  players: Record<Owner, PlayerState>;
  cards: Record<string, MatchCard>;
  attackers: string[];
  pending: PendingEffect[];
  events: GameEvent[];
  commands: GameCommand[];
}
export interface MatchSummary {
  matchId: string;
  winner: Owner;
  result: string;
  settledAt: string;
  seed: number;
  losses: string[];
  survivors: string[];
  recovered: string[];
  deployed: string[];
  captured?: string;
  game: GameState;
}
export interface Profile {
  version: 1;
  wallets: Record<Owner, { id: Owner; name: string }>;
  instances: Record<string, CardInstance>;
  packs: Pack[];
  decks: Deck[];
  serial: number;
  packSerial: number;
  rngState: number;
  activeMatch?: GameState;
  matches: MatchSummary[];
}
export const other = (owner: Owner): Owner =>
  owner === "human" ? "ai" : "human";
