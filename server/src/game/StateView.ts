import {
  PlayerView,
  CardView,
  CardInstance,
  CardFace,
  LineState,
  TurnPhase,
  getOpponentIndex,
} from "@compile/shared";
import { ServerGameState, lineValue } from "./GameEngine";

const MAX_VISIBLE_TRASH_CARDS = 14;

function maskCard(card: CardInstance, isOwner: boolean): CardView {
  if (isOwner || card.face === CardFace.FaceUp) return card;
  return { instanceId: card.instanceId, hidden: true };
}

function maskLine(
  line: LineState,
  isOwner: boolean
): LineState & { cards: CardView[] } {
  return { cards: line.cards.map((c) => maskCard(c, isOwner)) } as LineState & { cards: CardView[] };
}

export function buildPlayerView(
  state: ServerGameState,
  playerIndex: 0 | 1
): { view: PlayerView; turnPhase: TurnPhase } {
  const oi = getOpponentIndex(playerIndex);
  const player = state.players[playerIndex];
  const opponent = state.players[oi];
  const pending = state.effectQueue[0] ?? null;
  const ownTrashVisible = state.trashes[playerIndex].slice(-MAX_VISIBLE_TRASH_CARDS);
  const oppTrashVisible = state.trashes[oi].slice(-MAX_VISIBLE_TRASH_CARDS);

  const view: PlayerView = {
    id: player.id,
    username: player.username,
    protocols: player.protocols,
    hand: player.hand,
    deckSize: player.deckSize,
    trashSize: player.trashSize,
    trash: ownTrashVisible,
    isActivePlayer: state.activePlayerIndex === playerIndex,
    compilableLines: state.activePlayerIndex === playerIndex ? state.compilableLines : [],
    lines: [
      maskLine(player.lines[0], true),
      maskLine(player.lines[1], true),
      maskLine(player.lines[2], true),
    ] as PlayerView["lines"],
    hasControl: player.hasControl,
    opponentHandSize: opponent.hand.length,
    opponentDeckSize: opponent.deckSize,
    opponentTrashSize: opponent.trashSize,
    opponentTrash: oppTrashVisible,
    opponentLines: [
      maskLine(opponent.lines[0], false),
      maskLine(opponent.lines[1], false),
      maskLine(opponent.lines[2], false),
    ] as PlayerView["opponentLines"],
    opponentProtocols: opponent.protocols,
    opponentHasControl: opponent.hasControl,
    pendingEffect: pending?.ownerIndex === playerIndex ? pending : null,
    opponentPendingEffect: pending?.ownerIndex === oi ? pending : null,
    opponentHandRevealed: state.revealOpponentHandFor === playerIndex ? opponent.hand.slice() : null,
    opponentRevealedHandCard: state.revealHandCardFor?.viewerIndex === playerIndex
      ? (opponent.hand.find((c) => c.instanceId === state.revealHandCardFor!.cardId) ?? null)
      : null,
    ownRevealedTopDeckCard: state.revealTopDeckFor?.playerIndex === playerIndex
      ? state.revealTopDeckFor.card
      : null,
    pendingBonusPlay: state.pendingBonusPlay && state.activePlayerIndex === playerIndex
      ? state.pendingBonusPlay
      : null,
    lastTargetedInstanceId: state.lastTargetedInstanceId,
    pendingControlReorder: state.pendingControlReorder === playerIndex,
    lineValues: [lineValue(state, playerIndex, 0), lineValue(state, playerIndex, 1), lineValue(state, playerIndex, 2)],
    opponentLineValues: [lineValue(state, oi, 0), lineValue(state, oi, 1), lineValue(state, oi, 2)],
      effectStack: state.effectQueue.map((e) => ({
        id: e.id,
        cardDefId: e.cardDefId,
        cardName: e.cardName,
        type: e.type,
        description: e.description,
        ownerIndex: e.ownerIndex,
        trigger: e.trigger,
      })),
      compileDeniedThisTurn: state.compileDeniedThisTurn && state.activePlayerIndex === playerIndex,
  };

  return { view, turnPhase: state.turnPhase };
}
