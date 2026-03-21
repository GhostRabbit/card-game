import { CardInstance, CardFace, GameState, PendingEffect, PlayerState, TurnPhase } from "@compile/shared";
import { v4 as uuidv4 } from "uuid";
import { CARD_MAP } from "../data/cards";
import { shuffle } from "./DraftEngine";
import { enqueueEffectsFromCard, executeEffect, enqueueEffectsOnCover } from "./CardEffects";

// ─── Internal full GameState (server-side, no masking) ───────────────────────

export interface ServerGameState extends GameState {
  /** Full deck arrays for each player (not exposed to clients) */
  decks: [CardInstance[], CardInstance[]];
  /** Full trash arrays */
  trashes: [CardInstance[], CardInstance[]];
  /** Line indices the active player can (and must) compile this turn */
  compilableLines: number[];
  /** Per-action event log buffer — flushed by Room after each action */
  pendingLogs: string[];
  /** Effects waiting for player confirmation before they execute */
  effectQueue: PendingEffect[];
  /** Tracks which turn-flow stage we paused at so we can resume correctly */
  effectQueueContext: "immediate" | "start" | "end" | null;
  /** When true the clear-cache discard at end of turn is skipped once */
  skipCheckCache: boolean;
  /** When true the active player cannot compile this turn (consumed once) */
  denyCompile: boolean;
  /** When set, that player index can see the full opponent hand this turn */
  revealOpponentHandFor: 0 | 1 | null;
  /** When set, the specified viewer can see one specific hand card of the opponent */
  revealHandCardFor: { viewerIndex: 0 | 1; cardId: string } | null;
  /** When set, the active player has a bonus card play (from play_card / play_any_line) */
  pendingBonusPlay: { anyLine: boolean } | null;
  /** The instanceId of the last card targeted by a flip or similar targeting effect this turn */
  lastTargetedInstanceId: string | null;
  /** Cards saved from compile deletion via on_compile_delete_shift_self — cleared each compile */
  compileSavedCards: { card: CardInstance; ownerIndex: 0 | 1 }[];
  /**
   * When set, this player used control on a compile/refresh and must now
   * choose to reorder own or opponent protocols (or skip). Cleared once resolved.
   */
  pendingControlReorder: 0 | 1 | null;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createServerGameState(
  players: [PlayerState, PlayerState],
  decks: [CardInstance[], CardInstance[]]
): ServerGameState {
  return {
    players,
    decks,
    trashes: [[], []],
    compilableLines: [],
    pendingLogs: [],
    effectQueue: [],
    effectQueueContext: null,
    skipCheckCache: false,
    denyCompile: false,
    revealOpponentHandFor: null,
    revealHandCardFor: null,
    pendingBonusPlay: null,
    lastTargetedInstanceId: null,
    compileSavedCards: [],
    pendingControlReorder: null,
    activePlayerIndex: 0,
    turnPhase: TurnPhase.Start,
    turnNumber: 1,
    compiledLineThisTurn: null,
    winner: null,
  };
}

// ─── Value helpers ────────────────────────────────────────────────────────────

export const FACE_DOWN_VALUE = 2;

/**
 * Compute the effective line value for `playerIndex`'s line `lineIndex`,
 * applying any passive value-modifier effects from face-up cards in that line.
 *
 * Passive effects handled here:
 *   - `value_bonus_per_facedown`  (apy_0): +1 per face-down card in the line
 *   - `facedown_value_override`   (drk_2): each face-down card counts as payload.value instead of 2
 *   - `reduce_opponent_value`     (mtl_0): opponent's total reduced by payload.amount
 *                                           (applied when computing the *opponent's* value for this line)
 */
export function lineValue(state: ServerGameState, playerIndex: 0 | 1, lineIndex: number): number {
  const cards = state.players[playerIndex].lines[lineIndex].cards;
  const oi = (1 - playerIndex) as 0 | 1;
  const oppCards = state.players[oi].lines[lineIndex].cards;

  // Gather passive modifiers from the player's own face-up cards in this line
  let bonusPerFaceDown = 0;
  let faceDownOverride: number | null = null;
  for (const card of cards) {
    if (card.face !== CardFace.FaceUp) continue;
    const def = CARD_MAP.get(card.defId);
    if (!def) continue;
    for (const effect of def.effects) {
      if (effect.trigger !== "passive") continue;
      if (effect.type === "value_bonus_per_facedown") bonusPerFaceDown += 1;
      if (effect.type === "facedown_value_override") {
        const v = typeof effect.payload?.value === "number" ? effect.payload.value : FACE_DOWN_VALUE;
        faceDownOverride = faceDownOverride === null ? v : Math.max(faceDownOverride, v);
      }
    }
  }

  // Base sum
  const faceDownVal = faceDownOverride ?? FACE_DOWN_VALUE;
  const faceDownCount = cards.filter((c) => c.face === CardFace.FaceDown).length;
  let total = cards.reduce((sum, c) => {
    if (c.face === CardFace.FaceDown) return sum + faceDownVal;
    const def = CARD_MAP.get(c.defId);
    return sum + (def?.value ?? 0);
  }, 0);

  // value_bonus_per_facedown
  total += bonusPerFaceDown * faceDownCount;

  // reduce_opponent_value — applied by the *opponent*'s cards against this player's total
  for (const oppCard of oppCards) {
    if (oppCard.face !== CardFace.FaceUp) continue;
    const def = CARD_MAP.get(oppCard.defId);
    if (!def) continue;
    for (const effect of def.effects) {
      if (effect.trigger === "passive" && effect.type === "reduce_opponent_value") {
        const amount = typeof effect.payload?.amount === "number" ? effect.payload.amount : 0;
        total -= amount;
      }
    }
  }

  return total;
}

// ─── Passive deny helpers ─────────────────────────────────────────────────────

/**
 * Check whether any face-up opponent cards in `playerIndex`'s target line (or
 * globally) deny the intended play.
 *
 * Returns a human-readable reason string if the play is denied, otherwise null.
 *
 * Passive effects handled:
 *   - `deny_play_in_line`  (plg_0): opponent cannot play any card in this line
 *   - `deny_facedown`      (mtl_2): opponent cannot play face-down in this line
 *   - `deny_faceup`        (psy_1): opponent cannot play face-up anywhere
 */
function checkPlayDenials(
  state: ServerGameState,
  playerIndex: 0 | 1,
  lineIndex: number,
  face: CardFace,
): string | null {
  const oi = (1 - playerIndex) as 0 | 1;

  // Line-scoped denials: check the opponent's cards in the SAME line
  for (const card of state.players[oi].lines[lineIndex].cards) {
    if (card.face !== CardFace.FaceUp) continue;
    const def = CARD_MAP.get(card.defId);
    if (!def) continue;
    for (const effect of def.effects) {
      if (effect.trigger !== "passive") continue;
      if (effect.type === "deny_play_in_line")
        return "An opponent card prevents playing in this line.";
      if (effect.type === "deny_facedown" && face === CardFace.FaceDown)
        return "An opponent card prevents playing face-down in this line.";
    }
  }

  // Global denial: deny_faceup — check all opponent lines
  if (face === CardFace.FaceUp) {
    for (const line of state.players[oi].lines) {
      for (const card of line.cards) {
        if (card.face !== CardFace.FaceUp) continue;
        const def = CARD_MAP.get(card.defId);
        if (!def) continue;
        for (const effect of def.effects) {
          if (effect.trigger === "passive" && effect.type === "deny_faceup")
            return "An opponent card forces you to play face-down only.";
        }
      }
    }
  }

  return null;
}

// ─── Draw ─────────────────────────────────────────────────────────────────────

export function drawCards(state: ServerGameState, playerIndex: 0 | 1, amount: number): void {
  const player = state.players[playerIndex];
  const deck = state.decks[playerIndex];
  const trash = state.trashes[playerIndex];

  for (let i = 0; i < amount; i++) {
    if (deck.length === 0) {
      if (trash.length === 0) break; // nothing left
      const reshuffled = shuffle(trash.splice(0));
      reshuffled.forEach((c) => (c.face = CardFace.FaceDown)); // back in deck = face-down
      deck.push(...reshuffled);
      player.trashSize = 0;
    }
    const card = deck.shift()!;
    card.face = CardFace.FaceUp; // hand cards are always face-up for their owner
    player.hand.push(card);
    state.pendingLogs.push(`  DRAW P${playerIndex}: drew ${card.defId} (hand now ${player.hand.length})`);
  }
  player.deckSize = deck.length;
}

// ─── Discard helpers ──────────────────────────────────────────────────────────

export function discardFromHand(state: ServerGameState, playerIndex: 0 | 1, amount: number): void {
  const player = state.players[playerIndex];
  const trash = state.trashes[playerIndex];
  const toDiscard = Math.min(amount, player.hand.length);
  const discarded = player.hand.splice(player.hand.length - toDiscard, toDiscard);
  discarded.forEach((c) => (c.face = CardFace.FaceUp)); // discard pile is always face-up
  trash.push(...discarded);
  player.trashSize = trash.length;
}

// ─── Compile helper ───────────────────────────────────────────────────────────

function compileLine(state: ServerGameState, playerIndex: 0 | 1, lineIndex: number): void {
  const pi = playerIndex;
  const oi = (1 - pi) as 0 | 1;
  const player = state.players[pi];
  const opponent = state.players[oi];

  // Reset compile-saved cards and extract any on_compile_delete_shift_self cards before trashing
  state.compileSavedCards = [];
  for (const lpi of [pi, oi] as (0 | 1)[]) {
    const lineCards = state.players[lpi].lines[lineIndex].cards;
    const removeIdx: number[] = [];
    for (let i = 0; i < lineCards.length; i++) {
      const def = CARD_MAP.get(lineCards[i].defId);
      if (def?.effects.some((e) => e.trigger === "passive" && e.type === "on_compile_delete_shift_self")) {
        removeIdx.push(i);
        state.compileSavedCards.push({ card: lineCards[i], ownerIndex: lpi });
        state.effectQueue.push({
          id: uuidv4(), cardDefId: def.id, cardName: def.name,
          type: "on_compile_delete_shift_self",
          description: "Shift this card, even if covered.",
          ownerIndex: lpi, trigger: "immediate",
          payload: { savedInstanceId: lineCards[i].instanceId },
        });
      }
    }
    for (let i = removeIdx.length - 1; i >= 0; i--) lineCards.splice(removeIdx[i], 1);
  }

  // Trash both sides of the line (cards go face-up — discard pile is open info)
  const ownCards = player.lines[lineIndex].cards.splice(0);
  const oppCards = opponent.lines[lineIndex].cards.splice(0);
  ownCards.forEach((c) => (c.face = CardFace.FaceUp));
  oppCards.forEach((c) => (c.face = CardFace.FaceUp));
  state.trashes[pi].push(...ownCards);
  state.trashes[oi].push(...oppCards);
  player.trashSize = state.trashes[pi].length;
  opponent.trashSize = state.trashes[oi].length;

  // Flip protocol
  const proto = player.protocols.find((p) => p.lineIndex === lineIndex);
  const isRecompile = proto?.status === "Compiled";
  if (proto) proto.status = "Compiled" as any;

  // Recompile bonus: take top card of opponent's deck
  if (isRecompile && state.decks[oi].length > 0) {
    const stolen = state.decks[oi].shift()!;
    stolen.face = CardFace.FaceUp;
    player.hand.push(stolen);
    opponent.deckSize = state.decks[oi].length;
    player.deckSize = state.decks[pi].length; // unchanged but keep consistent
  }

  state.compiledLineThisTurn = lineIndex;
}

// ─── Turn Phase Processor ─────────────────────────────────────────────────────

/** Advance through CheckControl and CheckCompile, then set Action or CompileChoice.
 *  Called after start effects (if any) have been resolved. */
export function processAutoPhases(state: ServerGameState): void {
  const pi = state.activePlayerIndex;
  state.turnPhase = TurnPhase.CheckControl;

  // ── CHECK CONTROL ──────────────────────────────────────────────────────────
  // Control is sticky: only the active player can take control this turn.
  // If they lead 2+ lines they gain it (and opponent loses it); otherwise no change.
  const oi = (1 - pi) as 0 | 1;
  let linesLed = 0;
  for (let li = 0; li < 3; li++) {
    const ownVal = lineValue(state, pi, li);
    const oppVal = lineValue(state, oi, li);
    if (ownVal > oppVal) linesLed++;
  }
  if (linesLed >= 2) {
    state.players[pi].hasControl = true;
    state.players[oi].hasControl = false;
  }
  state.turnPhase = TurnPhase.CheckCompile;

  // ── CHECK COMPILE ───────────────────────────────────────────────────────────
  state.compiledLineThisTurn = null;
  state.compilableLines = [];
  state.turnPhase = TurnPhase.CheckCompile;
  if (state.denyCompile) {
    state.denyCompile = false;
    state.pendingLogs.push("  deny_compile: opponent compile denied this turn");
  } else {
    for (let li = 0; li < 3; li++) {
      const ownVal = lineValue(state, pi, li);
      const oppVal = lineValue(state, oi, li);
      if (ownVal >= 10 && ownVal > oppVal) {
        state.compilableLines.push(li);
      }
    }
  }

  // ── WIN CHECK ─────────────────────────────────────────────────────────────
  if (state.players[pi].protocols.every((p) => p.status === "Compiled")) {
    state.winner = state.players[pi].id;
  }

  // If compile is available, the player must choose — compile IS their action
  if (state.compilableLines.length > 0) {
    state.turnPhase = TurnPhase.CompileChoice;
  } else {
    state.turnPhase = TurnPhase.Action;
  }
}

/** Called after the active player takes their Action (play or refresh).
 *  Runs ClearCache, enqueues End effects, then pauses or advances the turn. */
export function endTurn(state: ServerGameState): void {
  const pi = state.activePlayerIndex;

  // ── CLEAR CACHE ─────────────────────────────────────────────────────────
  state.turnPhase = TurnPhase.ClearCache;
  if (state.skipCheckCache) {
    state.skipCheckCache = false;
    state.pendingLogs.push("  skip_check_cache: clear-cache discard skipped");
  } else {
    const over5 = state.players[pi].hand.length - 5;
    if (over5 > 0) discardFromHand(state, pi, over5);
  }
  // Trigger after_clear_cache_draw passives (fires whether or not a discard occurred)
  for (const line of state.players[pi].lines) {
    for (const card of line.cards) {
      if (card.face !== CardFace.FaceUp) continue;
      const def = CARD_MAP.get(card.defId);
      if (!def) continue;
      for (const eff of def.effects) {
        if (eff.trigger === "passive" && eff.type === "after_clear_cache_draw") {
          const amount = typeof eff.payload?.amount === "number" ? eff.payload.amount : 1;
          state.pendingLogs.push(`  after_clear_cache_draw (${card.defId}): drawing ${amount}`);
          drawCards(state, pi, amount);
        }
      }
    }
  }

  // ── ENQUEUE END EFFECTS ─────────────────────────────────────────────────
  state.turnPhase = TurnPhase.End;
  for (const line of state.players[pi].lines) {
    for (const card of line.cards) {
      if (card.face === CardFace.FaceUp) {
        enqueueEffectsFromCard(state, pi, card.defId, "end", card.instanceId);
      }
    }
  }

  if (state.effectQueue.length > 0) {
    state.effectQueueContext = "end";
    state.turnPhase = TurnPhase.EffectResolution;
    return;
  }

  finishTurn(state);
}

/** Advance the turn counter, switch active player, enqueue Start effects.
 *  Pauses at EffectResolution if there are start effects to show, else
 *  calls processAutoPhases to continue to Action/CompileChoice. */
export function finishTurn(state: ServerGameState): void {
  state.revealOpponentHandFor = null;
  state.revealHandCardFor = null;
  state.pendingControlReorder = null;
  state.pendingBonusPlay = null;
  state.lastTargetedInstanceId = null;
  state.activePlayerIndex = (1 - state.activePlayerIndex) as 0 | 1;
  state.turnNumber++;
  state.turnPhase = TurnPhase.Start;

  const pi = state.activePlayerIndex;
  for (const line of state.players[pi].lines) {
    for (const card of line.cards) {
      if (card.face === CardFace.FaceUp) {
        enqueueEffectsFromCard(state, pi, card.defId, "start", card.instanceId);
      }
    }
  }

  if (state.effectQueue.length > 0) {
    state.effectQueueContext = "start";
    state.turnPhase = TurnPhase.EffectResolution;
    return;
  }

  processAutoPhases(state);
}

/** Pop the next effect from the queue and execute it. */
export function resolveNextEffect(state: ServerGameState, targetInstanceId?: string, newProtocolOrder?: string[], targetLineIndex?: number, discardInstanceId?: string): void {
  const effect = state.effectQueue.shift();
  if (!effect) return;
  if (targetInstanceId !== undefined) effect.payload.targetInstanceId = targetInstanceId;
  if (newProtocolOrder !== undefined) effect.payload.newProtocolOrder = newProtocolOrder;
  if (targetLineIndex !== undefined) effect.payload.targetLineIndex = targetLineIndex;
  if (discardInstanceId !== undefined) effect.payload.discardInstanceId = discardInstanceId;
  executeEffect(state, effect);
}

/** Called when the effect queue has just drained.
 *  Resumes the turn flow from wherever it was paused. */
export function continueAfterEffects(state: ServerGameState): void {
  const ctx = state.effectQueueContext;
  state.effectQueueContext = null;
  if (ctx === "immediate") {
    if (state.pendingBonusPlay) {
      // A bonus play was granted — stay in Action phase so the player can play one more card
      state.turnPhase = TurnPhase.Action;
      return;
    }
    endTurn(state);
  } else if (ctx === "end") {
    finishTurn(state);
  } else if (ctx === "start") {
    processAutoPhases(state);
  }
}

// ─── Action: Choose Compile ───────────────────────────────────────────────────

export function chooseCompile(
  state: ServerGameState,
  playerIndex: 0 | 1,
  lineIndex: number
): PlayCardResult {
  if (state.activePlayerIndex !== playerIndex)
    return { success: false, reason: "Not your turn." };
  if (state.turnPhase !== TurnPhase.CompileChoice)
    return { success: false, reason: "No compile pending." };
  if (!state.compilableLines.includes(lineIndex))
    return { success: false, reason: "That line is not eligible to compile." };

  compileLine(state, playerIndex, lineIndex);
  state.compilableLines = [];

  // Win check after compile
  const pi = playerIndex;
  if (state.players[pi].protocols.every((p) => p.status === "Compiled")) {
    state.winner = state.players[pi].id;
  }

  // Control bonus: player may reorder protocols before the turn ends
  if (state.players[playerIndex].hasControl) {
    state.players[0].hasControl = false;
    state.players[1].hasControl = false;
    state.pendingControlReorder = playerIndex;
    state.turnPhase = TurnPhase.EffectResolution;
    return { success: true };
  }

  endTurn(state);
  return { success: true };
}

// ─── Action: Play Card ────────────────────────────────────────────────────────

export interface PlayCardResult {
  success: boolean;
  reason?: string;
  pendingEffects?: string[]; // effect types that need client input (future use)
}

export function playCard(
  state: ServerGameState,
  playerIndex: 0 | 1,
  instanceId: string,
  face: CardFace,
  lineIndex: number
): PlayCardResult {
  if (state.activePlayerIndex !== playerIndex)
    return { success: false, reason: "Not your turn." };
  if (state.turnPhase !== TurnPhase.Action)
    return { success: false, reason: "Wrong phase." };
  if (lineIndex < 0 || lineIndex > 2)
    return { success: false, reason: "Invalid line index." };

  const player = state.players[playerIndex];
  const cardIdx = player.hand.findIndex((c) => c.instanceId === instanceId);
  if (cardIdx === -1)
    return { success: false, reason: "Card not in hand." };

  const card = player.hand[cardIdx];
  const def = CARD_MAP.get(card.defId);
  if (!def) return { success: false, reason: "Unknown card definition." };

  // Check passive deny effects from opponent's board before mutating any state
  const denialReason = checkPlayDenials(state, playerIndex, lineIndex, face);
  if (denialReason) return { success: false, reason: denialReason };

  // Consume bonus play if active
  const isBonusPlay = !!state.pendingBonusPlay;
  const anyLineBonusPlay = isBonusPlay && state.pendingBonusPlay!.anyLine;
  if (isBonusPlay) state.pendingBonusPlay = null;

  // Face-up cards must match the line's protocol (waived for play_any_line bonus)
  if (face === CardFace.FaceUp && !anyLineBonusPlay) {
    const lineProtocol = player.protocols.find((p) => p.lineIndex === lineIndex);
    if (!lineProtocol || lineProtocol.protocolId !== def.protocolId)
      return { success: false, reason: "Card protocol does not match this line." };
  }

  // Move card from hand to line
  player.hand.splice(cardIdx, 1);
  card.face = face;
  const prevTopOnLine = player.lines[lineIndex].cards.length > 0
    ? player.lines[lineIndex].cards[player.lines[lineIndex].cards.length - 1]
    : null;
  player.lines[lineIndex].cards.push(card);
  if (prevTopOnLine) enqueueEffectsOnCover(state, prevTopOnLine, playerIndex);

  // Enqueue immediate effects if face-up — player must confirm each one
  if (face === CardFace.FaceUp) {
    enqueueEffectsFromCard(state, playerIndex, def.id, "immediate", card.instanceId);
  }

  if (state.effectQueue.length > 0) {
    state.effectQueueContext = "immediate";
    state.turnPhase = TurnPhase.EffectResolution;
    return { success: true };
  }

  endTurn(state);
  return { success: true };
}

// ─── Action: Refresh ─────────────────────────────────────────────────────────

export function refresh(state: ServerGameState, playerIndex: 0 | 1): PlayCardResult {
  if (state.activePlayerIndex !== playerIndex)
    return { success: false, reason: "Not your turn." };
  if (state.turnPhase !== TurnPhase.Action)
    return { success: false, reason: "Wrong phase." };

  const player = state.players[playerIndex];
  const needed = 5 - player.hand.length;
  if (needed > 0) drawCards(state, playerIndex, needed);

  // Control bonus: player may reorder protocols before the turn ends
  if (state.players[playerIndex].hasControl) {
    state.players[0].hasControl = false;
    state.players[1].hasControl = false;
    state.pendingControlReorder = playerIndex;
    state.turnPhase = TurnPhase.EffectResolution;
    return { success: true };
  }

  endTurn(state);
  return { success: true };
}

// ─── Action: Resolve Control Reorder ─────────────────────────────────────────

/**
 * Called after a compile/refresh that consumed the control token.
 * `whose` and `newProtocolOrder` are optional — omitting them (or sending
 * mismatched data) means the player skips the reorder bonus.
 */
export function resolveControlReorder(
  state: ServerGameState,
  playerIndex: 0 | 1,
  whose?: "self" | "opponent",
  newProtocolOrder?: string[]
): PlayCardResult {
  if (state.pendingControlReorder !== playerIndex)
    return { success: false, reason: "No control reorder pending for you." };

  if (whose && newProtocolOrder && newProtocolOrder.length === 3) {
    const targetIndex = whose === "self" ? playerIndex : ((1 - playerIndex) as 0 | 1);
    const protocols = state.players[targetIndex].protocols;
    const existingIds = protocols.map((p) => p.protocolId).sort();
    const valid =
      JSON.stringify([...newProtocolOrder].sort()) === JSON.stringify(existingIds);
    if (valid) {
      for (let i = 0; i < 3; i++) {
        const proto = protocols.find((p) => p.protocolId === newProtocolOrder[i]);
        if (proto) proto.lineIndex = i as 0 | 1 | 2;
      }
      state.pendingLogs.push(`  control_reorder: P${playerIndex} reordered ${whose} protocols [${newProtocolOrder.join(", ")}]`);
    }
  } else {
    state.pendingLogs.push(`  control_reorder: P${playerIndex} skipped`);
  }

  state.pendingControlReorder = null;
  endTurn(state);
  return { success: true };
}
