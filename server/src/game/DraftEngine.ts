import {
  DraftState,
  ProtocolDef,
  PlayerState,
  ProtocolStatus,
  CardInstance,
  CardFace,
  GameMode,
} from "@compile/shared";
import { v4 as uuidv4 } from "uuid";
import { getCardsForProtocol, PROTOCOLS, MAIN_UNIT_1_IDS, MAIN_UNIT_2_IDS } from "../data/cards";

/** Pick order for a 3-protocol draft: [0,1,1,0,0,1] = player0 picks 1, then player1 picks 2, then player0 picks 2 */
const PICK_ORDER: Array<0 | 1> = [0, 1, 1, 0, 0, 1];

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function poolForMode(mode: GameMode): ProtocolDef[] {
  switch (mode) {
    case GameMode.MainUnit1:
      return PROTOCOLS.filter((p) => MAIN_UNIT_1_IDS.has(p.id));
    case GameMode.MainUnit2:
      return PROTOCOLS.filter((p) => MAIN_UNIT_2_IDS.has(p.id));
    case GameMode.Random9: {
      const all = PROTOCOLS.filter((p) => MAIN_UNIT_1_IDS.has(p.id) || MAIN_UNIT_2_IDS.has(p.id));
      return shuffle(all).slice(0, 9);
    }
    case GameMode.AllProtocols:
    default:
      return [...PROTOCOLS];
  }
}

export function createInitialDraftState(gameMode: GameMode = GameMode.AllProtocols): DraftState {
  return {
    availableProtocols: poolForMode(gameMode),
    picks: [],
    currentPickerIndex: PICK_ORDER[0],
    pickOrder: PICK_ORDER,
    done: false,
    gameMode,
  };
}

export function applyDraftPick(
  state: DraftState,
  playerIndex: 0 | 1,
  protocolId: string
): DraftState | { error: string } {
  if (state.done) return { error: "Draft is already done." };
  if (state.currentPickerIndex !== playerIndex)
    return { error: "It is not your pick." };
  if (!state.availableProtocols.find((p) => p.id === protocolId))
    return { error: "Protocol not available." };

  const picks = [...state.picks, { playerIndex, protocolId }];
  const remaining = state.availableProtocols.filter((p) => p.id !== protocolId);
  const nextPickIndex = picks.length;
  const done = nextPickIndex >= PICK_ORDER.length;

  return {
    availableProtocols: remaining,
    picks,
    currentPickerIndex: done ? 0 : PICK_ORDER[nextPickIndex],
    pickOrder: state.pickOrder,
    done,
    gameMode: state.gameMode,
  };
}

/** Build a shuffled 18-card deck from the 3 protocols the player drafted */
export function buildDeck(picks: Array<{ playerIndex: 0 | 1; protocolId: string }>, playerIndex: 0 | 1): CardInstance[] {
  const playerProtocols = picks
    .filter((p) => p.playerIndex === playerIndex)
    .map((p) => p.protocolId);

  const cards: CardInstance[] = [];
  for (const protocolId of playerProtocols) {
    for (const cardDef of getCardsForProtocol(protocolId)) {
      cards.push({ instanceId: uuidv4(), defId: cardDef.id, face: CardFace.FaceDown });
    }
  }
  return shuffle(cards);
}

/** Build the initial PlayerState after draft for one player */
export function buildPlayerState(
  socketId: string,
  username: string,
  picks: Array<{ playerIndex: 0 | 1; protocolId: string }>,
  playerIndex: 0 | 1
): PlayerState {
  const deck = buildDeck(picks, playerIndex);
  const hand = deck.splice(0, 5);
  const playerProtocols = picks
    .filter((p) => p.playerIndex === playerIndex)
    .map((p, i) => ({
      protocolId: p.protocolId,
      status: ProtocolStatus.Loading,
      lineIndex: i as 0 | 1 | 2,
    }));

  return {
    id: socketId,
    username,
    protocols: playerProtocols,
    hand,
    deckSize: deck.length,
    trashSize: 0,
    lines: [{ cards: [] }, { cards: [] }, { cards: [] }],
    hasControl: false,
  };
}

