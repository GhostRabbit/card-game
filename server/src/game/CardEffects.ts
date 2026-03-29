import { CardFace, CardInstance, PendingEffect } from "@compile/shared";
import { v4 as uuidv4 } from "uuid";
import { CARD_MAP } from "../data/cards";
import { ServerGameState, drawCards, discardFromHand, FACE_DOWN_VALUE, lineValue } from "./GameEngine";
import { shuffle } from "./DraftEngine";

// ─── Whitelist of stub effect types that are known but not yet implemented ────

const KNOWN_STUB_TYPES = new Set<string>([
  "ocr_unimplemented",
]);

/**
 * Push one PendingEffect item onto state.effectQueue for every non-passive
 * effect on the card that matches the requested trigger.
 * Nothing executes here — each effect is deferred until the player confirms it.
 */
export function enqueueEffectsFromCard(
  state: ServerGameState,
  ownerIndex: 0 | 1,
  cardDefId: string,
  trigger: "immediate" | "start" | "end",
  sourceInstanceId?: string
): void {
  const def = CARD_MAP.get(cardDefId);
  if (!def) return;

  for (const effect of def.effects) {
    if (effect.trigger !== trigger) continue;
    if (effect.type === "passive") continue;

    state.effectQueue.push({
      id: uuidv4(),
      cardDefId,
      cardName: def.name,
      type: effect.type,
      description: effect.description,
      ownerIndex,
      trigger,
      payload: effect.payload ?? {},
      sourceInstanceId,
    });
  }
}

/**
 * Returns true if the card with `instanceId` is covered (i.e. another card sits
 * on top of it in the same line — it is NOT the last element of its line array).
 * Cards are stored bottom→top, so any card at index < line.length-1 is covered.
 */
export function isCardCovered(state: ServerGameState, instanceId: string): boolean {
  for (let pi = 0; pi < 2; pi++) {
    for (const line of state.players[pi].lines) {
      const idx = line.cards.findIndex((c) => c.instanceId === instanceId);
      if (idx !== -1) return idx < line.cards.length - 1;
    }
  }
  return false;
}

/**
 * When a card is flipped face-up, enqueue its immediate effects.
 *
 * - If the card is UNCOVERED (not covered by another card above it): all non-passive
 *   immediate effects fire.
 * - If the card is COVERED (another card sits on top): only the FIRST immediate effect
 *   (top position) fires; mid/bot effects are suppressed.
 *
 * This mirrors the rule: "top text becomes active; mid/bot text only activates when uncovered."
 */
export function enqueueEffectsOnFlipFaceUp(
  state: ServerGameState,
  ownerIndex: 0 | 1,
  flippedCard: CardInstance,
): void {
  const def = CARD_MAP.get(flippedCard.defId);
  if (!def) return;

  const isCovered = isCardCovered(state, flippedCard.instanceId);
  const immediates = def.effects.filter((e) => e.trigger === "immediate");

  const toQueue = isCovered ? immediates.slice(0, 1) : immediates;

  for (const eff of toQueue) {
    state.effectQueue.push({
      id: uuidv4(),
      cardDefId: flippedCard.defId,
      cardName: def.name,
      type: eff.type,
      description: eff.description,
      ownerIndex,
      trigger: "immediate",
      payload: eff.payload ?? {},
      sourceInstanceId: flippedCard.instanceId,
    });
  }
}

/**
 * When a card becomes uncovered (the card on top of it is removed by delete,
 * return, shift, or any other means), enqueue the mid/bot immediate effects that
 * were suppressed while the card was covered.
 *
 * The top effect (index 0 of immediates) already fired when the card was first
 * played or flipped face-up, so only immediates[1+] are queued here.
 */
export function enqueueEffectsOnUncover(
  state: ServerGameState,
  ownerIndex: 0 | 1,
  uncoveredCard: CardInstance,
): void {
  const def = CARD_MAP.get(uncoveredCard.defId);
  if (!def) return;

  const immediates = def.effects.filter((e) => e.trigger === "immediate");
  // Skip index 0 — that fired on play/flip. Queue everything after.
  for (const eff of immediates.slice(1)) {
    state.effectQueue.push({
      id: uuidv4(),
      cardDefId: uncoveredCard.defId,
      cardName: def.name,
      type: eff.type,
      description: eff.description,
      ownerIndex,
      trigger: "immediate",
      payload: eff.payload ?? {},
      sourceInstanceId: uncoveredCard.instanceId,
    });
  }
}

/**
 * When a card becomes covered (a new card is placed on top of it), check for
 * passive on-cover effects and enqueue them before any effects from the covering card.
 * Only face-up cards can have active passives.
 */
export function enqueueEffectsOnCover(
  state: ServerGameState,
  coveredCard: CardInstance,
  ownerIndex: 0 | 1,
): void {
  if (coveredCard.face !== CardFace.FaceUp) return;
  const def = CARD_MAP.get(coveredCard.defId);
  if (!def) return;

  for (const effect of def.effects) {
    if (effect.trigger !== "passive") continue;
    switch (effect.type) {
      case "on_covered": {
        // fir_0: draw 1, then flip 1 other card (interactive)
        state.effectQueue.push({
          id: uuidv4(), cardDefId: coveredCard.defId, cardName: def.name,
          type: "draw", description: "Draw 1 card.",
          ownerIndex, trigger: "immediate", payload: { amount: 1 },
          sourceInstanceId: coveredCard.instanceId,
        });
        state.effectQueue.push({
          id: uuidv4(), cardDefId: coveredCard.defId, cardName: def.name,
          type: "flip", description: "Flip 1 other card.",
          ownerIndex, trigger: "immediate", payload: { targets: "any_card" },
          sourceInstanceId: coveredCard.instanceId,
        });
        break;
      }
      case "on_covered_flip_self": {
        // apy_2: flip self when covered (reuse flip_self handler)
        state.effectQueue.push({
          id: uuidv4(), cardDefId: coveredCard.defId, cardName: def.name,
          type: "flip_self", description: effect.description,
          ownerIndex, trigger: "immediate", payload: {},
          sourceInstanceId: coveredCard.instanceId,
        });
        break;
      }
      case "on_covered_delete_self":
      case "on_covered_delete_lowest":
      case "on_covered_deck_to_other_line": {
        state.effectQueue.push({
          id: uuidv4(), cardDefId: coveredCard.defId, cardName: def.name,
          type: effect.type, description: effect.description,
          ownerIndex, trigger: "immediate",
          payload: { ...(effect.payload ?? {}) },
          sourceInstanceId: coveredCard.instanceId,
        });
        break;
      }
      case "on_covered_draw": {
        state.effectQueue.push({
          id: uuidv4(), cardDefId: coveredCard.defId, cardName: def.name,
          type: "draw", description: effect.description,
          ownerIndex, trigger: "immediate",
          payload: { amount: (effect.payload?.amount as number) ?? 1 },
          sourceInstanceId: coveredCard.instanceId,
        });
        break;
      }
      case "on_covered_or_flip_delete_self": {
        // mtl_6: covered → delete self (reuse on_covered_delete_self handler)
        state.effectQueue.push({
          id: uuidv4(), cardDefId: coveredCard.defId, cardName: def.name,
          type: "on_covered_delete_self", description: effect.description,
          ownerIndex, trigger: "immediate", payload: {},
          sourceInstanceId: coveredCard.instanceId,
        });
        break;
      }
    }
  }
}

// ─── Deck-to-line helpers ──────────────────────────────────────────────────

/**
 * Scan a player's face-up line cards for a specific passive type and return
 * all matching cards with their numeric `payload.amount` (defaulting to 1).
 */
function scanPassives(
  state: ServerGameState,
  ownerIndex: 0 | 1,
  passiveType: string,
): { card: CardInstance; amount: number }[] {
  const results: { card: CardInstance; amount: number }[] = [];
  for (const line of state.players[ownerIndex].lines) {
    for (const card of line.cards) {
      if (card.face !== CardFace.FaceUp) continue;
      const def = CARD_MAP.get(card.defId);
      if (!def) continue;
      for (const eff of def.effects) {
        if (eff.trigger === "passive" && eff.type === passiveType) {
          const amount = typeof eff.payload?.amount === "number" ? eff.payload.amount : 1;
          results.push({ card, amount });
        }
      }
    }
  }
  return results;
}

/**
 * Take the top card from a player's deck (reshuffles trash if empty).
 * Use for draw-style effects.
 * Returns null if both deck and trash are empty.
 */
function takeDeckCard(
  state: ServerGameState,
  playerIndex: 0 | 1,
  log: (msg: string) => void,
): CardInstance | null {
  const deck = state.decks[playerIndex];
  const trash = state.trashes[playerIndex];
  if (deck.length === 0) {
    if (trash.length === 0) {
      log("deck/trash empty — cannot take card from deck");
      return null;
    }
    const reshuffled = shuffle(trash.splice(0));
    reshuffled.forEach((c) => (c.face = CardFace.FaceDown));
    deck.push(...reshuffled);
    state.players[playerIndex].trashSize = 0;
  }
  const drawn = deck.shift()!;
  state.players[playerIndex].deckSize = deck.length;
  return drawn;
}

/**
 * Take the top card from a player's deck without reshuffling trash.
 * Use for non-draw effects that play/reveal/discard top-deck cards.
 */
function takeTopDeckCardNoReshuffle(
  state: ServerGameState,
  playerIndex: 0 | 1,
  log: (msg: string) => void,
): CardInstance | null {
  const deck = state.decks[playerIndex];
  if (deck.length === 0) {
    log("deck empty — cannot take top card");
    return null;
  }
  const drawn = deck.shift()!;
  state.players[playerIndex].deckSize = deck.length;
  return drawn;
}

/**
 * Take the top card from a player's deck and push it face-down onto a line.
 */
function pushDeckCardFaceDown(
  state: ServerGameState,
  playerIndex: 0 | 1,
  targetLine: { cards: CardInstance[] },
  log: (msg: string) => void,
): void {
  const drawn = takeTopDeckCardNoReshuffle(state, playerIndex, log);
  if (!drawn) return;
  drawn.face = CardFace.FaceDown;
  const prevTop = targetLine.cards.length > 0 ? targetLine.cards[targetLine.cards.length - 1] : null;
  targetLine.cards.push(drawn);
  if (prevTop) enqueueEffectsOnCover(state, prevTop, playerIndex);
}

/** Toggle the face of a card in any line. Returns the card if found. */
function flipSourceCard(
  state: ServerGameState,
  instanceId: string,
  log: (msg: string) => void,
): CardInstance | null {
  for (const player of state.players) {
    for (const line of player.lines) {
      const c = line.cards.find((c) => c.instanceId === instanceId);
      if (c) {
        c.face = c.face === CardFace.FaceUp ? CardFace.FaceDown : CardFace.FaceUp;
        log(`flip_self: ${c.defId} is now ${c.face}`);
        return c;
      }
    }
  }
  log(`flip_self: source card ${instanceId} not found in any line`);
  return null;
}

/** Returns true if the card with the given instanceId is currently face-up in any line. */
function isSourceCardActive(state: ServerGameState, instanceId: string): boolean {
  for (const player of state.players) {
    for (const line of player.lines) {
      if (line.cards.some((c) => c.instanceId === instanceId && c.face === CardFace.FaceUp)) {
        return true;
      }
    }
  }
  return false;
}

function countDistinctProtocolsInField(state: ServerGameState): number {
  const protocolIds = new Set<string>();
  for (const player of state.players) {
    for (const line of player.lines) {
      for (const card of line.cards) {
        const def = CARD_MAP.get(card.defId);
        if (def?.protocolId) protocolIds.add(def.protocolId);
      }
    }
  }
  return protocolIds.size;
}

function countCardsInFieldByProtocol(state: ServerGameState, protocolId: string): number {
  let count = 0;
  for (const player of state.players) {
    for (const line of player.lines) {
      for (const card of line.cards) {
        const def = CARD_MAP.get(card.defId);
        if (def?.protocolId === protocolId) count++;
      }
    }
  }
  return count;
}

function findSourceLineIndex(
  state: ServerGameState,
  ownerIndex: 0 | 1,
  sourceInstanceId: string | undefined,
): number {
  if (!sourceInstanceId) return -1;
  for (let li = 0; li < 3; li++) {
    if (state.players[ownerIndex].lines[li].cards.some((c) => c.instanceId === sourceInstanceId)) {
      return li;
    }
  }
  return -1;
}

function countDistinctProtocolsInLine(state: ServerGameState, lineIndex: number): number {
  if (lineIndex < 0 || lineIndex > 2) return 0;
  const protocolIds = new Set<string>();
  for (const player of state.players) {
    for (const card of player.lines[lineIndex].cards) {
      const def = CARD_MAP.get(card.defId);
      if (def?.protocolId) protocolIds.add(def.protocolId);
    }
  }
  return protocolIds.size;
}

function getEffectiveCardValue(card: CardInstance): number {
  if (card.face === CardFace.FaceDown) return FACE_DOWN_VALUE;
  return CARD_MAP.get(card.defId)?.value ?? 0;
}

function getCardDefinitionValue(card: CardInstance): number {
  return CARD_MAP.get(card.defId)?.value ?? 0;
}

/**
 * Execute a single PendingEffect that has already been confirmed by the player.
 * Results are logged to state.pendingLogs (flushed by Room after each action).
 */
export function executeEffect(
  state: ServerGameState,
  effect: PendingEffect
): void {
  const { ownerIndex, cardDefId, type, payload, trigger, sourceInstanceId } = effect;
  const oi = (1 - ownerIndex) as 0 | 1;
  const log = (msg: string) =>
    state.pendingLogs.push(`  EFFECT [${trigger}] ${cardDefId}: ${msg}`);

  if (sourceInstanceId && !isSourceCardActive(state, sourceInstanceId)) {
    log(`effect cancelled — source card ${sourceInstanceId} no longer active`);
    return;
  }

  switch (type) {
    case "draw": {
      const amount = (payload.amount as number) ?? 1;
      log(`draw ${amount}`);
      drawCards(state, ownerIndex, amount);
      // Trigger after_draw_shift_self passives
      for (const { card } of scanPassives(state, ownerIndex, "after_draw_shift_self")) {
        const def = CARD_MAP.get(card.defId)!;
        state.effectQueue.push({
          id: uuidv4(), cardDefId: card.defId, cardName: def.name,
          type: "after_draw_shift_self", description: "You may shift this card.",
          ownerIndex, trigger: "immediate", payload: {},
          sourceInstanceId: card.instanceId,
        });
        log(`after_draw_shift_self enqueued for ${card.defId}`);
      }
      break;
    }

    case "discard": {
      const targetId = payload.targetInstanceId as string | undefined;
      const hand = state.players[ownerIndex].hand;
      const trash = state.trashes[ownerIndex];
      if (!targetId) {
        log("discard: no target provided (hand empty or skipped)");
        break;
      }
      const idx = hand.findIndex((c) => c.instanceId === targetId);
      if (idx === -1) {
        log(`discard: card ${targetId} not found in hand`);
        break;
      }
      const [discarded] = hand.splice(idx, 1);
      discarded.face = CardFace.FaceUp;
      trash.push(discarded);
      state.players[ownerIndex].trashSize = trash.length;
      log(`discard ${discarded.defId}`);

      const oppDiscardDrawFor = payload.oppDiscardDrawFor as (0 | 1 | undefined);
      if (oppDiscardDrawFor === 0 || oppDiscardDrawFor === 1) {
        for (const { card, amount: drawAmt } of scanPassives(state, oppDiscardDrawFor, "after_opp_discard_draw")) {
          log(`after_opp_discard_draw (${card.defId}): drawing ${drawAmt}`);
          drawCards(state, oppDiscardDrawFor, drawAmt);
        }
      }
      const revealTo = payload.revealOpponentHandFor as (0 | 1 | undefined);
      if (revealTo === 0 || revealTo === 1) {
        state.revealOpponentHandFor = revealTo;
        log(`opponent_discard_reveal: opponent hand revealed to player ${revealTo}`);
      }
      break;
    }

    case "opponent_discard": {
      const amount = (payload.amount as number) ?? 1;
      log(`opponent_discard ${amount} (opponent chooses)`);
      const toQueue = Math.min(amount, state.players[oi].hand.length);
      for (let i = 0; i < toQueue; i++) {
        state.effectQueue.push({
          id: uuidv4(),
          cardDefId,
          cardName: effect.cardName,
          type: "discard",
          description: `Choose ${toQueue > 1 ? "a card" : "a card"} to discard.`,
          ownerIndex: oi,
          trigger: effect.trigger,
          payload: { oppDiscardDrawFor: ownerIndex },
          sourceInstanceId,
        });
      }
      break;
    }

    case "opponent_discard_reveal": {
      const amount = (payload.amount as number) ?? 1;
      log(`opponent_discard_reveal ${amount} (opponent chooses)`);
      const toQueue = Math.min(amount, state.players[oi].hand.length);
      for (let i = 0; i < toQueue; i++) {
        state.effectQueue.push({
          id: uuidv4(),
          cardDefId,
          cardName: effect.cardName,
          type: "discard",
          description: "Choose a card to discard.",
          ownerIndex: oi,
          trigger: effect.trigger,
          payload: { oppDiscardDrawFor: ownerIndex, revealOpponentHandFor: ownerIndex },
          sourceInstanceId,
        });
      }
      break;
    }

    case "rearrange_protocols": {
      const whose = payload.whose as "self" | "opponent";
      const targetIndex = whose === "self" ? ownerIndex : oi;
      const newOrder = payload.newProtocolOrder as string[] | undefined;

      if (!newOrder || newOrder.length !== 3) {
        log("rearrange_protocols: no valid newProtocolOrder provided");
        break;
      }
      const protocols = state.players[targetIndex].protocols;
      const existingIds = protocols.map((p) => p.protocolId).sort();
      if (JSON.stringify([...newOrder].sort()) !== JSON.stringify(existingIds)) {
        log("rearrange_protocols: newProtocolOrder contains invalid protocol ids");
        break;
      }
      const currentOrder = [...protocols]
        .sort((a, b) => a.lineIndex - b.lineIndex)
        .map((p) => p.protocolId);
      if (JSON.stringify(currentOrder) === JSON.stringify(newOrder)) {
        log("rearrange_protocols: order unchanged — must result in a change");
        break;
      }
      for (let i = 0; i < 3; i++) {
        const proto = protocols.find((p) => p.protocolId === newOrder[i]);
        if (proto) proto.lineIndex = i as 0 | 1 | 2;
      }
      // Keep array order aligned with line positions for all index-based consumers.
      protocols.sort((a, b) => a.lineIndex - b.lineIndex);
      log(`rearrange_protocols ${whose}: [${newOrder.join(", ")}]`);
      break;
    }

    case "play_facedown": {
      // Player picks a card from their hand (targetInstanceId) and a line
      // (targetLineIndex) that is different from the source card's line.
      const targetCardId = payload.targetInstanceId as string | undefined;
      const targetLineIndex = payload.targetLineIndex as number | undefined;
      const requiresFaceDownInLine = payload.requiresFaceDownInLine === true;

      if (targetCardId === undefined || targetLineIndex === undefined) {
        log("play_facedown: no target card or line provided");
        break;
      }
      if (targetLineIndex < 0 || targetLineIndex > 2) {
        log(`play_facedown: invalid line index ${targetLineIndex}`);
        break;
      }
      if (requiresFaceDownInLine) {
        const ownLine = state.players[ownerIndex].lines[targetLineIndex];
        const oppLine = state.players[oi].lines[targetLineIndex];
        const hasFaceDown = ownLine.cards.some((card) => card.face === CardFace.FaceDown) || oppLine.cards.some((card) => card.face === CardFace.FaceDown);
        if (!hasFaceDown) {
          log("play_facedown: target line must already contain a face-down card");
          break;
        }
      }

      // Validate the chosen line differs from the source card's line.
      if (sourceInstanceId) {
        for (let li = 0; li < 3; li++) {
          if (
            li === targetLineIndex &&
            state.players[ownerIndex].lines[li].cards.some(
              (c) => c.instanceId === sourceInstanceId
            )
          ) {
            log("play_facedown: cannot play into the same line as the source card");
            break;
          }
        }
      }

      const hand = state.players[ownerIndex].hand;
      const cardIdx = hand.findIndex((c) => c.instanceId === targetCardId);
      if (cardIdx === -1) {
        log(`play_facedown: card ${targetCardId} not found in hand`);
        break;
      }
      const [placed] = hand.splice(cardIdx, 1);
      placed.face = CardFace.FaceDown;
      const pfDestLine = state.players[ownerIndex].lines[targetLineIndex];
      const pfPrevTop = pfDestLine.cards.length > 0 ? pfDestLine.cards[pfDestLine.cards.length - 1] : null;
      pfDestLine.cards.push(placed);
      if (pfPrevTop) enqueueEffectsOnCover(state, pfPrevTop, ownerIndex);
      log(`play_facedown: ${placed.defId} placed face-down in line ${targetLineIndex}`);
      break;
    }

    case "return": {
      const targets = payload.targets as string | undefined;
      const targetLineIndex = payload.targetLineIndex as number | undefined;

      // wtr_3: Return all cards with value 2 in one selected line.
      if (targets === "line_value_2") {
        if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
          log("return line_value_2: no valid targetLineIndex provided");
          break;
        }

        let returnedCount = 0;
        for (let pi = 0 as 0 | 1; pi <= 1; pi = (pi + 1) as 0 | 1) {
          const line = state.players[pi].lines[targetLineIndex];
          for (let idx = line.cards.length - 1; idx >= 0; idx--) {
            const c = line.cards[idx];
            const def = CARD_MAP.get(c.defId);
            const val = c.face === CardFace.FaceDown ? FACE_DOWN_VALUE : (def?.value ?? 0);
            if (val !== 2) continue;

            const [returned] = line.cards.splice(idx, 1);
            returned.face = CardFace.FaceUp;
            state.players[ownerIndex].hand.push(returned);
            returnedCount++;
          }
        }
        log(`return line_value_2: returned ${returnedCount} card(s) from line ${targetLineIndex}`);
        break;
      }

      // Move a specific card from any line back to the owner's hand.
      // The player selects the card; the resolver receives its instanceId in payload.
      const targetId = payload.targetInstanceId as string | undefined;
      if (!targetId) {
        log("return: no target provided");
        break;
      }
      let found = false;
      outer: for (let pi = 0 as 0 | 1; pi <= 1; pi = (pi + 1) as 0 | 1) {
        for (const line of state.players[pi].lines) {
          const idx = line.cards.findIndex((c) => c.instanceId === targetId);
          if (idx !== -1) {
            if (idx !== line.cards.length - 1) {
              log("return: target must be uncovered");
              break outer;
            }
            if (targets === "own_any" && pi !== ownerIndex) {
              log("return: target must be your own card");
              break outer;
            }
            if (targets === "opponent_any" && pi === ownerIndex) {
              log("return: target must be your opponent's card");
              break outer;
            }
            const [returned] = line.cards.splice(idx, 1);
            returned.face = CardFace.FaceUp;
            state.players[pi].hand.push(returned);
            log(`return ${returned.defId} to hand`);
            found = true;
            break outer;
          }
        }
      }
      if (!found) log(`return: card ${targetId} not found in any line`);
      break;
    }

    case "conditional_draw": {
      // Draw only if the source card is covering another card (not at index 0 in its line)
      const amount = (payload.amount as number) ?? 1;
      let isCovering = false;
      if (sourceInstanceId) {
        outer: for (const player of state.players) {
          for (const line of player.lines) {
            const idx = line.cards.findIndex((c) => c.instanceId === sourceInstanceId);
            if (idx > 0) { isCovering = true; break outer; }
          }
        }
      }
      if (isCovering) {
        log(`conditional_draw ${amount} (covering a card)`);
        drawCards(state, ownerIndex, amount);
      } else {
        log(`conditional_draw: condition not met (not covering)`);
      }
      break;
    }

    case "deny_compile": {
      // Flag the opponent's next turn so their check-compile phase produces no
      // compilable lines, consumed once in processAutoPhases.
      state.denyCompile = true;
      log("deny_compile: opponent compile blocked next turn");
      break;
    }

    case "opponent_draw": {
      const amount = (payload.amount as number) ?? 1;
      log(`opponent_draw ${amount}`);
      drawCards(state, oi, amount);
      break;
    }

    case "draw_from_opponent_deck": {
      // Take the top card of the opponent's deck into the owner's hand.
      const deck = state.decks[oi];
      const trash = state.trashes[oi];
      if (deck.length === 0) {
        if (trash.length === 0) {
          log("draw_from_opponent_deck: opponent deck and trash are empty");
          break;
        }
        const reshuffled = shuffle(trash.splice(0));
        reshuffled.forEach((c) => (c.face = CardFace.FaceDown));
        deck.push(...reshuffled);
        state.players[oi].trashSize = 0;
      }
      const stolen = deck.shift()!;
      stolen.face = CardFace.FaceUp;
      state.players[ownerIndex].hand.push(stolen);
      state.players[oi].deckSize = deck.length;
      log(`draw_from_opponent_deck: took ${stolen.defId} from opponent deck`);
      break;
    }

    case "exchange_hand": {
      // Love 3 resolves in two steps: first take 1 random opponent hand card,
      // then choose 1 card from your updated hand to give back.
      const awaitGive = payload.awaitGive === true;
      const giveId = payload.targetInstanceId as string | undefined;
      const oppHand = state.players[oi].hand;
      const ownHand = state.players[ownerIndex].hand;
      if (!awaitGive && oppHand.length === 0) {
        log("exchange_hand: opponent has no cards to take");
        break;
      }

      if (!awaitGive) {
        const takeIdx = Math.floor(Math.random() * oppHand.length);
        const taken = oppHand.splice(takeIdx, 1)[0];
        taken.face = CardFace.FaceUp;
        ownHand.push(taken);
        state.effectQueue.unshift({
          id: uuidv4(),
          cardDefId,
          cardName: effect.cardName,
          type: "exchange_hand",
          description: "Give 1 card from your hand to your opponent.",
          ownerIndex,
          trigger,
          payload: { awaitGive: true },
          sourceInstanceId,
        });
        log(`exchange_hand: took ${taken.defId}; waiting for give choice`);
        break;
      }

      if (!giveId) {
        log("exchange_hand: no card chosen to give");
        break;
      }
      const giveIdx = ownHand.findIndex((c) => c.instanceId === giveId);
      if (giveIdx === -1) {
        log(`exchange_hand: card ${giveId} not found in own hand`);
        break;
      }
      // Give chosen card to opponent
      const [given] = ownHand.splice(giveIdx, 1);
      given.face = CardFace.FaceUp;
      oppHand.push(given);
      log(`exchange_hand: gave ${given.defId}`);
      break;
    }

    case "give_to_draw": {
      // Optional: give 1 hand card to opponent, then draw 2. Skipped if no target chosen.
      const giveId = payload.targetInstanceId as string | undefined;
      if (!giveId) {
        log("give_to_draw: skipped (no card chosen to give)");
        break;
      }
      const ownHand = state.players[ownerIndex].hand;
      const giveIdx = ownHand.findIndex((c) => c.instanceId === giveId);
      if (giveIdx === -1) {
        log(`give_to_draw: card ${giveId} not in hand`);
        break;
      }
      const [given] = ownHand.splice(giveIdx, 1);
      given.face = CardFace.FaceUp;
      state.players[oi].hand.push(given);
      log(`give_to_draw: gave ${given.defId} to opponent`);
      drawCards(state, ownerIndex, 2);
      break;
    }

    case "discard_or_flip_self": {
      // Player chooses: discard 1 card (targetInstanceId set) OR flip this card
      // (targetInstanceId absent and flipSelf=true, or targetInstanceId absent = flip).
      const discardId = payload.targetInstanceId as string | undefined;
      if (discardId) {
        const hand = state.players[ownerIndex].hand;
        const idx = hand.findIndex((c) => c.instanceId === discardId);
        if (idx === -1) {
          log(`discard_or_flip_self: card ${discardId} not found in hand`);
          break;
        }
        const [discarded] = hand.splice(idx, 1);
        discarded.face = CardFace.FaceUp;
        state.trashes[ownerIndex].push(discarded);
        state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
        log(`discard_or_flip_self: discarded ${discarded.defId}`);
      } else {
        // No discard target chosen — flip self
        if (sourceInstanceId) flipSourceCard(state, sourceInstanceId, log);
        else log("discard_or_flip_self: no sourceInstanceId for flip");
      }
      break;
    }

    case "skip_check_cache": {
      // Set a flag consumed by endTurn — the clear-cache discard is skipped once.
      state.skipCheckCache = true;
      log("skip_check_cache: clear-cache discard will be skipped this turn");
      break;
    }

    case "refresh": {
      // Draw cards until the owner has 5 in hand (the "draw to 5" part of a
      // normal refresh action). The turn ends naturally once all immediate
      // effects in this queue have resolved.
      const needed = 5 - state.players[ownerIndex].hand.length;
      if (needed > 0) {
        log(`refresh: drawing ${needed} to fill hand to 5`);
        drawCards(state, ownerIndex, needed);
      } else {
        log("refresh: hand already at 5 or more, nothing to draw");
      }
      break;
    }

    case "draw_if_hand_empty": {
      const amount = (payload.amount as number) ?? 1;
      if (state.players[ownerIndex].hand.length === 0) {
        log(`draw_if_hand_empty: drawing ${amount}`);
        drawCards(state, ownerIndex, amount);
      } else {
        log("draw_if_hand_empty: skipped (hand not empty)");
      }
      break;
    }

    case "draw_if_opponent_higher_in_line": {
      const srcLine = findSourceLineIndex(state, ownerIndex, sourceInstanceId);
      if (srcLine === -1) {
        log("draw_if_opponent_higher_in_line: no sourceInstanceId");
        break;
      }
      if (lineValue(state, oi, srcLine) > lineValue(state, ownerIndex, srcLine)) {
        const amount = (payload.amount as number) ?? 1;
        log(`draw_if_opponent_higher_in_line: drawing ${amount}`);
        drawCards(state, ownerIndex, amount);
      } else {
        log("draw_if_opponent_higher_in_line: skipped (opponent not higher)");
      }
      break;
    }

    case "draw_per_distinct_protocols_in_source_line": {
      const srcLine = findSourceLineIndex(state, ownerIndex, sourceInstanceId);
      if (srcLine === -1) {
        log("draw_per_distinct_protocols_in_source_line: source line not found");
        break;
      }
      const amount = countDistinctProtocolsInLine(state, srcLine);
      log(`draw_per_distinct_protocols_in_source_line: drawing ${amount}`);
      drawCards(state, ownerIndex, amount);
      break;
    }

    case "draw_value_from_deck_then_shuffle": {
      const wantedValue = payload.value as number | undefined;
      if (wantedValue === undefined) {
        log("draw_value_from_deck_then_shuffle: missing value");
        break;
      }
      const deck = state.decks[ownerIndex];
      const matchIndex = deck.findIndex((card) => getCardDefinitionValue(card) === wantedValue);
      if (matchIndex === -1) {
        state.decks[ownerIndex] = shuffle(deck);
        state.players[ownerIndex].deckSize = state.decks[ownerIndex].length;
        log(`draw_value_from_deck_then_shuffle: no value-${wantedValue} card found; shuffled deck`);
        break;
      }
      const [drawn] = deck.splice(matchIndex, 1);
      drawn.face = CardFace.FaceUp;
      state.players[ownerIndex].hand.push(drawn);
      state.decks[ownerIndex] = shuffle(deck);
      state.players[ownerIndex].deckSize = state.decks[ownerIndex].length;
      log(`draw_value_from_deck_then_shuffle: drew ${drawn.defId} and shuffled deck`);
      break;
    }

    case "trash_to_other_line_facedown": {
      const targetLineIndex = payload.targetLineIndex as number | undefined;
      if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
        log("trash_to_other_line_facedown: no valid targetLineIndex provided");
        break;
      }

      if (sourceInstanceId) {
        const sourceLineIndex = state.players[ownerIndex].lines.findIndex((line) =>
          line.cards.some((card) => card.instanceId === sourceInstanceId),
        );
        if (sourceLineIndex >= 0 && sourceLineIndex === targetLineIndex) {
          log("trash_to_other_line_facedown: target line must be different from source line");
          break;
        }
      }

      const trash = state.trashes[ownerIndex];
      if (trash.length === 0) {
        log("trash_to_other_line_facedown: trash is empty");
        break;
      }

      const [moved] = trash.splice(0, 1);
      state.players[ownerIndex].trashSize = trash.length;
      moved.face = CardFace.FaceDown;

      const destLine = state.players[ownerIndex].lines[targetLineIndex];
      const prevTop = destLine.cards.length > 0 ? destLine.cards[destLine.cards.length - 1] : null;
      destLine.cards.push(moved);
      if (prevTop) enqueueEffectsOnCover(state, prevTop, ownerIndex);

      log(`trash_to_other_line_facedown: moved ${moved.defId} from trash to line ${targetLineIndex} face-down`);
      break;
    }

    case "draw_all_protocol_from_deck_if_hand_empty": {
      const protocolId = payload.protocolId as string | undefined;
      if (!protocolId) {
        log("draw_all_protocol_from_deck_if_hand_empty: missing protocolId");
        break;
      }
      if (state.players[ownerIndex].hand.length > 0) {
        log("draw_all_protocol_from_deck_if_hand_empty: skipped (hand not empty)");
        break;
      }
      const deck = state.decks[ownerIndex];
      const matching: CardInstance[] = [];
      const remaining: CardInstance[] = [];
      for (const card of deck) {
        const def = CARD_MAP.get(card.defId);
        if (def?.protocolId === protocolId) {
          matching.push(card);
        } else {
          remaining.push(card);
        }
      }
      state.decks[ownerIndex] = shuffle(remaining);
      state.players[ownerIndex].deckSize = state.decks[ownerIndex].length;
      for (const card of matching) {
        card.face = CardFace.FaceUp;
        state.players[ownerIndex].hand.push(card);
      }
      log(`draw_all_protocol_from_deck_if_hand_empty: drew ${matching.length} matching card(s) and shuffled deck`);
      break;
    }

    case "flip_self_if_hand_gt": {
      const threshold = (payload.threshold as number) ?? 0;
      if (state.players[ownerIndex].hand.length > threshold) {
        if (sourceInstanceId) flipSourceCard(state, sourceInstanceId, log);
      } else {
        log(`flip_self_if_hand_gt: skipped (hand size not greater than ${threshold})`);
      }
      break;
    }

    case "flip_self": {
      if (!sourceInstanceId) {
        log("flip_self: no sourceInstanceId");
        break;
      }
      flipSourceCard(state, sourceInstanceId, log);
      break;
    }

    case "return_opp_flip_self": {
      // Optional: return 1 of the opponent's cards to their hand. If you do, flip this card.
      const targetId = payload.targetInstanceId as string | undefined;
      if (!targetId) {
        log("return_opp_flip_self: skipped (no target chosen)");
        break;
      }
      let returned = false;
      outer: for (const line of state.players[oi].lines) {
        const idx = line.cards.findIndex((c) => c.instanceId === targetId);
        if (idx !== -1) {
          const [card] = line.cards.splice(idx, 1);
          card.face = CardFace.FaceUp;
          state.players[oi].hand.push(card);
          log(`return_opp_flip_self: returned ${card.defId} to opponent hand`);
          returned = true;
          break outer;
        }
      }
      if (!returned) {
        log(`return_opp_flip_self: target ${targetId} not found in opponent lines`);
        break;
      }
      if (sourceInstanceId) flipSourceCard(state, sourceInstanceId, log);
      break;
    }

    case "opp_delete_facedown_flip_self": {
      // Opponent deletes 1 of their face-down cards. Owner may flip this card.
      const targetId = payload.targetInstanceId as string | undefined;
      if (!targetId) {
        log("opp_delete_facedown_flip_self: no target provided");
        break;
      }
      let deleted = false;
      outer: for (const line of state.players[oi].lines) {
        const idx = line.cards.findIndex(
          (c) => c.instanceId === targetId && c.face === CardFace.FaceDown
        );
        if (idx !== -1) {
          const [trashed] = line.cards.splice(idx, 1);
          state.trashes[oi].push(trashed);
          state.players[oi].trashSize = state.trashes[oi].length;
          log(`opp_delete_facedown_flip_self: deleted ${trashed.defId} from opponent`);
          deleted = true;
          break outer;
        }
      }
      if (!deleted) {
        log(`opp_delete_facedown_flip_self: face-down card ${targetId} not found in opponent lines`);
        break;
      }
      if (payload.flipSelf && sourceInstanceId) {
        flipSourceCard(state, sourceInstanceId, log);
      }
      break;
    }

    case "delete": {
      const targets = payload.targets as string | undefined;
      const targetId = payload.targetInstanceId as string | undefined;
      const targetLineIndex = payload.targetLineIndex as number | undefined;

      /** Move a card from any line to its owner's trash. Returns true if found. */
      const deleteCard = (instanceId: string): boolean => {
        for (let pi = 0; pi < 2; pi++) {
          for (const line of state.players[pi].lines) {
            const idx = line.cards.findIndex((c) => c.instanceId === instanceId);
            if (idx !== -1) {
              const [trashed] = line.cards.splice(idx, 1);
              state.trashes[pi].push(trashed);
              state.players[pi].trashSize = state.trashes[pi].length;
              log(`delete: removed ${trashed.defId} (player ${pi})`);
              return true;
            }
          }
        }
        return false;
      };

      // Auto: delete 1 card from each of the owner's other lines
      if (targets === "each_other_line") {
        let srcLine = -1;
        if (sourceInstanceId) {
          for (let li = 0; li < 3; li++) {
            if (state.players[ownerIndex].lines[li].cards.some((c) => c.instanceId === sourceInstanceId)) {
              srcLine = li;
              break;
            }
          }
        }
        for (let li = 0; li < 3; li++) {
          if (li === srcLine) continue;
          const line = state.players[ownerIndex].lines[li];
          if (line.cards.length > 0) {
            const [trashed] = line.cards.splice(line.cards.length - 1, 1);
            state.trashes[ownerIndex].push(trashed);
            state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
            log(`delete each_other_line: removed ${trashed.defId} from line ${li}`);
          }
        }
        for (const { card, amount: drawAmt } of scanPassives(state, ownerIndex, "after_delete_draw")) {
          log(`after_delete_draw (${card.defId}): drawing ${drawAmt}`);
          drawCards(state, ownerIndex, drawAmt);
        }
        break;
      }

      // Auto: delete all value-1/2 cards in a chosen line (both sides)
      if (targets === "line_values_1_2") {
        if (targetLineIndex === undefined) {
          log("delete line_values_1_2: no targetLineIndex provided");
          break;
        }
        const li = targetLineIndex;
        if (li < 0 || li > 2) {
          log(`delete line_values_1_2: invalid lineIndex ${li}`);
          break;
        }
        let totalDeleted = 0;
        for (const lpi of [0, 1]) {
          const targetLine = state.players[lpi].lines[li];
          const toDelete = targetLine.cards.filter((c) => {
            const def = CARD_MAP.get(c.defId);
            const val = c.face === CardFace.FaceDown ? 2 : (def?.value ?? 0);
            return val === 1 || val === 2;
          });
          for (const c of toDelete) {
            const idx = targetLine.cards.indexOf(c);
            targetLine.cards.splice(idx, 1);
            state.trashes[lpi].push(c);
          }
          state.players[lpi].trashSize = state.trashes[lpi].length;
          totalDeleted += toDelete.length;
        }
        log(`delete line_values_1_2: removed ${totalDeleted} card(s) from both sides of line ${li}`);
        if (totalDeleted > 0) {
          for (const { card, amount: drawAmt } of scanPassives(state, ownerIndex, "after_delete_draw")) {
            log(`after_delete_draw (${card.defId}): drawing ${drawAmt}`);
            drawCards(state, ownerIndex, drawAmt);
          }
        }
        break;
      }

      // Auto: delete all cards in a chosen line if it has 8+ cards (both sides)
      if (targets === "line_8plus_cards") {
        if (targetLineIndex === undefined) {
          log("delete line_8plus_cards: no targetLineIndex provided");
          break;
        }
        const li = targetLineIndex;
        if (li < 0 || li > 2) {
          log(`delete line_8plus_cards: invalid lineIndex ${li}`);
          break;
        }
        // Count total cards across both sides of the line
        const totalCards = state.players[0].lines[li].cards.length + state.players[1].lines[li].cards.length;
        if (totalCards < 8) {
          log(`delete line_8plus_cards: line ${li} has only ${totalCards} total cards`);
          break;
        }
        let totalRemoved = 0;
        for (const lpi of [0, 1]) {
          const targetLine = state.players[lpi].lines[li];
          const removed = targetLine.cards.splice(0);
          state.trashes[lpi].push(...removed);
          state.players[lpi].trashSize = state.trashes[lpi].length;
          totalRemoved += removed.length;
        }
        log(`delete line_8plus_cards: cleared ${totalRemoved} cards from both sides of line ${li}`);
        for (const { card, amount: drawAmt } of scanPassives(state, ownerIndex, "after_delete_draw")) {
          log(`after_delete_draw (${card.defId}): drawing ${drawAmt}`);
          drawCards(state, ownerIndex, drawAmt);
        }
        break;
      }

      // Single-pick variants
      if (!targetId) {
        log("delete: no targetInstanceId provided");
        break;
      }

      // Validate target constraints before deleting
      let found = false;
      outer: for (let pi = 0; pi < 2; pi++) {
        for (const line of state.players[pi].lines) {
          const c = line.cards.find((c) => c.instanceId === targetId);
          if (c) {
            const cIdx = line.cards.findIndex((cc) => cc.instanceId === targetId);
            const isUncovered = cIdx === line.cards.length - 1;
            if (targets === "any_card" && !isUncovered) {
              log("delete any_card: target must be uncovered");
              break outer;
            }
            if (targets === "any_facedown" && (c.face !== CardFace.FaceDown || !isUncovered)) {
              log("delete any_facedown: target must be uncovered face-down");
              break outer;
            }
            if (targets === "opponent_facedown") {
              if (pi === ownerIndex) {
                log("delete opponent_facedown: must target opponent's card");
                break outer;
              }
              if (c.face !== CardFace.FaceDown || !isUncovered) {
                log("delete opponent_facedown: target must be uncovered face-down");
                break outer;
              }
            }
            if (targets === "value_0_or_1") {
              if (!isUncovered) {
                log("delete value_0_or_1: target must be uncovered");
                break outer;
              }
              const def = CARD_MAP.get(c.defId);
              const val = c.face === CardFace.FaceDown ? 2 : (def?.value ?? 0);
              if (val > 1) {
                log("delete value_0_or_1: target value is not 0 or 1");
                break outer;
              }
            }
            found = true;
            break outer;
          }
        }
      }
      if (found) {
        deleteCard(targetId);
        for (const { card, amount: drawAmt } of scanPassives(state, ownerIndex, "after_delete_draw")) {
          log(`after_delete_draw (${card.defId}): drawing ${drawAmt}`);
          drawCards(state, ownerIndex, drawAmt);
        }
      }
      else if (!found) log(`delete: target ${targetId} not found or invalid`);
      break;
    }

    case "delete_highest_both": {
      // Auto: delete the highest-value face-up card from each player's lines
      for (let pi = 0; pi < 2; pi++) {
        let highest: CardInstance | null = null;
        let highestVal = -1;
        for (const line of state.players[pi].lines) {
          for (const c of line.cards) {
            if (c.face !== CardFace.FaceUp) continue;
            const def = CARD_MAP.get(c.defId);
            const val = def?.value ?? 0;
            if (val > highestVal) { highestVal = val; highest = c; }
          }
        }
        if (highest) {
          for (const line of state.players[pi].lines) {
            const idx = line.cards.indexOf(highest);
            if (idx !== -1) {
              const [trashed] = line.cards.splice(idx, 1);
              state.trashes[pi].push(trashed);
              state.players[pi].trashSize = state.trashes[pi].length;
              log(`delete_highest_both: removed ${trashed.defId} (value ${highestVal}) from player ${pi}`);
              break;
            }
          }
        } else {
          log(`delete_highest_both: no face-up cards for player ${pi}`);
        }
      }
      for (const { card, amount: drawAmt } of scanPassives(state, ownerIndex, "after_delete_draw")) {
        log(`after_delete_draw (${card.defId}): drawing ${drawAmt}`);
        drawCards(state, ownerIndex, drawAmt);
      }
      break;
    }

    case "draw_then_delete_self": {
      // Optional: draw 1. If you do, delete 1 other card, then delete source card.
      // Client signals opt-in by providing targetInstanceId (card to delete).
      // No targetInstanceId = player opted out.
      const deleteTargetId = payload.targetInstanceId as string | undefined;
      if (!deleteTargetId) {
        log("draw_then_delete_self: skipped (opted out)");
        break;
      }
      // Draw 1
      drawCards(state, ownerIndex, 1);
      // Delete the chosen other card
      let deletedOther = false;
      outer: for (let pi = 0; pi < 2; pi++) {
        for (const line of state.players[pi].lines) {
          const idx = line.cards.findIndex((c) => c.instanceId === deleteTargetId && c.instanceId !== sourceInstanceId);
          if (idx !== -1) {
            const [trashed] = line.cards.splice(idx, 1);
            state.trashes[pi].push(trashed);
            state.players[pi].trashSize = state.trashes[pi].length;
            log(`draw_then_delete_self: deleted ${trashed.defId}`);
            deletedOther = true;
            break outer;
          }
        }
      }
      if (!deletedOther) {
        log(`draw_then_delete_self: target ${deleteTargetId} not found`);
        break;
      }
      // Delete self
      if (sourceInstanceId) {
        for (let pi = 0; pi < 2; pi++) {
          for (const line of state.players[pi].lines) {
            const idx = line.cards.findIndex((c) => c.instanceId === sourceInstanceId);
            if (idx !== -1) {
              const [trashed] = line.cards.splice(idx, 1);
              state.trashes[pi].push(trashed);
              state.players[pi].trashSize = state.trashes[pi].length;
              log(`draw_then_delete_self: deleted self ${trashed.defId}`);
              break;
            }
          }
        }
      }
      break;
    }

    case "discard_to_delete": {
      // Discard 1 from own hand (discardId), then delete 1 card (deleteTargetId).
      const discardId = payload.discardInstanceId as string | undefined;
      const deleteTargetId = payload.targetInstanceId as string | undefined;
      if (!discardId) {
        log("discard_to_delete: skipped (no card chosen to discard)");
        break;
      }
      const ownHand = state.players[ownerIndex].hand;
      const dIdx = ownHand.findIndex((c) => c.instanceId === discardId);
      if (dIdx === -1) {
        log(`discard_to_delete: discard card ${discardId} not found in hand`);
        break;
      }
      const [discarded] = ownHand.splice(dIdx, 1);
      discarded.face = CardFace.FaceUp;
      state.trashes[ownerIndex].push(discarded);
      state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
      log(`discard_to_delete: discarded ${discarded.defId}`);
      if (!deleteTargetId) {
        log("discard_to_delete: no deleteTarget provided");
        break;
      }
      let dtFound = false;
      outer: for (let pi = 0; pi < 2; pi++) {
        for (const line of state.players[pi].lines) {
          const idx = line.cards.findIndex((c) => c.instanceId === deleteTargetId);
          if (idx !== -1) {
            const [trashed] = line.cards.splice(idx, 1);
            state.trashes[pi].push(trashed);
            state.players[pi].trashSize = state.trashes[pi].length;
            log(`discard_to_delete: deleted ${trashed.defId}`);
            dtFound = true;
            break outer;
          }
        }
      }
      if (!dtFound) log(`discard_to_delete: delete target ${deleteTargetId} not found`);
      break;
    }

    case "discard_to_return": {
      // Discard 1 from own hand, then return 1 card from any line to its owner's hand.
      const discardId = payload.discardInstanceId as string | undefined;
      const returnTargetId = payload.targetInstanceId as string | undefined;
      if (!discardId) {
        log("discard_to_return: skipped (no card chosen to discard)");
        break;
      }
      const ownHand = state.players[ownerIndex].hand;
      const dIdx = ownHand.findIndex((c) => c.instanceId === discardId);
      if (dIdx === -1) {
        log(`discard_to_return: discard card ${discardId} not found in hand`);
        break;
      }
      const [discarded] = ownHand.splice(dIdx, 1);
      discarded.face = CardFace.FaceUp;
      state.trashes[ownerIndex].push(discarded);
      state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
      log(`discard_to_return: discarded ${discarded.defId}`);
      if (!returnTargetId) {
        log("discard_to_return: no return target provided");
        break;
      }
      let rtFound = false;
      outer: for (let pi = 0; pi < 2; pi++) {
        for (const line of state.players[pi].lines) {
          const idx = line.cards.findIndex((c) => c.instanceId === returnTargetId);
          if (idx !== -1) {
            const [returned] = line.cards.splice(idx, 1);
            returned.face = CardFace.FaceUp;
            state.players[ownerIndex].hand.push(returned);
            log(`discard_to_return: returned ${returned.defId} to hand`);
            rtFound = true;
            break outer;
          }
        }
      }
      if (!rtFound) log(`discard_to_return: return target ${returnTargetId} not found`);
      break;
    }

    case "discard_to_draw": {
      // Discard N cards (array of instanceIds in discardIds), draw N+1.
      // Client provides discardIds as an array.
      const discardIds = payload.discardIds as string[] | undefined;
      if (!discardIds || discardIds.length === 0) {
        log("discard_to_draw: skipped (no cards chosen to discard)");
        break;
      }
      const ownHand = state.players[ownerIndex].hand;
      let actualDiscarded = 0;
      for (const id of discardIds) {
        const idx = ownHand.findIndex((c) => c.instanceId === id);
        if (idx !== -1) {
          const [discarded] = ownHand.splice(idx, 1);
          discarded.face = CardFace.FaceUp;
          state.trashes[ownerIndex].push(discarded);
          actualDiscarded++;
        }
      }
      state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
      log(`discard_to_draw: discarded ${actualDiscarded}, drawing ${actualDiscarded + 1}`);
      drawCards(state, ownerIndex, actualDiscarded + 1);
      break;
    }

    case "discard_to_flip": {
      // Optional: discard 1, then flip 1 card.
      const discardId = payload.discardInstanceId as string | undefined;
      const flipTargetId = payload.targetInstanceId as string | undefined;
      if (!discardId) {
        log("discard_to_flip: skipped (no card chosen to discard)");
        break;
      }
      const ownHand = state.players[ownerIndex].hand;
      const dIdx = ownHand.findIndex((c) => c.instanceId === discardId);
      if (dIdx === -1) {
        log(`discard_to_flip: discard card ${discardId} not found in hand`);
        break;
      }
      const [discarded] = ownHand.splice(dIdx, 1);
      discarded.face = CardFace.FaceUp;
      state.trashes[ownerIndex].push(discarded);
      state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
      log(`discard_to_flip: discarded ${discarded.defId}`);
      if (!flipTargetId) {
        log("discard_to_flip: no flip target provided");
        break;
      }
      let ftFound = false;
      for (let pi = 0; pi < 2; pi++) {
        for (const line of state.players[pi].lines) {
          const c = line.cards.find((c) => c.instanceId === flipTargetId);
          if (c) {
            const wasDown = c.face === CardFace.FaceDown;
            c.face = wasDown ? CardFace.FaceUp : CardFace.FaceDown;
            log(`discard_to_flip: ${c.defId} is now ${c.face}`);
            if (wasDown) enqueueEffectsOnFlipFaceUp(state, pi as 0 | 1, c);
            ftFound = true;
            break;
          }
        }
        if (ftFound) break;
      }
      if (!ftFound) log(`discard_to_flip: flip target ${flipTargetId} not found`);
      break;
    }

    case "discard_to_opp_discard_more": {
      // Discard N cards, opponent discards N+1.
      const discardIds = payload.discardIds as string[] | undefined;
      if (!discardIds || discardIds.length === 0) {
        log("discard_to_opp_discard_more: skipped (no cards chosen to discard)");
        break;
      }
      const ownHand = state.players[ownerIndex].hand;
      let actualDiscarded = 0;
      for (const id of discardIds) {
        const idx = ownHand.findIndex((c) => c.instanceId === id);
        if (idx !== -1) {
          const [discarded] = ownHand.splice(idx, 1);
          discarded.face = CardFace.FaceUp;
          state.trashes[ownerIndex].push(discarded);
          actualDiscarded++;
        }
      }
      state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
      const oppDiscard = actualDiscarded + 1;
      log(`discard_to_opp_discard_more: discarded ${actualDiscarded}, opponent discards ${oppDiscard}`);
      discardFromHand(state, oi, oppDiscard);
      break;
    }

    case "reveal_hand": {
      if (payload.awaitRead === true) {
        // Player has confirmed they read the revealed hand — nothing more to do.
        log("reveal_hand: read confirmed");
        break;
      }
      // Step 1: reveal the hand and queue a mandatory read-confirm step.
      state.revealOpponentHandFor = ownerIndex;
      log(`reveal_hand: opponent hand revealed to player ${ownerIndex}`);
      state.effectQueue.unshift({
        id: uuidv4(),
        cardDefId,
        cardName: effect.cardName,
        type: "reveal_hand",
        description: "Review your opponent's revealed hand, then confirm.",
        ownerIndex,
        trigger,
        payload: { awaitRead: true },
      });
      break;
    }

    case "reveal_top_deck": {
      if (payload.awaitRead === true) {
        // Step 2: player may optionally discard the revealed card.
        const discardIt = !!payload.targetInstanceId;
        const revealed = state.revealTopDeckFor;
        if (discardIt && revealed?.playerIndex === ownerIndex) {
          const deck = state.decks[ownerIndex];
          const idx = deck.findIndex((c) => c.instanceId === revealed.card.instanceId);
          if (idx !== -1) {
            const [removed] = deck.splice(idx, 1);
            state.trashes[ownerIndex].push(removed);
            state.players[ownerIndex].deckSize = deck.length;
            state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
            log(`reveal_top_deck: discarded ${removed.defId}`);
          }
        } else {
          log("reveal_top_deck: kept top card");
        }
        state.revealTopDeckFor = null;
        break;
      }
      // Step 1: peek at the top deck card without removing it.
      const deck = state.decks[ownerIndex];
      if (deck.length === 0) {
        log("reveal_top_deck: deck empty");
        break;
      }
      const topCard = deck[0];
      state.revealTopDeckFor = { playerIndex: ownerIndex, card: topCard };
      const topName = CARD_MAP.get(topCard.defId)?.name ?? topCard.defId;
      log(`reveal_top_deck: revealed ${topCard.defId} (${topName}) to player ${ownerIndex}`);
      state.effectQueue.unshift({
        id: uuidv4(),
        cardDefId,
        cardName: effect.cardName,
        type: "reveal_top_deck",
        description: `Top card: ${topName} — keep or discard?`,
        ownerIndex,
        trigger,
        payload: { awaitRead: true },
      });
      break;
    }

    case "swap_protocols": {
      // Swap the lineIndex of 2 of the owner's protocols.
      // Client provides swapProtocolIds: [protocolIdA, protocolIdB]
      const swapIds = payload.swapProtocolIds as string[] | undefined;
      if (!swapIds || swapIds.length !== 2) {
        log("swap_protocols: need exactly 2 swapProtocolIds");
        break;
      }
      const protocols = state.players[ownerIndex].protocols;
      const protoA = protocols.find((p) => p.protocolId === swapIds[0]);
      const protoB = protocols.find((p) => p.protocolId === swapIds[1]);
      if (!protoA || !protoB) {
        log("swap_protocols: one or both protocol IDs not found");
        break;
      }
      if (protoA.lineIndex === protoB.lineIndex) {
        log("swap_protocols: protocols already in same line");
        break;
      }
      const tmp = protoA.lineIndex;
      protoA.lineIndex = protoB.lineIndex;
      protoB.lineIndex = tmp;
      // Keep array order aligned with line positions for all index-based consumers.
      state.players[ownerIndex].protocols.sort((a, b) => a.lineIndex - b.lineIndex);
      log(`swap_protocols: swapped ${protoA.protocolId} (line ${protoB.lineIndex}) and ${protoB.protocolId} (line ${protoA.lineIndex})`);
      break;
    }

    case "discard_to_delete2": {
      // Queue: player chooses which cards to discard (up to 3, or all if fewer),
      // then gets 2 delete-any-card sub-effects.
      const discardCount = (payload.discard as number) ?? 3;
      const toDiscard = Math.min(discardCount, state.players[ownerIndex].hand.length);
      for (let i = 0; i < toDiscard; i++) {
        state.effectQueue.push({
          id: uuidv4(),
          cardDefId,
          cardName: effect.cardName,
          type: "discard",
          description: "Choose a card to discard.",
          ownerIndex,
          trigger: effect.trigger,
          payload: {},
          sourceInstanceId,
        });
      }
      for (let i = 0; i < 2; i++) {
        state.effectQueue.push({
          id: uuidv4(),
          cardDefId,
          cardName: effect.cardName,
          type: "delete",
          description: "Delete 1 card.",
          ownerIndex,
          trigger: effect.trigger,
          payload: { targets: "any_card" },
          sourceInstanceId,
        });
      }
      log(`discard_to_delete2: queued ${toDiscard} discard(s) + 2 deletes`);
      break;
    }

    case "flip_draw_equal": {
      // Flip 1 card, then draw cards equal to that card's definition value.
      const targetId = payload.targetInstanceId as string | undefined;
      if (!targetId) {
        log("flip_draw_equal: no targetInstanceId provided");
        break;
      }
      let fdeCard: CardInstance | null = null;
      let fdeOwnerIdx: 0 | 1 | null = null;
      let fdeLineIdx: number | null = null;
      outer: for (let pi = 0; pi < 2; pi++) {
        for (let li = 0; li < 3; li++) {
          const c = state.players[pi].lines[li].cards.find((c) => c.instanceId === targetId);
          if (c) { fdeCard = c; fdeOwnerIdx = pi as 0 | 1; fdeLineIdx = li; break outer; }
        }
      }
      if (!fdeCard || fdeOwnerIdx === null) {
        log(`flip_draw_equal: card ${targetId} not found`);
        break;
      }
      const wasDown = fdeCard.face === CardFace.FaceDown;
      fdeCard.face = wasDown ? CardFace.FaceUp : CardFace.FaceDown;
      log(`flip_draw_equal: ${fdeCard.defId} is now ${fdeCard.face}`);
      if (wasDown) enqueueEffectsOnFlipFaceUp(state, fdeOwnerIdx, fdeCard);
      const fdeDef = CARD_MAP.get(fdeCard.defId);
      // Draw equal to the post-flip effective value:
      // face-up → definition value; face-down → FACE_DOWN_VALUE, overridden by
      // any facedown_value_override passive that is face-up in the same line.
      let drawAmount: number;
      if (fdeCard.face === CardFace.FaceDown) {
        let faceDownOverride: number | null = null;
        for (const c of state.players[fdeOwnerIdx].lines[fdeLineIdx!].cards) {
          if (c.face !== CardFace.FaceUp) continue;
          const d = CARD_MAP.get(c.defId);
          if (!d) continue;
          for (const eff of d.effects) {
            if (eff.trigger === "passive" && eff.type === "facedown_value_override") {
              const v = typeof eff.payload?.value === "number" ? eff.payload.value : FACE_DOWN_VALUE;
              faceDownOverride = faceDownOverride === null ? v : Math.max(faceDownOverride, v);
            }
          }
        }
        drawAmount = faceDownOverride ?? FACE_DOWN_VALUE;
      } else {
        drawAmount = fdeDef?.value ?? 0;
      }
      if (drawAmount > 0) {
        log(`flip_draw_equal: drawing ${drawAmount}`);
        drawCards(state, ownerIndex, drawAmount);
      }
      break;
    }

    case "reveal_own_hand": {
      // Reveal 1 chosen hand card to the opponent for the rest of this turn.
      const cardId = payload.targetInstanceId as string | undefined;
      if (!cardId) {
        log("reveal_own_hand: no card chosen");
        break;
      }
      const inHand = state.players[ownerIndex].hand.some((c) => c.instanceId === cardId);
      if (!inHand) {
        log(`reveal_own_hand: card ${cardId} not found in hand`);
        break;
      }
      state.revealHandCardFor = { viewerIndex: oi, cardId };
      log(`reveal_own_hand: card ${cardId} revealed to opponent`);
      break;
    }

    case "reveal_shift_or_flip": {
      // Reveal a face-down card's identity, then flip or shift it.
      // Shift branch is stubbed — only flip is handled here.
      const targetId = payload.targetInstanceId as string | undefined;
      const action = payload.action as "flip" | "shift" | undefined;
      if (!targetId) {
        log("reveal_shift_or_flip: no targetInstanceId");
        break;
      }
      let rsfCard: CardInstance | null = null;
      let rsfOwnerIdx: 0 | 1 | null = null;
      outer: for (let pi = 0; pi < 2; pi++) {
        for (const line of state.players[pi].lines) {
          const c = line.cards.find((c) => c.instanceId === targetId);
          if (c) { rsfCard = c; rsfOwnerIdx = pi as 0 | 1; break outer; }
        }
      }
      if (!rsfCard || rsfOwnerIdx === null) {
        log(`reveal_shift_or_flip: card ${targetId} not found`);
        break;
      }
      if (rsfCard.face !== CardFace.FaceDown) {
        log("reveal_shift_or_flip: target is not face-down");
        break;
      }
      log(`reveal_shift_or_flip: revealed ${rsfCard.defId}`);
      if (action === "flip") {
        rsfCard.face = CardFace.FaceUp;
        enqueueEffectsOnFlipFaceUp(state, rsfOwnerIdx, rsfCard);
        log(`reveal_shift_or_flip: flipped ${rsfCard.defId} face-up`);
      } else if (action === "shift") {
        const shiftDest = payload.targetLineIndex as number | undefined;
        if (shiftDest === undefined || shiftDest < 0 || shiftDest > 2) {
          log("reveal_shift_or_flip: no valid targetLineIndex for shift");
        } else {
          // Find card and move it within its owner's lines
          let shifted = false;
          outerRsf: for (let pi = 0; pi < 2; pi++) {
            for (let li = 0; li < 3; li++) {
              const idx = state.players[pi].lines[li].cards.findIndex((c) => c.instanceId === targetId);
              if (idx !== -1) {
                if (li === shiftDest) {
                  log("reveal_shift_or_flip: card is already in target line");
                } else {
                  const [moved] = state.players[pi].lines[li].cards.splice(idx, 1);
                  state.players[pi].lines[shiftDest].cards.push(moved);
                  log(`reveal_shift_or_flip: shifted ${moved.defId} (P${pi}) to line ${shiftDest}`);
                  shifted = true;
                }
                break outerRsf;
              }
            }
          }
          if (!shifted) log(`reveal_shift_or_flip: card ${targetId} not found for shift`);
        }
      } else {
        log("reveal_shift_or_flip: skipped (no action chosen)");
      }
      break;
    }

    case "play_card": {
      // Grant the owner one bonus card play this turn (protocol rules apply normally).
      state.pendingBonusPlay = { anyLine: false };
      log("play_card: bonus play granted");
      break;
    }

    case "play_any_line": {
      // Draw 2, then grant a bonus play that ignores protocol line restrictions.
      const drawAmt = (payload.draw as number) ?? 2;
      drawCards(state, ownerIndex, drawAmt);
      state.pendingBonusPlay = { anyLine: true };
      log(`play_any_line: drew ${drawAmt}, bonus play (any line) granted`);
      break;
    }

    case "deck_to_other_lines": {
      // Find which of the owner's lines the source card is in, then play the
      // top deck card face-down in each of the other two lines.
      let srcLineIndex = -1;
      if (sourceInstanceId) {
        for (let li = 0; li < 3; li++) {
          if (state.players[ownerIndex].lines[li].cards.some((c) => c.instanceId === sourceInstanceId)) {
            srcLineIndex = li;
            break;
          }
        }
      }
      for (let li = 0; li < 3; li++) {
        if (li === srcLineIndex) continue;
        pushDeckCardFaceDown(state, ownerIndex, state.players[ownerIndex].lines[li], log);
      }
      log(`deck_to_other_lines: played into lines (skipped line ${srcLineIndex})`);
      break;
    }

    case "deck_to_each_line": {
      // Play the top deck card face-down in each line where the owner already
      // has at least one card.
      for (let li = 0; li < 3; li++) {
        const line = state.players[ownerIndex].lines[li];
        if (line.cards.length > 0) {
          pushDeckCardFaceDown(state, ownerIndex, line, log);
        }
      }
      log("deck_to_each_line: played from deck into each occupied line");
      break;
    }

    case "opponent_deck_to_line": {
      // Find the lineIndex where the source card lives, then make the opponent
      // play the top card of their deck face-down in their matching line.
      let lineIndex = -1;
      if (sourceInstanceId) {
        for (let li = 0; li < 3; li++) {
          if (state.players[ownerIndex].lines[li].cards.some((c) => c.instanceId === sourceInstanceId)) {
            lineIndex = li;
            break;
          }
        }
      }
      if (lineIndex === -1) {
        log("opponent_deck_to_line: source line not found");
        break;
      }
      pushDeckCardFaceDown(state, oi, state.players[oi].lines[lineIndex], log);
      log(`opponent_deck_to_line: opponent played face-down into line ${lineIndex}`);
      break;
    }

    case "deck_to_under": {
      // For every 2 cards already in this line, insert the top deck card just
      // below the source card (i.e., at the source card's current array index).
      if (!sourceInstanceId) {
        log("deck_to_under: no sourceInstanceId");
        break;
      }
      let foundLine = false;
      outerUnder: for (let li = 0; li < 3; li++) {
        const line = state.players[ownerIndex].lines[li];
        if (!line.cards.some((c) => c.instanceId === sourceInstanceId)) continue;
        foundLine = true;
        const times = Math.floor(line.cards.length / 2);
        for (let i = 0; i < times; i++) {
          const drawn = takeTopDeckCardNoReshuffle(state, ownerIndex, log);
          if (!drawn) break;
          drawn.face = CardFace.FaceDown;
          const idx = line.cards.findIndex((c) => c.instanceId === sourceInstanceId);
          line.cards.splice(idx, 0, drawn);
        }
        log(`deck_to_under: inserted ${times} card(s) under source in line ${li}`);
        break outerUnder;
      }
      if (!foundLine) log(`deck_to_under: source card not found in any line`);
      break;
    }

    case "shift_flip_self": {
      // Optional: shift 1 of own cards to a different line. If you do, flip this card.
      const targetId = payload.targetInstanceId as string | undefined;
      const targetLineIndex = payload.targetLineIndex as number | undefined;

      if (!targetId) {
        log("shift_flip_self: skipped (no card chosen to shift)");
        break;
      }
      if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
        log("shift_flip_self: invalid or missing targetLineIndex");
        break;
      }

      let shifted = false;
      outerShift: for (let li = 0; li < 3; li++) {
        const line = state.players[ownerIndex].lines[li];
        const idx = line.cards.findIndex((c) => c.instanceId === targetId);
        if (idx !== -1) {
          if (li === targetLineIndex) {
            log("shift_flip_self: card is already in the target line");
            break outerShift;
          }
          const [moved] = line.cards.splice(idx, 1);
          const sfsDest = state.players[ownerIndex].lines[targetLineIndex];
          const sfsPrevTop = sfsDest.cards.length > 0 ? sfsDest.cards[sfsDest.cards.length - 1] : null;
          sfsDest.cards.push(moved);
          if (sfsPrevTop) enqueueEffectsOnCover(state, sfsPrevTop, ownerIndex);
          log(`shift_flip_self: moved ${moved.defId} from line ${li} to line ${targetLineIndex}`);
          shifted = true;
          break outerShift;
        }
      }

      if (shifted && sourceInstanceId) {
        flipSourceCard(state, sourceInstanceId, log);
      } else if (!shifted) {
        log(`shift_flip_self: card ${targetId} not found in own lines`);
      }
      break;
    }

    case "flip": {
      const targets = payload.targets as string | undefined;
      const optional = (payload.optional as boolean) ?? false;
      const bonusDraw = (payload.draw as number) ?? 0;
      const targetId = payload.targetInstanceId as string | undefined;
      const flipCount = (payload.count as number) ?? 1;

      // Helper: find a card by instanceId across all players' lines
      const findFlipCard = (id: string): { card: CardInstance; ownerIdx: 0 | 1 } | null => {
        for (let pi = 0; pi < 2; pi++) {
          for (const line of state.players[pi].lines) {
            const c = line.cards.find((c) => c.instanceId === id);
            if (c) return { card: c, ownerIdx: pi as 0 | 1 };
          }
        }
        return null;
      };

      // Helper: toggle a card's face; trigger face-up effects when flipped from face-down
      const doFlip = (card: CardInstance, cardOwnerIdx: 0 | 1) => {
        // Check for on_covered_or_flip_delete_self — delete instead of flipping
        const flipDef = CARD_MAP.get(card.defId);
        if (flipDef?.effects.some((e) => e.trigger === "passive" && e.type === "cannot_be_flipped")) {
          log(`flip: ${card.defId} cannot be flipped`);
          return;
        }
        if (flipDef?.effects.some((e) => e.trigger === "passive" && e.type === "on_covered_or_flip_delete_self")) {
          for (const line of state.players[cardOwnerIdx].lines) {
            const idx = line.cards.findIndex((c) => c.instanceId === card.instanceId);
            if (idx !== -1) {
              const [trashed] = line.cards.splice(idx, 1);
              state.trashes[cardOwnerIdx].push(trashed);
              state.players[cardOwnerIdx].trashSize = state.trashes[cardOwnerIdx].length;
              log(`flip: ${card.defId} has on_covered_or_flip_delete_self — deleted instead`);
              return;
            }
          }
          return;
        }
        const wasDown = card.face === CardFace.FaceDown;
        card.face = wasDown ? CardFace.FaceUp : CardFace.FaceDown;
        log(`flip: ${card.defId} is now ${card.face}`);
        if (wasDown) enqueueEffectsOnFlipFaceUp(state, cardOwnerIdx, card);
      };

      // Auto-flip: flip all own face-up cards in the source card's line (excluding source)
      if (targets === "own_faceup_others") {
        for (const line of state.players[ownerIndex].lines) {
          if (sourceInstanceId && !line.cards.some((c) => c.instanceId === sourceInstanceId)) continue;
          for (const c of line.cards) {
            if (c.instanceId === sourceInstanceId) continue;
            if (c.face === CardFace.FaceUp) doFlip(c, ownerIndex);
          }
        }
        log("flip: auto-flipped own face-up others in source line");
        break;
      }

      // Auto-flip: flip all face-up cards from both players except source
      if (targets === "all_other_faceup") {
        for (let pi = 0; pi < 2; pi++) {
          for (const line of state.players[pi].lines) {
            for (const c of line.cards) {
              if (c.instanceId === sourceInstanceId) continue;
              if (c.face === CardFace.FaceUp) doFlip(c, pi as 0 | 1);
            }
          }
        }
        log("flip: auto-flipped all other face-up cards");
        break;
      }

      // Optional: player chose not to flip
      if (optional && !targetId) {
        log("flip: optional, skipped");
        break;
      }

      // Single-pick variants require a targetInstanceId
      if (!targetId) {
        log("flip: no targetInstanceId provided");
        break;
      }

      const flipFound = findFlipCard(targetId);
      if (!flipFound) {
        log(`flip: target ${targetId} not found`);
        break;
      }
      const { card: flipTarget, ownerIdx: flipOwnerIdx } = flipFound;

      // Per-variant validation
      if (targets === "any_other" && targetId === sourceInstanceId) {
        log("flip: cannot flip the source card (any_other)");
        break;
      }
      if (targets === "opponent_in_last_target_line") {
        if (flipOwnerIdx === ownerIndex || isCardCovered(state, targetId)) {
          log("flip: target must be an opponent's uncovered card");
          break;
        }
        const lastTargetId = state.lastTargetedInstanceId;
        if (!lastTargetId) {
          log("flip: no last targeted card for line comparison");
          break;
        }
        let lastTargetLine = -1;
        for (let li = 0; li < 3; li++) {
          if (state.players[ownerIndex].lines[li].cards.some((c) => c.instanceId === lastTargetId)) {
            lastTargetLine = li;
            break;
          }
        }
        if (lastTargetLine === -1) {
          log("flip: last targeted card is not on the owner's side");
          break;
        }
        const targetLine = state.players[oi].lines.findIndex((line) =>
          line.cards.some((c) => c.instanceId === targetId),
        );
        if (targetLine !== lastTargetLine) {
          log("flip: target must be in the same line as the last targeted card");
          break;
        }
      }
      if (targets === "self") {
        if (!sourceInstanceId) {
          log("flip: self target requires sourceInstanceId");
          break;
        }
        if (targetId !== sourceInstanceId) {
          log("flip: self target must be the source card");
          break;
        }
      }
      if (targets === "own_any" && flipOwnerIdx !== ownerIndex) {
        log("flip: target must be your own uncovered card");
        break;
      }
      if (targets === "any_card" && isCardCovered(state, targetId)) {
        log("flip: target must be an uncovered card");
        break;
      }
      if (targets === "any_faceup_uncovered" && (flipTarget.face !== CardFace.FaceUp || isCardCovered(state, targetId))) {
        log("flip: target must be an uncovered face-up card");
        break;
      }
      if (targets === "own_any" && isCardCovered(state, targetId)) {
        log("flip: target must be an uncovered card");
        break;
      }
      const minCountInField = payload.minCountInField as number | undefined;
      const protocolId = payload.protocolId as string | undefined;
      if (protocolId && minCountInField !== undefined) {
        if (countCardsInFieldByProtocol(state, protocolId) < minCountInField) {
          log(`flip: skipped (field has fewer than ${minCountInField} ${protocolId} card(s))`);
          break;
        }
      }
      const maxValueSource = payload.maxValueSource as string | undefined;
      const valueComparison = (payload.valueComparison as string | undefined) ?? "lt";
      if (maxValueSource === "distinct_protocols_in_field") {
        const threshold = countDistinctProtocolsInField(state);
        const cardValue = getEffectiveCardValue(flipTarget);
        const allowed = valueComparison === "lte" ? cardValue <= threshold : cardValue < threshold;
        if (!allowed) {
          log(`flip: target value must be ${valueComparison === "lte" ? "at most" : "less than"} ${threshold}`);
          break;
        }
      }
      if (targets === "any_covered" && !isCardCovered(state, targetId)) {
        log("flip: target must be a covered card");
        break;
      }
      if (targets === "any_faceup_covered" && (flipTarget.face !== CardFace.FaceUp || !isCardCovered(state, targetId))) {
        log("flip: target must be a face-up covered card");
        break;
      }
      if (targets === "any_other" && isCardCovered(state, targetId)) {
        log("flip: target must be an uncovered card");
        break;
      }
      if (targets === "opponent_faceup") {
        if (flipOwnerIdx === ownerIndex || flipTarget.face !== CardFace.FaceUp || isCardCovered(state, targetId)) {
          log("flip: target must be an opponent face-up card");
          break;
        }
      }
      if (targets === "opponent_any" && (flipOwnerIdx === ownerIndex || isCardCovered(state, targetId))) {
        log("flip: target must be an opponent's uncovered card");
        break;
      }
      if (targets === "any_uncovered" && isCardCovered(state, targetId!)) {
        log("flip: target must be an uncovered card");
        break;
      }
      if (targets === "own_faceup_covered") {
        if (flipOwnerIdx !== ownerIndex || flipTarget.face !== CardFace.FaceUp || !isCardCovered(state, targetId!)) {
          log("flip: target must be own face-up covered card");
          break;
        }
      }
      if (targets === "any_facedown" && (flipTarget.face !== CardFace.FaceDown || isCardCovered(state, targetId))) {
        log("flip: target must be an uncovered face-down card");
        break;
      }
      if (targets === "own_covered_in_line") {
        if (flipOwnerIdx !== ownerIndex || !isCardCovered(state, targetId!)) {
          log("flip: target must be own covered card");
          break;
        }
        if (sourceInstanceId) {
          let inSameLine = false;
          for (const line of state.players[ownerIndex].lines) {
            if (
              line.cards.some((c) => c.instanceId === sourceInstanceId) &&
              line.cards.some((c) => c.instanceId === targetId)
            ) {
              inSameLine = true;
              break;
            }
          }
          if (!inSameLine) {
            log("flip: target must be in the same line as the source card");
            break;
          }
        }
      }

      doFlip(flipTarget, flipOwnerIdx);
      state.lastTargetedInstanceId = targetId;
      if (bonusDraw > 0) drawCards(state, ownerIndex, bonusDraw);
      // If count > 1, push a fresh flip onto the front of the queue for the next pick
      if (flipCount > 1) {
        const nextPayload = { ...payload };
        delete nextPayload.targetInstanceId;
        nextPayload.count = flipCount - 1;
        state.effectQueue.unshift({
          ...effect,
          id: uuidv4(),
          payload: nextPayload,
        });
        log(`flip: ${flipCount - 1} more flip(s) remaining`);
      }
      break;
    }

    case "shift": {
      const targets = payload.targets as string | undefined;
      const targetId = payload.targetInstanceId as string | undefined;
      const targetLineIndex = payload.targetLineIndex as number | undefined;
      const toSourceLine = (payload.toSourceLine as boolean) ?? false;
      const optional = (payload.optional as boolean) ?? false;

      // Helper: find a card across all lines, returns location info
      const findShiftCard = (id: string): { pi: 0 | 1; li: number; idx: number; card: CardInstance } | null => {
        for (let pi = 0; pi < 2; pi++) {
          for (let li = 0; li < 3; li++) {
            const idx = state.players[pi].lines[li].cards.findIndex((c) => c.instanceId === id);
            if (idx !== -1) return { pi: pi as 0 | 1, li, idx, card: state.players[pi].lines[li].cards[idx] };
          }
        }
        return null;
      };

      // Helper: move a card to destLine within its owner's lines
      const doShift = (loc: { pi: 0 | 1; li: number; idx: number; card: CardInstance }, destLine: number): boolean => {
        if (destLine < 0 || destLine > 2) { log(`shift: invalid destLine ${destLine}`); return false; }
        if (loc.li === destLine) { log("shift: card is already in the target line"); return false; }
        const shiftDest = state.players[loc.pi].lines[destLine];
        const shiftPrevTop = shiftDest.cards.length > 0 ? shiftDest.cards[shiftDest.cards.length - 1] : null;
        const [moved] = state.players[loc.pi].lines[loc.li].cards.splice(loc.idx, 1);
        shiftDest.cards.push(moved);
        if (shiftPrevTop) enqueueEffectsOnCover(state, shiftPrevTop, loc.pi);
        log(`shift: moved ${moved.defId} (P${loc.pi}) from line ${loc.li} to line ${destLine}`);
        return true;
      };

      // Compute source card's line index (used by toSourceLine variants)
      let srcLine = -1;
      if (sourceInstanceId) {
        for (let li = 0; li < 3; li++) {
          if (state.players[ownerIndex].lines[li].cards.some((c) => c.instanceId === sourceInstanceId)) {
            srcLine = li;
            break;
          }
        }
      }

      // lgt_3: auto-shift ALL own face-down cards in source line to targetLineIndex
      if (targets === "own_facedown_in_line") {
        if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
          log("shift own_facedown_in_line: no valid targetLineIndex");
          break;
        }
        if (srcLine === -1) { log("shift own_facedown_in_line: source line not found"); break; }
        if (srcLine === targetLineIndex) { log("shift own_facedown_in_line: source and target are the same line"); break; }
        let movedCount = 0;
        for (const pi of [0, 1] as const) {
          const srcRef = state.players[pi].lines[srcLine];
          const toMove = srcRef.cards.filter((c) => c.face === CardFace.FaceDown && c.instanceId !== sourceInstanceId);
          const destRef = state.players[pi].lines[targetLineIndex];
          const prevTop = destRef.cards.length > 0 ? destRef.cards[destRef.cards.length - 1] : null;

          for (const c of [...toMove]) {
            const idx = srcRef.cards.indexOf(c);
            if (idx !== -1) srcRef.cards.splice(idx, 1);
            destRef.cards.push(c);
          }

          if (toMove.length > 0 && prevTop) enqueueEffectsOnCover(state, prevTop, pi);
          movedCount += toMove.length;
        }
        log(`shift own_facedown_in_line: moved ${movedCount} card(s) from line ${srcLine} to line ${targetLineIndex}`);
        break;
      }

      // last_targeted: drk_1 (player-chosen dest), grv_2 (auto-dest = source line via toSourceLine: true)
      if (targets === "last_targeted") {
        const lastId = state.lastTargetedInstanceId;
        if (!lastId) { log("shift last_targeted: no last targeted card"); break; }
        const found = findShiftCard(lastId);
        if (!found) { log(`shift last_targeted: last targeted card ${lastId} not found`); break; }
        const dest = toSourceLine ? srcLine : targetLineIndex;
        if (dest === undefined || dest < 0 || dest > 2) { log("shift last_targeted: no valid destination line"); break; }
        doShift(found, dest);
        break;
      }

      // self_if_covered: ice_3 — if source card is covered, shift it to the chosen line (optional)
      if (targets === "self_if_covered") {
        if (!sourceInstanceId) { log("shift self_if_covered: no sourceInstanceId"); break; }
        if (!isCardCovered(state, sourceInstanceId)) {
          log("shift self_if_covered: source card is not covered — skipped");
          break;
        }
        const selfFound = findShiftCard(sourceInstanceId);
        if (!selfFound) { log("shift self_if_covered: source card not found"); break; }
        if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
          if (optional) { log("shift self_if_covered: skipped (optional, no line chosen)"); break; }
          log("shift self_if_covered: no valid targetLineIndex"); break;
        }
        doShift(selfFound, targetLineIndex);
        break;
      }

      // grv_1 (no targets): shift any own card to or from source line
      if (!targets) {
        if (!targetId) { log("shift: no targetInstanceId"); break; }
        if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
          log("shift: no valid targetLineIndex"); break;
        }
        const found = findShiftCard(targetId);
        if (!found) { log(`shift: card ${targetId} not found`); break; }
        if (isCardCovered(state, found.card.instanceId)) { log("shift: target must be uncovered"); break; }
        if (found.pi !== ownerIndex) { log("shift: grv_1 may only shift own cards"); break; }
        if (srcLine < 0 || srcLine > 2) { log("shift: source line not found"); break; }
        // "Either to or from this line":
        // - picked from source line => must move to a different own line
        // - picked from another own line => must move to source line
        if (found.li === srcLine) {
          if (targetLineIndex === srcLine) {
            log("shift: cannot target same source line when shifting from source line");
            break;
          }
        } else if (targetLineIndex !== srcLine) {
          log("shift: move must be to source line when picked card is outside source line");
          break;
        }
        doShift(found, targetLineIndex);
        break;
      }

      // All remaining variants require targetId and targetLineIndex (unless toSourceLine overrides)
      if (!targetId) {
        if (optional) {
          log("shift: skipped (optional, no target chosen)");
          break;
        }
        log("shift: no targetInstanceId");
        break;
      }
      const found = findShiftCard(targetId);
      if (!found) { log(`shift: card ${targetId} not found`); break; }

      // any_facedown: drk_4 (player-chosen dest) or grv_4 (toSourceLine: true)
      if (targets === "any_facedown") {
        if (found.card.face !== CardFace.FaceDown || isCardCovered(state, found.card.instanceId)) { log("shift any_facedown: target must be uncovered face-down"); break; }
        const dest = toSourceLine ? srcLine : targetLineIndex;
        if (dest === undefined || dest < 0 || dest > 2) { log("shift any_facedown: no valid destination line"); break; }
        doShift(found, dest!);
        break;
      }

      if (targets === "any_uncovered") {
        if (isCardCovered(state, found.card.instanceId)) { log("shift any_uncovered: target must be uncovered"); break; }
        if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) { log("shift any_uncovered: no valid targetLineIndex"); break; }
        doShift(found, targetLineIndex);
        break;
      }

      if (targets === "covered_facedown") {
        if (found.card.face !== CardFace.FaceDown || !isCardCovered(state, found.card.instanceId)) { log("shift covered_facedown: target must be covered face-down"); break; }
        if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) { log("shift covered_facedown: no valid targetLineIndex"); break; }
        doShift(found, targetLineIndex);
        break;
      }

      // For all remaining variants the targetLineIndex is required
      if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
        log("shift: no valid targetLineIndex"); break;
      }

      // opponent_covered: drk_0 — opponent's covered card
      if (targets === "opponent_covered") {
        if (found.pi === ownerIndex) { log("shift opponent_covered: must target opponent's card"); break; }
        if (!isCardCovered(state, found.card.instanceId)) { log("shift opponent_covered: target must be covered"); break; }
        doShift(found, targetLineIndex);
        break;
      }

      // opponent_any: psy_3 — any opponent card
      if (targets === "opponent_any") {
        if (found.pi === ownerIndex) { log("shift opponent_any: must target opponent's card"); break; }
        if (isCardCovered(state, found.card.instanceId)) { log("shift opponent_any: target must be uncovered"); break; }
        doShift(found, targetLineIndex);
        break;
      }

      // opponent_facedown: spd_4 — opponent face-down card
      if (targets === "opponent_facedown") {
        if (found.pi === ownerIndex) { log("shift opponent_facedown: must target opponent's card"); break; }
        if (found.card.face !== CardFace.FaceDown || isCardCovered(state, found.card.instanceId)) { log("shift opponent_facedown: target must be uncovered face-down"); break; }
        doShift(found, targetLineIndex);
        break;
      }

      // own_others: spd_3 — own card that is not the source
      if (targets === "own_others") {
        if (found.pi !== ownerIndex) { log("shift own_others: must target own card"); break; }
        if (isCardCovered(state, found.card.instanceId)) { log("shift own_others: target must be uncovered"); break; }
        if (sourceInstanceId && found.card.instanceId === sourceInstanceId) {
          log("shift own_others: cannot shift source card"); break;
        }
        doShift(found, targetLineIndex);
        break;
      }

      if (targets === "any_other") {
        if (found.card.instanceId === sourceInstanceId) { log("shift any_other: cannot shift source card"); break; }
        if (isCardCovered(state, found.card.instanceId)) { log("shift any_other: target must be uncovered"); break; }
        doShift(found, targetLineIndex);
        break;
      }

      // own_covered: own covered (non-top) card — cha_2
      if (targets === "own_covered") {
        if (found.pi !== ownerIndex) { log("shift own_covered: must target own card"); break; }
        if (!isCardCovered(state, found.card.instanceId)) { log("shift own_covered: target must be covered"); break; }
        doShift(found, targetLineIndex);
        break;
      }

      // opponent_in_source_line: uncovered opponent card in the source line — fea_3
      if (targets === "opponent_in_source_line") {
        if (srcLine < 0) { log("shift opponent_in_source_line: source line not found"); break; }
        if (found.pi === ownerIndex) { log("shift opponent_in_source_line: must target opponent card"); break; }
        if (found.li !== srcLine) { log("shift opponent_in_source_line: target must be in source line"); break; }
        if (isCardCovered(state, found.card.instanceId)) { log("shift opponent_in_source_line: target must be uncovered"); break; }
        doShift(found, targetLineIndex);
        break;
      }

      log(`shift: unknown targets variant "${targets}"`);
      break;
    }

    case "on_covered_delete_self": {
      // lif_0: when covered, delete this card from its line
      if (!sourceInstanceId) { log("on_covered_delete_self: no source"); break; }
      let dcsSeen = false;
      outerDCS: for (let pi = 0; pi < 2; pi++) {
        for (const line of state.players[pi].lines) {
          const idx = line.cards.findIndex((c) => c.instanceId === sourceInstanceId);
          if (idx !== -1) {
            const [trashed] = line.cards.splice(idx, 1);
            state.trashes[pi].push(trashed);
            state.players[pi].trashSize = state.trashes[pi].length;
            log(`on_covered_delete_self: deleted ${trashed.defId}`);
            dcsSeen = true;
            break outerDCS;
          }
        }
      }
      if (!dcsSeen) log(`on_covered_delete_self: source ${sourceInstanceId} not found`);
      for (const { card, amount: drawAmt } of scanPassives(state, ownerIndex, "after_delete_draw")) {
        log(`after_delete_draw (${card.defId}): drawing ${drawAmt}`);
        drawCards(state, ownerIndex, drawAmt);
      }
      break;
    }

    case "delete_self_if_covered": {
      if (!sourceInstanceId) { log("delete_self_if_covered: no sourceInstanceId"); break; }
      if (!isCardCovered(state, sourceInstanceId)) {
        log("delete_self_if_covered: skipped (source is not covered)");
        break;
      }
      let deleted = false;
      for (let pi = 0; pi < 2; pi++) {
        for (const line of state.players[pi].lines) {
          const idx = line.cards.findIndex((c) => c.instanceId === sourceInstanceId);
          if (idx !== -1) {
            const [trashed] = line.cards.splice(idx, 1);
            state.trashes[pi].push(trashed);
            state.players[pi].trashSize = state.trashes[pi].length;
            log(`delete_self_if_covered: deleted ${trashed.defId}`);
            deleted = true;
            break;
          }
        }
        if (deleted) break;
      }
      if (!deleted) log("delete_self_if_covered: source card not found");
      for (const { card, amount: drawAmt } of scanPassives(state, ownerIndex, "after_delete_draw")) {
        log(`after_delete_draw (${card.defId}): drawing ${drawAmt}`);
        drawCards(state, ownerIndex, drawAmt);
      }
      break;
    }

    case "on_covered_delete_lowest": {
      // hat_4: delete the lowest-value covered card in this line
      if (!sourceInstanceId) { log("on_covered_delete_lowest: no source"); break; }
      let dclFound = false;
      outerDCL: for (let pi = 0; pi < 2; pi++) {
        for (const line of state.players[pi].lines) {
          if (!line.cards.some((c) => c.instanceId === sourceInstanceId)) continue;
          dclFound = true;
          if (line.cards.length <= 1) {
            log("on_covered_delete_lowest: no covered cards to delete");
            break outerDCL;
          }
          const coveredSlice = line.cards.slice(0, line.cards.length - 1);
          let lowestCard: CardInstance | null = null;
          let lowestVal = Infinity;
          for (const c of coveredSlice) {
            const val = c.face === CardFace.FaceDown ? 2 : (CARD_MAP.get(c.defId)?.value ?? 0);
            if (val < lowestVal) { lowestVal = val; lowestCard = c; }
          }
          if (lowestCard) {
            const idx = line.cards.indexOf(lowestCard);
            line.cards.splice(idx, 1);
            state.trashes[pi].push(lowestCard);
            state.players[pi].trashSize = state.trashes[pi].length;
            log(`on_covered_delete_lowest: deleted ${lowestCard.defId} (value ${lowestVal}) from P${pi}`);
          }
          break outerDCL;
        }
      }
      if (!dclFound) log(`on_covered_delete_lowest: source ${sourceInstanceId} not found`);
      for (const { card, amount: drawAmt } of scanPassives(state, ownerIndex, "after_delete_draw")) {
        log(`after_delete_draw (${card.defId}): drawing ${drawAmt}`);
        drawCards(state, ownerIndex, drawAmt);
      }
      break;
    }

    case "on_covered_deck_to_other_line": {
      // lif_3: play top deck face-down in a player-chosen other line
      const dcolTarget = payload.targetLineIndex as number | undefined;
      if (dcolTarget === undefined) {
        log("on_covered_deck_to_other_line: no targetLineIndex provided");
        break;
      }
      if (dcolTarget < 0 || dcolTarget > 2) {
        log(`on_covered_deck_to_other_line: invalid lineIndex ${dcolTarget}`);
        break;
      }
      if (sourceInstanceId) {
        const srcLineOfCard = state.players[ownerIndex].lines.findIndex(
          (l) => l.cards.some((c) => c.instanceId === sourceInstanceId)
        );
        if (srcLineOfCard === dcolTarget) {
          log("on_covered_deck_to_other_line: must target a different line from the source card");
          break;
        }
      }
      pushDeckCardFaceDown(state, ownerIndex, state.players[ownerIndex].lines[dcolTarget], log);
      log(`on_covered_deck_to_other_line: played face-down into line ${dcolTarget}`);
      break;
    }

    case "after_draw_shift_self": {
      // spr_3: after drawing, shift this card to a chosen line (optional)
      const adssTarget = payload.targetLineIndex as number | undefined;
      if (adssTarget === undefined) {
        log("after_draw_shift_self: skipped (no targetLineIndex provided)");
        break;
      }
      if (adssTarget < 0 || adssTarget > 2) {
        log(`after_draw_shift_self: invalid targetLineIndex ${adssTarget}`);
        break;
      }
      if (!sourceInstanceId) {
        log("after_draw_shift_self: no sourceInstanceId");
        break;
      }
      let adssShifted = false;
      outer: for (let li = 0; li < 3; li++) {
        const srcLine = state.players[ownerIndex].lines[li];
        const cardIdx = srcLine.cards.findIndex((c) => c.instanceId === sourceInstanceId);
        if (cardIdx !== -1) {
          if (li === adssTarget) {
            log("after_draw_shift_self: card is already in the target line — skipped");
            adssShifted = true;
            break outer;
          }
          const [moved] = srcLine.cards.splice(cardIdx, 1);
          const destLine = state.players[ownerIndex].lines[adssTarget];
          const prevTop = destLine.cards.length > 0 ? destLine.cards[destLine.cards.length - 1] : null;
          destLine.cards.push(moved);
          if (prevTop) enqueueEffectsOnCover(state, prevTop, ownerIndex);
          log(`after_draw_shift_self: shifted ${moved.defId} to line ${adssTarget}`);
          adssShifted = true;
          break outer;
        }
      }
      if (!adssShifted) log(`after_draw_shift_self: card ${sourceInstanceId} not found in own lines`);
      break;
    }

    case "on_compile_delete_shift_self": {
      // spd_2: when deleted by compiling, shift this card to a chosen line
      const ocdssSavedId = payload.savedInstanceId as string | undefined;
      const ocdssTarget = payload.targetLineIndex as number | undefined;
      if (!ocdssSavedId) {
        log("on_compile_delete_shift_self: no savedInstanceId in payload");
        break;
      }
      const savedIdx = state.compileSavedCards.findIndex((s) => s.card.instanceId === ocdssSavedId);
      if (savedIdx === -1) {
        log(`on_compile_delete_shift_self: ${ocdssSavedId} not found in compileSavedCards`);
        break;
      }
      // Remove from the saved buffer regardless of whether placement succeeds
      const { card: savedCard } = state.compileSavedCards.splice(savedIdx, 1)[0];
      if (ocdssTarget === undefined || ocdssTarget < 0 || ocdssTarget > 2) {
        log("on_compile_delete_shift_self: no valid targetLineIndex — card lost");
        break;
      }
      const ocdssDest = state.players[ownerIndex].lines[ocdssTarget];
      const ocdssPrevTop =
        ocdssDest.cards.length > 0 ? ocdssDest.cards[ocdssDest.cards.length - 1] : null;
      ocdssDest.cards.push(savedCard);
      if (ocdssPrevTop) enqueueEffectsOnCover(state, ocdssPrevTop, ownerIndex);
      log(`on_compile_delete_shift_self: shifted ${savedCard.defId} to line ${ocdssTarget}`);
      break;
    }

    case "discard_entire_deck": {
      const deck = state.decks[ownerIndex];
      const moved = deck.splice(0);
      for (const card of moved) card.face = CardFace.FaceUp;
      state.trashes[ownerIndex].push(...moved);
      state.players[ownerIndex].deckSize = 0;
      state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
      log(`discard_entire_deck: moved ${moved.length} card(s) to trash`);
      break;
    }

    case "play_top_deck_facedown_then_flip": {
      let placed = false;
      for (let li = 0; li < 3; li++) {
        if (!sourceInstanceId || !state.players[ownerIndex].lines[li].cards.some((c) => c.instanceId === sourceInstanceId)) continue;
        const line = state.players[ownerIndex].lines[li];
        const drawn = takeTopDeckCardNoReshuffle(state, ownerIndex, log);
        if (!drawn) break;
        drawn.face = CardFace.FaceDown;
        const prevTop = line.cards.length > 0 ? line.cards[line.cards.length - 1] : null;
        line.cards.push(drawn);
        if (prevTop) enqueueEffectsOnCover(state, prevTop, ownerIndex);
        drawn.face = CardFace.FaceUp;
        enqueueEffectsOnFlipFaceUp(state, ownerIndex, drawn);
        log(`play_top_deck_facedown_then_flip: played and flipped ${drawn.defId} in line ${li}`);
        placed = true;
        break;
      }
      if (!placed) log("play_top_deck_facedown_then_flip: source line not found or deck empty");
      break;
    }

    case "top_deck_discard_draw_value": {
      const discarded = takeTopDeckCardNoReshuffle(state, ownerIndex, log);
      if (!discarded) break;
      const wasFaceDown = discarded.face === CardFace.FaceDown;
      discarded.face = CardFace.FaceUp;
      state.trashes[ownerIndex].push(discarded);
      state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
      const def = CARD_MAP.get(discarded.defId);
      const amount = wasFaceDown ? FACE_DOWN_VALUE : (def?.value ?? FACE_DOWN_VALUE);
      log(`top_deck_discard_draw_value: discarded ${discarded.defId}, drawing ${amount}`);
      drawCards(state, ownerIndex, amount);
      break;
    }

    case "top_deck_to_lines_with_facedown": {
      let moved = 0;
      for (let li = 0; li < 3; li++) {
        const line = state.players[ownerIndex].lines[li];
        if (!line.cards.some((card) => card.face === CardFace.FaceDown)) continue;
        pushDeckCardFaceDown(state, ownerIndex, line, log);
        moved++;
      }
      log(`top_deck_to_lines_with_facedown: played into ${moved} line(s)`);
      break;
    }

    case "opponent_discard_hand_then_draw_minus": {
      const hand = state.players[oi].hand.splice(0);
      const discardedCount = hand.length;
      for (const card of hand) card.face = CardFace.FaceUp;
      state.trashes[oi].push(...hand);
      state.players[oi].trashSize = state.trashes[oi].length;
      const drawAmount = Math.max(0, discardedCount - 1);
      log(`opponent_discard_hand_then_draw_minus: discarded ${discardedCount}, drawing ${drawAmount}`);
      if (drawAmount > 0) drawCards(state, oi, drawAmount);
      break;
    }

    case "opponent_discard_random": {
      const amount = Math.min((payload.amount as number) ?? 1, state.players[oi].hand.length);
      discardFromHand(state, oi, amount);
      log(`opponent_discard_random: opponent discarded ${amount} random card(s)`);
      break;
    }

    case "both_players_discard_hand": {
      for (const pi of [0, 1] as const) {
        const hand = state.players[pi].hand.splice(0);
        for (const card of hand) card.face = CardFace.FaceUp;
        state.trashes[pi].push(...hand);
        state.players[pi].trashSize = state.trashes[pi].length;
      }
      log("both_players_discard_hand: both hands discarded");
      break;
    }

    case "discard_hand_then_draw_same": {
      const hand = state.players[ownerIndex].hand.splice(0);
      const count = hand.length;
      for (const card of hand) card.face = CardFace.FaceUp;
      state.trashes[ownerIndex].push(...hand);
      state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
      log(`discard_hand_then_draw_same: discarded ${count}, drawing ${count}`);
      if (count > 0) drawCards(state, ownerIndex, count);
      break;
    }

    case "reshuffle_trash": {
      const trash = state.trashes[ownerIndex];
      if (trash.length === 0) { log("reshuffle_trash: trash is already empty"); break; }
      const reshuffled = shuffle(trash.splice(0));
      reshuffled.forEach((c) => (c.face = CardFace.FaceDown));
      state.decks[ownerIndex].push(...reshuffled);
      state.players[ownerIndex].deckSize = state.decks[ownerIndex].length;
      state.players[ownerIndex].trashSize = 0;
      log(`reshuffle_trash: shuffled ${reshuffled.length} card(s) from trash into deck`);
      break;
    }

    case "swap_top_deck_draws": {
      // Both players draw the top card of the opponent's deck (cha_0 start, asm_4)
      const topForOi = takeTopDeckCardNoReshuffle(state, oi, log);
      const topForOwner = takeTopDeckCardNoReshuffle(state, ownerIndex, log);
      if (topForOi) {
        topForOi.face = CardFace.FaceUp;
        state.players[ownerIndex].hand.push(topForOi);
        log(`swap_top_deck_draws: P${ownerIndex} drew ${topForOi.defId} from P${oi}'s deck`);
      }
      if (topForOwner) {
        topForOwner.face = CardFace.FaceUp;
        state.players[oi].hand.push(topForOwner);
        log(`swap_top_deck_draws: P${oi} drew ${topForOwner.defId} from P${ownerIndex}'s deck`);
      }
      break;
    }

    case "flip_covered_in_each_line": {
      // cha_0 immediate: in each line, flip 1 covered card (the deepest covered card)
      let flipped = 0;
      for (let pi = 0; pi < 2; pi++) {
        for (let li = 0; li < 3; li++) {
          const line = state.players[pi as 0 | 1].lines[li];
          if (line.cards.length < 2) continue;
          const covered = line.cards.slice(0, line.cards.length - 1);
          if (covered.length === 0) continue;
          const target = covered[0]; // deepest covered card
          const wasDown = target.face === CardFace.FaceDown;
          target.face = wasDown ? CardFace.FaceUp : CardFace.FaceDown;
          log(`flip_covered_in_each_line: P${pi} L${li} flipped ${target.defId} to ${target.face}`);
          if (wasDown) enqueueEffectsOnFlipFaceUp(state, pi as 0 | 1, target);
          flipped++;
        }
      }
      log(`flip_covered_in_each_line: flipped ${flipped} card(s)`);
      break;
    }

    case "flip_self_if_opponent_higher_in_line": {
      if (!sourceInstanceId) { log("flip_self_if_opponent_higher_in_line: no sourceInstanceId"); break; }
      let flSrcLine = -1;
      for (let li = 0; li < 3; li++) {
        if (state.players[ownerIndex].lines[li].cards.some((c) => c.instanceId === sourceInstanceId)) {
          flSrcLine = li; break;
        }
      }
      if (flSrcLine === -1) { log("flip_self_if_opponent_higher_in_line: source line not found"); break; }
      if (lineValue(state, oi, flSrcLine) > lineValue(state, ownerIndex, flSrcLine)) {
        log("flip_self_if_opponent_higher_in_line: condition met — flipping self");
        flipSourceCard(state, sourceInstanceId, log);
      } else {
        log("flip_self_if_opponent_higher_in_line: skipped (opponent not higher)");
      }
      break;
    }

    case "discard_or_delete_self": {
      // cor_6: discard 1 hand card OR (if no card chosen) delete source
      const targetId = payload.targetInstanceId as string | undefined;
      if (targetId) {
        const hand = state.players[ownerIndex].hand;
        const idx = hand.findIndex((c) => c.instanceId === targetId);
        if (idx === -1) { log(`discard_or_delete_self: ${targetId} not in hand — deleting self`); }
        else {
          const [discarded] = hand.splice(idx, 1);
          discarded.face = CardFace.FaceUp;
          state.trashes[ownerIndex].push(discarded);
          state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
          log(`discard_or_delete_self: discarded ${discarded.defId}`);
          break;
        }
      }
      // No discard target — delete the source card
      if (!sourceInstanceId) { log("discard_or_delete_self: no sourceInstanceId for delete fallback"); break; }
      outerDODS: for (let pi = 0; pi < 2; pi++) {
        for (const line of state.players[pi as 0 | 1].lines) {
          const idx = line.cards.findIndex((c) => c.instanceId === sourceInstanceId);
          if (idx !== -1) {
            const [trashed] = line.cards.splice(idx, 1);
            trashed.face = CardFace.FaceUp;
            state.trashes[pi].push(trashed);
            state.players[pi].trashSize = state.trashes[pi].length;
            log(`discard_or_delete_self: deleted ${trashed.defId}`);
            break outerDODS;
          }
        }
      }
      break;
    }

    case "take_opponent_facedown_to_hand": {
      // asm_0: grab 1 of the opponent's face-down cards (covered or uncovered) to own hand
      const targetId = payload.targetInstanceId as string | undefined;
      if (!targetId) { log("take_opponent_facedown_to_hand: no target"); break; }
      outerTOF: for (const line of state.players[oi].lines) {
        const idx = line.cards.findIndex((c) => c.instanceId === targetId);
        if (idx !== -1) {
          if (line.cards[idx].face !== CardFace.FaceDown) {
            log("take_opponent_facedown_to_hand: target must be face-down"); break outerTOF;
          }
          const [taken] = line.cards.splice(idx, 1);
          taken.face = CardFace.FaceUp;
          state.players[ownerIndex].hand.push(taken);
          log(`take_opponent_facedown_to_hand: took ${taken.defId} from opponent`);
          break outerTOF;
        }
      }
      break;
    }

    case "delete_in_winning_line": {
      // crg_1: delete 1 opponent card in a line where opponent has higher total value
      const targetId = payload.targetInstanceId as string | undefined;
      if (!targetId) { log("delete_in_winning_line: no target"); break; }
      outerDIW: for (let li = 0; li < 3; li++) {
        const line = state.players[oi].lines[li];
        const idx = line.cards.findIndex((c) => c.instanceId === targetId);
        if (idx !== -1) {
          if (lineValue(state, oi, li) <= lineValue(state, ownerIndex, li)) {
            log(`delete_in_winning_line: opponent does not have higher value in line ${li} — rejected`);
            break outerDIW;
          }
          if (isCardCovered(state, targetId)) { log("delete_in_winning_line: target must be uncovered"); break outerDIW; }
          const [trashed] = line.cards.splice(idx, 1);
          trashed.face = CardFace.FaceUp;
          state.trashes[oi].push(trashed);
          state.players[oi].trashSize = state.trashes[oi].length;
          log(`delete_in_winning_line: deleted ${trashed.defId} from P${oi} line ${li}`);
          for (const { card, amount: drawAmt } of scanPassives(state, ownerIndex, "after_delete_draw")) {
            log(`after_delete_draw: drawing ${drawAmt}`); drawCards(state, ownerIndex, drawAmt);
          }
          break outerDIW;
        }
      }
      break;
    }

    case "shift_self_to_best_opponent_line": {
      // crg_3: auto-shift source card to the line where opponent has highest total value
      if (!sourceInstanceId) { log("shift_self_to_best_opponent_line: no sourceInstanceId"); break; }
      let selfLoc: { li: number; idx: number } | null = null;
      for (let li = 0; li < 3; li++) {
        const idx = state.players[ownerIndex].lines[li].cards.findIndex((c) => c.instanceId === sourceInstanceId);
        if (idx !== -1) { selfLoc = { li, idx }; break; }
      }
      if (!selfLoc) { log("shift_self_to_best_opponent_line: source not found in own lines"); break; }
      let bestLine = 0, bestVal = -Infinity;
      for (let li = 0; li < 3; li++) {
        const v = lineValue(state, oi, li);
        if (v > bestVal) { bestVal = v; bestLine = li; }
      }
      if (selfLoc.li === bestLine) { log("shift_self_to_best_opponent_line: already in best line"); break; }
      const [moved] = state.players[ownerIndex].lines[selfLoc.li].cards.splice(selfLoc.idx, 1);
      const destLine = state.players[ownerIndex].lines[bestLine];
      const prevTop = destLine.cards.length > 0 ? destLine.cards[destLine.cards.length - 1] : null;
      destLine.cards.push(moved);
      if (prevTop) enqueueEffectsOnCover(state, prevTop, ownerIndex);
      log(`shift_self_to_best_opponent_line: shifted ${moved.defId} to line ${bestLine} (opp val ${bestVal})`);
      break;
    }

    case "discard_then_opponent_discard": {
      // crg_0 end: optionally discard 1 own card; if discarded, opponent also discards 1
      const targetId = payload.targetInstanceId as string | undefined;
      if (!targetId) {
        log("discard_then_opponent_discard: skipped (no card chosen)");
        break;
      }
      const hand = state.players[ownerIndex].hand;
      const idx = hand.findIndex((c) => c.instanceId === targetId);
      if (idx === -1) { log(`discard_then_opponent_discard: ${targetId} not in hand`); break; }
      const [discarded] = hand.splice(idx, 1);
      discarded.face = CardFace.FaceUp;
      state.trashes[ownerIndex].push(discarded);
      state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
      log(`discard_then_opponent_discard: discarded ${discarded.defId} — queuing opponent discard`);
      state.effectQueue.push({
        id: uuidv4(), cardDefId, cardName: effect.cardName,
        type: "discard", description: "Choose a card to discard.",
        ownerIndex: oi, trigger: effect.trigger, payload: {},
        sourceInstanceId,
      });
      break;
    }

    case "delete_self_if_field_protocols_below": {
      const minDistinct = (payload.minDistinct as number) ?? 4;
      const distinct = countDistinctProtocolsInField(state);
      if (distinct >= minDistinct) {
        log(`delete_self_if_field_protocols_below: skipped (${distinct} distinct protocol(s), need < ${minDistinct})`);
        break;
      }
      if (!sourceInstanceId) {
        log("delete_self_if_field_protocols_below: no sourceInstanceId");
        break;
      }
      let deleted = false;
      outerDS: for (let pi = 0; pi < 2; pi++) {
        for (const line of state.players[pi as 0 | 1].lines) {
          const idx = line.cards.findIndex((c) => c.instanceId === sourceInstanceId);
          if (idx === -1) continue;
          const [trashed] = line.cards.splice(idx, 1);
          trashed.face = CardFace.FaceUp;
          state.trashes[pi].push(trashed);
          state.players[pi].trashSize = state.trashes[pi].length;
          log(`delete_self_if_field_protocols_below: deleted ${trashed.defId} (${distinct} distinct protocol(s))`);
          deleted = true;
          break outerDS;
        }
      }
      if (!deleted) log("delete_self_if_field_protocols_below: source not found");
      break;
    }

    case "draw_per_protocol_cards_in_field": {
      const protocolId = payload.protocolId as string | undefined;
      if (!protocolId) {
        log("draw_per_protocol_cards_in_field: missing protocolId");
        break;
      }
      const amount = countCardsInFieldByProtocol(state, protocolId);
      if (amount <= 0) {
        log(`draw_per_protocol_cards_in_field: no ${protocolId} cards in field`);
        break;
      }
      log(`draw_per_protocol_cards_in_field: drawing ${amount} for protocol ${protocolId}`);
      drawCards(state, ownerIndex, amount);
      break;
    }

    default:
      if (!KNOWN_STUB_TYPES.has(type)) {
        log(`unhandled effect type: ${type}`);
      }
      break;
  }
}
