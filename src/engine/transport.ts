import type { GameCommand, GameEvent, GameState } from "./model";
/** Future transport carries commands to an authority, never arbitrary state patches.
 * Before remote use, add authenticated actors, revisions, hidden-information views,
 * replay validation and signed settlement. This interface does not provide security. */
export interface TransportAdapter {
  send(command: GameCommand): Promise<void>;
  subscribe(
    listener: (events: GameEvent[], state: GameState) => void,
  ): () => void;
}
