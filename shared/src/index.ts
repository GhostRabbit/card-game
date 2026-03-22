// ─── Enums ────────────────────────────────────────────────────────────────────

export enum TurnPhase {
  Start = "Start",
  CheckControl = "CheckControl",
  CheckCompile = "CheckCompile",
  CompileChoice = "CompileChoice",
  Action = "Action",
  EffectResolution = "EffectResolution",
  ClearCache = "ClearCache",
  End = "End",
}

export enum ProtocolStatus {
  Loading = "Loading",
  Compiled = "Compiled",
}

export enum CardFace {
  FaceUp = "FaceUp",
  FaceDown = "FaceDown",
}

export enum RoomPhase {
  Waiting = "waiting",
  Draft = "draft",
  Game = "game",
  Over = "over",
}

export enum ProtocolSet {
  MainUnit1 = "MainUnit1",
  MainUnit2 = "MainUnit2",
  Aux1 = "Aux1",
  Aux2 = "Aux2",
}

export enum DraftVariant {
  Full = "Full",
  Limited9 = "Limited9",
  Random3 = "Random3",
}

export interface LobbySettings {
  selectedProtocolSets: ProtocolSet[];
  draftVariant: DraftVariant;
}

// ─── Card & Protocol Data ─────────────────────────────────────────────────────

export interface CardEffect {
  trigger: "immediate" | "start" | "end" | "passive";
  description: string;
  /** Effect type tag used by CardEffects resolver */
  type: string;
  /** Generic payload for the resolver */
  payload?: Record<string, unknown>;
}

export interface CommandCardDef {
  id: string;
  name: string;
  value: number;
  protocolId: string; // which protocol this card belongs to
  effects: CardEffect[];
  flavourText?: string;
}

export interface ProtocolDef {
  id: string;
  name: string;
  description: string;
}

// ─── In-Play Card Instance ────────────────────────────────────────────────────

export interface CardInstance {
  instanceId: string;    // unique per card in play/hand/deck
  defId: string;         // CommandCardDef.id
  face: CardFace;
}

/** Sent to a player whose opponent owns this card and it's face-down */
export interface HiddenCard {
  instanceId: string;
  hidden: true;
}

export type CardView = CardInstance | HiddenCard;

// ─── Game State ───────────────────────────────────────────────────────────────

export interface LineState {
  /** Cards from bottom to top; index 0 = played first */
  cards: CardInstance[];
}

export interface PlayerState {
  id: string;
  username: string;
  protocols: Array<{
    protocolId: string;
    status: ProtocolStatus;
    lineIndex: number; // 0 | 1 | 2
  }>;
  hand: CardInstance[];
  deckSize: number;
  trashSize: number;
  lines: [LineState, LineState, LineState];
  hasControl: boolean;
}

/** What the server sends to each individual player (opponent cards masked) */
export interface PlayerView extends Omit<PlayerState, "hand"> {
  hand: CardInstance[];   // own hand — always revealed
  trash: CardInstance[];  // own discard pile — open information
  isActivePlayer: boolean; // true only for the player whose turn it currently is
  compilableLines: number[]; // line indices the active player MUST compile this turn
  opponentHandSize: number;
  opponentDeckSize: number;
  opponentTrash: CardInstance[];  // opponent discard pile — open information
  opponentLines: [LineState & { cards: CardView[] }, LineState & { cards: CardView[] }, LineState & { cards: CardView[] }];
  opponentProtocols: PlayerState["protocols"];
  opponentHasControl: boolean;
  /** Effect waiting for THIS player to click confirm, or null */
  pendingEffect: PendingEffect | null;
  /** Effect being resolved by the opponent (observer view), or null */
  opponentPendingEffect: PendingEffect | null;
  /** Non-null when opponent's hand has been revealed to this player this turn */
  opponentHandRevealed: CardInstance[] | null;
  /** Non-null when the opponent has revealed a specific hand card to this player */
  opponentRevealedHandCard: CardInstance | null;
  /** Non-null when this player has a bonus play available (from play_card / play_any_line) */
  pendingBonusPlay: { anyLine: boolean } | null;
  /** True when this player must resolve the control-reorder bonus (may skip) */
  pendingControlReorder: boolean;
  /** Server-computed line values (own lines, after passive modifiers) */
  lineValues: [number, number, number];
  /** Server-computed line values (opponent lines, after passive modifiers) */
  opponentLineValues: [number, number, number];
    /** True during the turn when this player's compile was denied by an opponent effect */
    compileDeniedThisTurn: boolean;
}

/** A single effect waiting for a player to confirm before it executes. */
export interface PendingEffect {
  id: string;
  cardDefId: string;
  cardName: string;
  type: string;
  description: string;
  ownerIndex: 0 | 1;
  trigger: "immediate" | "start" | "end";
  payload: Record<string, unknown>;
  /**
   * The instanceId of the card whose text generated this effect.
   * When set, the effect is cancelled if that card is no longer face-up in a
   * line at the time of execution (deleted, returned, flipped face-down, etc.).
   */
  sourceInstanceId?: string;
}

export interface GameState {
  players: [PlayerState, PlayerState];
  activePlayerIndex: 0 | 1;
  turnPhase: TurnPhase;
  turnNumber: number;
  /** Index of the line that was compiled this turn (if any) */
  compiledLineThisTurn: number | null;
  winner: string | null; // player id
}

// ─── Draft State ──────────────────────────────────────────────────────────────

export interface DraftState {
  availableProtocols: ProtocolDef[];
  picks: Array<{ playerIndex: 0 | 1; protocolId: string }>;
  currentPickerIndex: 0 | 1;
  pickOrder: Array<0 | 1>;
  done: boolean;
  lobbySettings: LobbySettings;
}

// ─── Socket Events ────────────────────────────────────────────────────────────

export interface ServerToClientEvents {
  room_created: (payload: { roomCode: string; playerIndex: 0 | 1 }) => void;
  room_joined: (payload: { roomCode: string; playerIndex: 0 | 1 }) => void;
  room_error: (payload: { message: string }) => void;
  game_starting: (payload: { draftState: DraftState }) => void;
  draft_updated: (payload: { draftState: DraftState }) => void;
  draft_done: (payload: { draftState: DraftState }) => void;
  state_sync: (payload: { view: PlayerView; turnPhase: TurnPhase }) => void;
  action_rejected: (payload: { reason: string }) => void;
  game_over: (payload: { winnerUsername: string }) => void;
  opponent_disconnected: () => void;
}

export interface ClientToServerEvents {
  create_room: (payload: { username: string; lobbySettings?: LobbySettings }) => void;
  join_room: (payload: { username: string; roomCode: string }) => void;
  draft_pick: (payload: { protocolId: string }) => void;
  play_card: (payload: {
    instanceId: string;
    face: CardFace;
    lineIndex: number;
  }) => void;
  compile_line: (payload: { lineIndex: number }) => void;
  resolve_effect: (payload: { id: string; targetInstanceId?: string; newProtocolOrder?: string[]; swapProtocolIds?: string[]; targetLineIndex?: number; discardInstanceId?: string }) => void;
  refresh: () => void;
  resolve_control_reorder: (payload: { whose?: "self" | "opponent"; newProtocolOrder?: string[] }) => void;
}
