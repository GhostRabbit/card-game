/**
 * Shared game logic helpers to reduce code duplication across server modules.
 * Extracted patterns: opponent index calculation, field traversal utilities,
 * passive effect scanning, etc.
 */

import { CardFace, CardInstance, GameState, PlayerState } from "./index";

// ─── Opponent Index ───────────────────────────────────────────────────────────

/**
 * Get the opponent's player index (0 → 1, 1 → 0).
 * Avoids the repeated pattern: `const oi = (1 - ownerIndex) as 0 | 1;`
 */
export function getOpponentIndex(playerIndex: 0 | 1): 0 | 1 {
  return (1 - playerIndex) as 0 | 1;
}

// ─── Field Traversal Utilities ────────────────────────────────────────────────

/**
 * Iterate over all cards in all lines for all players.
 * Callback receives: (card, playerIndex, lineIndex)
 */
export function forEachCardInField(
  state: GameState,
  callback: (card: CardInstance, playerIndex: 0 | 1, lineIndex: number) => void,
): void {
  for (let pi = 0; pi < state.players.length; pi++) {
    const player = state.players[pi];
    for (let li = 0; li < player.lines.length; li++) {
      const line = player.lines[li];
      for (const card of line.cards) {
        callback(card, pi as 0 | 1, li);
      }
    }
  }
}

/**
 * Iterate over face-up cards in all lines for all players.
 * Callback receives: (card, playerIndex, lineIndex)
 */
export function forEachFaceUpCardInField(
  state: GameState,
  callback: (card: CardInstance, playerIndex: 0 | 1, lineIndex: number) => void,
): void {
  forEachCardInField(state, (card, pi, li) => {
    if (card.face === CardFace.FaceUp) callback(card, pi, li);
  });
}

/**
 * Find the first card matching a predicate in any line.
 * Returns: { card, playerIndex, lineIndex } or null
 */
export function findCardInField(
  state: GameState,
  predicate: (card: CardInstance) => boolean,
): { card: CardInstance; playerIndex: 0 | 1; lineIndex: number } | null {
  for (let pi = 0; pi < state.players.length; pi++) {
    const player = state.players[pi];
    for (let li = 0; li < player.lines.length; li++) {
      const line = player.lines[li];
      const card = line.cards.find(predicate);
      if (card) return { card, playerIndex: pi as 0 | 1, lineIndex: li };
    }
  }
  return null;
}

/**
 * Find a card by instanceId in any line.
 * Returns: { card, playerIndex, lineIndex } or null
 */
export function findCardByInstanceId(
  state: GameState,
  instanceId: string,
): { card: CardInstance; playerIndex: 0 | 1; lineIndex: number } | null {
  return findCardInField(state, (c) => c.instanceId === instanceId);
}

/**
 * Check if a card with given instanceId is face-up in any line.
 */
export function isCardFaceUpInField(state: GameState, instanceId: string): boolean {
  return (
    findCardInField(
      state,
      (c) => c.instanceId === instanceId && c.face === CardFace.FaceUp,
    ) !== null
  );
}

/**
 * Find which line index a card instance is in for a given player.
 * Returns: line index (0-2) or -1 if not found
 */
export function findLineIndexForCard(
  state: GameState,
  playerIndex: 0 | 1,
  instanceId: string,
): number {
  const player = state.players[playerIndex];
  for (let li = 0; li < player.lines.length; li++) {
    if (player.lines[li].cards.some((c) => c.instanceId === instanceId)) {
      return li;
    }
  }
  return -1;
}

/**
 * Iterate over all cards in a specific line for a player.
 * Callback receives: (card)
 */
export function forEachCardInLine(
  state: GameState,
  playerIndex: 0 | 1,
  lineIndex: number,
  callback: (card: CardInstance) => void,
): void {
  if (lineIndex < 0 || lineIndex >= state.players[playerIndex].lines.length) {
    return;
  }
  for (const card of state.players[playerIndex].lines[lineIndex].cards) {
    callback(card);
  }
}

/**
 * Count cards in all lines matching a predicate.
 */
export function countCardsInField(
  state: GameState,
  predicate: (card: CardInstance) => boolean,
): number {
  let count = 0;
  forEachCardInField(state, (card) => {
    if (predicate(card)) count++;
  });
  return count;
}

/**
 * Count face-up cards in all lines.
 */
export function countFaceUpCardsInField(state: GameState): number {
  return countCardsInField(state, (c) => c.face === CardFace.FaceUp);
}

/**
 * Collect all face-up cards from all lines.
 */
export function getAllFaceUpCardsInField(state: GameState): CardInstance[] {
  const cards: CardInstance[] = [];
  forEachFaceUpCardInField(state, (card) => cards.push(card));
  return cards;
}

// ─── Line Utilities ───────────────────────────────────────────────────────────

/**
 * Iterate over all cards in a specific line across all players.
 * Callback receives: (card, playerIndex)
 */
export function forEachCardInLineAcrossPlayers(
  state: GameState,
  lineIndex: number,
  callback: (card: CardInstance, playerIndex: 0 | 1) => void,
): void {
  if (lineIndex < 0 || lineIndex >= 3) return;
  for (let pi = 0; pi < state.players.length; pi++) {
    const line = state.players[pi].lines[lineIndex];
    for (const card of line.cards) {
      callback(card, pi as 0 | 1);
    }
  }
}

/**
 * Count distinct protocol IDs across a specific line (all players).
 */
export function countDistinctProtocolsInLine(
  state: GameState,
  lineIndex: number,
  cardDefMap: Map<string, { protocolId?: string }>,
): number {
  const protocolIds = new Set<string>();
  forEachCardInLineAcrossPlayers(state, lineIndex, (card) => {
    const def = cardDefMap.get(card.defId);
    if (def?.protocolId) protocolIds.add(def.protocolId);
  });
  return protocolIds.size;
}

/**
 * Count distinct protocol IDs in all lines (all players).
 */
export function countDistinctProtocolsInField(
  state: GameState,
  cardDefMap: Map<string, { protocolId?: string }>,
): number {
  const protocolIds = new Set<string>();
  forEachCardInField(state, (card) => {
    const def = cardDefMap.get(card.defId);
    if (def?.protocolId) protocolIds.add(def.protocolId);
  });
  return protocolIds.size;
}

/**
 * Count cards in all lines matching a protocol ID.
 */
export function countCardsInFieldByProtocol(
  state: GameState,
  protocolId: string,
  cardDefMap: Map<string, { protocolId?: string }>,
): number {
  let count = 0;
  forEachCardInField(state, (card) => {
    const def = cardDefMap.get(card.defId);
    if (def?.protocolId === protocolId) count++;
  });
  return count;
}
