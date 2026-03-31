import {
  DraftState,
  ProtocolDef,
  PlayerState,
  ProtocolStatus,
  CardInstance,
  CardFace,
  DraftVariant,
  FirstPlayerChoice,
  LobbySettings,
  ProtocolSet,
} from "@compile/shared";
import { v4 as uuidv4 } from "uuid";
import {
  getCardsForProtocol,
  PROTOCOLS,
} from "../data/cards";

/** Pick order for a 3-protocol draft: [0,1,1,0,0,1] = player0 picks 1, then player1 picks 2, then player0 picks 2 */
const PICK_ORDER: Array<0 | 1> = [0, 1, 1, 0, 0, 1];

export const DEFAULT_LOBBY_SETTINGS: LobbySettings = {
  selectedProtocolSets: [
    ProtocolSet.MainUnit1,
    ProtocolSet.MainUnit2,
    ProtocolSet.Aux1,
    ProtocolSet.Aux2,
  ],
  draftVariant: DraftVariant.Limited9,
  firstPlayerChoice: FirstPlayerChoice.Random,
};

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function protocolMatchesSelectedSets(protocol: ProtocolDef, selectedSets: Set<ProtocolSet>): boolean {
  return selectedSets.has(protocol.set);
}

export function normalizeLobbySettings(input?: LobbySettings): LobbySettings {
  const selected = new Set<ProtocolSet>(input?.selectedProtocolSets ?? DEFAULT_LOBBY_SETTINGS.selectedProtocolSets);
  if (!selected.has(ProtocolSet.MainUnit1) && !selected.has(ProtocolSet.MainUnit2)) {
    selected.add(ProtocolSet.MainUnit1);
  }

  return {
    selectedProtocolSets: [
      ProtocolSet.MainUnit1,
      ProtocolSet.MainUnit2,
      ProtocolSet.Aux1,
      ProtocolSet.Aux2,
    ].filter((s) => selected.has(s)),
    draftVariant: input?.draftVariant ?? DEFAULT_LOBBY_SETTINGS.draftVariant,
    firstPlayerChoice: input?.firstPlayerChoice ?? DEFAULT_LOBBY_SETTINGS.firstPlayerChoice,
  };
}

function poolForSettings(settings: LobbySettings): ProtocolDef[] {
  const selectedSets = new Set(settings.selectedProtocolSets);
  const base = PROTOCOLS.filter((p) => protocolMatchesSelectedSets(p, selectedSets));
  if (settings.draftVariant === DraftVariant.Limited9) {
    return shuffle(base).slice(0, 9);
  }
  return base;
}

export function createInitialDraftState(lobbySettings?: LobbySettings): DraftState {
  const normalized = normalizeLobbySettings(lobbySettings);
  return {
    availableProtocols: poolForSettings(normalized),
    picks: [],
    currentPickerIndex: PICK_ORDER[0],
    pickOrder: PICK_ORDER,
    done: false,
    lobbySettings: normalized,
  };
}

export function createRandomThreeDraftState(lobbySettings?: LobbySettings): DraftState | { error: string } {
  const normalized = normalizeLobbySettings(lobbySettings);
  const selectedSets = new Set(normalized.selectedProtocolSets);
  const pool = PROTOCOLS.filter((p) => protocolMatchesSelectedSets(p, selectedSets));

  if (pool.length < 6) {
    return { error: "Selected protocol sets do not contain enough protocols for Random 3." };
  }

  const chosen = shuffle(pool).slice(0, 6);
  const picks: DraftState["picks"] = [
    { playerIndex: 0, protocolId: chosen[0].id },
    { playerIndex: 0, protocolId: chosen[1].id },
    { playerIndex: 0, protocolId: chosen[2].id },
    { playerIndex: 1, protocolId: chosen[3].id },
    { playerIndex: 1, protocolId: chosen[4].id },
    { playerIndex: 1, protocolId: chosen[5].id },
  ];

  return {
    availableProtocols: [],
    picks,
    currentPickerIndex: 0,
    pickOrder: PICK_ORDER,
    done: true,
    lobbySettings: normalized,
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
    lobbySettings: state.lobbySettings,
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

