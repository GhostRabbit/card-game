/**
 * Hand & Discard Effect Handlers
 *
 * Effects that primarily involve moving cards between hand, trash, field, and
 * the opponent's hand:
 *   - discard              Core hand → trash (with passive triggering)
 *   - opponent_discard     Queue opponent to choose a discard
 *   - opponent_discard_reveal  Same, but also reveals opponent hand
 *   - discard_or_flip_self Player chooses: discard a card OR flip source
 *   - discard_then_opponent_discard  Own discard triggers opponent discard
 *   - exchange_hand        Take a random opponent card, then give one back
 *   - give_to_draw         Give 1 card to opponent, draw 2
 *   - draw_from_opponent_deck  Steal top card of opponent deck
 *   - play_facedown        Play a hand card face-down into a line
 *   - return               Move a field card back to a hand
 */

import { CardFace, getOpponentIndex } from "@compile/shared";
import { v4 as uuidv4 } from "uuid";
import { ServerGameState, drawCards, FACE_DOWN_VALUE } from "../GameEngine";
import { CARD_MAP } from "../../data/cards";
import { scanPassives, flipSourceCard, enqueueEffectsOnCover, findSourceLineIndex } from "../CardEffects";
import { EffectHandler, registerHandler } from "./registry";
import { shuffle } from "../DraftEngine";

// ─── discard ──────────────────────────────────────────────────────────────────

/** Move a specific hand card to trash. Also triggers after_opp_discard_draw
 *  passives and sets revealOpponentHandFor when the payload requests it. */
const handleDiscard: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const targetId = payload.targetInstanceId as string | undefined;
  const hand = state.players[ownerIndex].hand;
  const trash = state.trashes[ownerIndex];

  if (!targetId) {
    log("discard: no target provided (hand empty or skipped)");
    return;
  }
  const idx = hand.findIndex((c) => c.instanceId === targetId);
  if (idx === -1) {
    log(`discard: card ${targetId} not found in hand`);
    return;
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
};

registerHandler("discard", handleDiscard);

// ─── opponent_discard ─────────────────────────────────────────────────────────

/** Queue N discard prompts for the opponent to resolve. */
const handleOpponentDiscard: EffectHandler = (state, effect, log) => {
  const { ownerIndex, cardDefId, payload, sourceInstanceId } = effect;
  const oi = getOpponentIndex(ownerIndex);
  const amount = (payload.amount as number) ?? 1;
  const toQueue = Math.min(amount, state.players[oi].hand.length);

  log(`opponent_discard ${amount} (opponent chooses)`);
  for (let i = 0; i < toQueue; i++) {
    state.effectQueue.push({
      id: uuidv4(),
      cardDefId,
      cardName: effect.cardName,
      type: "discard",
      description: "Choose a card to discard.",
      ownerIndex: oi,
      trigger: effect.trigger,
      payload: { oppDiscardDrawFor: ownerIndex },
      sourceInstanceId,
    });
  }
};

registerHandler("opponent_discard", handleOpponentDiscard);

// ─── opponent_discard_reveal ──────────────────────────────────────────────────

/** Same as opponent_discard but also sets revealOpponentHandFor in each sub-prompt. */
const handleOpponentDiscardReveal: EffectHandler = (state, effect, log) => {
  const { ownerIndex, cardDefId, payload, sourceInstanceId } = effect;
  const oi = getOpponentIndex(ownerIndex);
  const amount = (payload.amount as number) ?? 1;
  const toQueue = Math.min(amount, state.players[oi].hand.length);

  log(`opponent_discard_reveal ${amount} (opponent chooses)`);
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
};

registerHandler("opponent_discard_reveal", handleOpponentDiscardReveal);

// ─── discard_or_flip_self ─────────────────────────────────────────────────────

/** Player chooses: discard a hand card (targetInstanceId set) OR flip the source card. */
const handleDiscardOrFlipSelf: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId, payload } = effect;
  const discardId = payload.targetInstanceId as string | undefined;

  if (discardId) {
    const hand = state.players[ownerIndex].hand;
    const idx = hand.findIndex((c) => c.instanceId === discardId);
    if (idx === -1) {
      log(`discard_or_flip_self: card ${discardId} not found in hand`);
      return;
    }
    const [discarded] = hand.splice(idx, 1);
    discarded.face = CardFace.FaceUp;
    state.trashes[ownerIndex].push(discarded);
    state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
    log(`discard_or_flip_self: discarded ${discarded.defId}`);
  } else {
    if (sourceInstanceId) flipSourceCard(state, sourceInstanceId, log);
    else log("discard_or_flip_self: no sourceInstanceId for flip");
  }
};

registerHandler("discard_or_flip_self", handleDiscardOrFlipSelf);

// ─── discard_then_opponent_discard ────────────────────────────────────────────

/** Optionally discard 1 own card; if a card was chosen the opponent must also discard. */
const handleDiscardThenOpponentDiscard: EffectHandler = (state, effect, log) => {
  const { ownerIndex, cardDefId, payload, sourceInstanceId } = effect;
  const oi = getOpponentIndex(ownerIndex);
  const targetId = payload.targetInstanceId as string | undefined;

  if (!targetId) {
    log("discard_then_opponent_discard: skipped (no card chosen)");
    return;
  }
  const hand = state.players[ownerIndex].hand;
  const idx = hand.findIndex((c) => c.instanceId === targetId);
  if (idx === -1) {
    log(`discard_then_opponent_discard: ${targetId} not in hand`);
    return;
  }
  const [discarded] = hand.splice(idx, 1);
  discarded.face = CardFace.FaceUp;
  state.trashes[ownerIndex].push(discarded);
  state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
  log(`discard_then_opponent_discard: discarded ${discarded.defId} — queuing opponent discard`);
  state.effectQueue.push({
    id: uuidv4(),
    cardDefId,
    cardName: effect.cardName,
    type: "discard",
    description: "Choose a card to discard.",
    ownerIndex: oi,
    trigger: effect.trigger,
    payload: {},
    sourceInstanceId,
  });
};

registerHandler("discard_then_opponent_discard", handleDiscardThenOpponentDiscard);

// ─── exchange_hand ────────────────────────────────────────────────────────────

/** Two-step hand exchange: take 1 random opponent card, then give 1 back.
 *  First invocation (awaitGive=false): steal random card, queue second step.
 *  Second invocation (awaitGive=true): give the chosen card back to opponent. */
const handleExchangeHand: EffectHandler = (state, effect, log) => {
  const { ownerIndex, cardDefId, payload, sourceInstanceId } = effect;
  const oi = getOpponentIndex(ownerIndex);
  const oppHand = state.players[oi].hand;
  const ownHand = state.players[ownerIndex].hand;
  const awaitGive = payload.awaitGive === true;
  const giveId = payload.targetInstanceId as string | undefined;

  if (!awaitGive) {
    if (oppHand.length === 0) {
      log("exchange_hand: opponent has no cards to take");
      return;
    }
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
      trigger: effect.trigger,
      payload: { awaitGive: true },
      sourceInstanceId,
    });
    log(`exchange_hand: took ${taken.defId}; waiting for give choice`);
    return;
  }

  if (!giveId) {
    log("exchange_hand: no card chosen to give");
    return;
  }
  const giveIdx = ownHand.findIndex((c) => c.instanceId === giveId);
  if (giveIdx === -1) {
    log(`exchange_hand: card ${giveId} not found in own hand`);
    return;
  }
  const [given] = ownHand.splice(giveIdx, 1);
  given.face = CardFace.FaceUp;
  oppHand.push(given);
  log(`exchange_hand: gave ${given.defId}`);
};

registerHandler("exchange_hand", handleExchangeHand);

// ─── give_to_draw ─────────────────────────────────────────────────────────────

/** Optional: give 1 hand card to the opponent, then draw 2. No-op if skipped. */
const handleGiveToDraw: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const oi = getOpponentIndex(ownerIndex);
  const giveId = payload.targetInstanceId as string | undefined;

  if (!giveId) {
    log("give_to_draw: skipped (no card chosen to give)");
    return;
  }
  const ownHand = state.players[ownerIndex].hand;
  const giveIdx = ownHand.findIndex((c) => c.instanceId === giveId);
  if (giveIdx === -1) {
    log(`give_to_draw: card ${giveId} not in hand`);
    return;
  }
  const [given] = ownHand.splice(giveIdx, 1);
  given.face = CardFace.FaceUp;
  state.players[oi].hand.push(given);
  log(`give_to_draw: gave ${given.defId} to opponent`);
  drawCards(state, ownerIndex, 2);
};

registerHandler("give_to_draw", handleGiveToDraw);

// ─── draw_from_opponent_deck ──────────────────────────────────────────────────

/** Take the top card of the opponent's deck into the owner's hand (reshuffles if needed). */
const handleDrawFromOpponentDeck: EffectHandler = (state, effect, log) => {
  const { ownerIndex } = effect;
  const oi = getOpponentIndex(ownerIndex);
  const deck = state.decks[oi];
  const trash = state.trashes[oi];

  if (deck.length === 0) {
    if (trash.length === 0) {
      log("draw_from_opponent_deck: opponent deck and trash are empty");
      return;
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
};

registerHandler("draw_from_opponent_deck", handleDrawFromOpponentDeck);

// ─── play_facedown ────────────────────────────────────────────────────────────

/** Play a card from hand face-down into a chosen line (different from source line). */
const handlePlayFacedown: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId, payload } = effect;
  const oi = getOpponentIndex(ownerIndex);
  const targetCardId = payload.targetInstanceId as string | undefined;
  const targetLineIndex = payload.targetLineIndex as number | undefined;
  const requiresFaceDownInLine = payload.requiresFaceDownInLine === true;

  if (targetCardId === undefined || targetLineIndex === undefined) {
    log("play_facedown: no target card or line provided");
    return;
  }
  if (targetLineIndex < 0 || targetLineIndex > 2) {
    log(`play_facedown: invalid line index ${targetLineIndex}`);
    return;
  }
  if (requiresFaceDownInLine) {
    const ownLine = state.players[ownerIndex].lines[targetLineIndex];
    const oppLine = state.players[oi].lines[targetLineIndex];
    const hasFaceDown =
      ownLine.cards.some((c) => c.face === CardFace.FaceDown) ||
      oppLine.cards.some((c) => c.face === CardFace.FaceDown);
    if (!hasFaceDown) {
      log("play_facedown: target line must already contain a face-down card");
      return;
    }
  }
  // Validate chosen line differs from source card's line.
  if (sourceInstanceId) {
    const srcLine = findSourceLineIndex(state, ownerIndex, sourceInstanceId);
    if (srcLine !== -1 && srcLine === targetLineIndex) {
      log("play_facedown: cannot play into the same line as the source card");
      return;
    }
  }
  const hand = state.players[ownerIndex].hand;
  const cardIdx = hand.findIndex((c) => c.instanceId === targetCardId);
  if (cardIdx === -1) {
    log(`play_facedown: card ${targetCardId} not found in hand`);
    return;
  }
  const [placed] = hand.splice(cardIdx, 1);
  placed.face = CardFace.FaceDown;
  const destLine = state.players[ownerIndex].lines[targetLineIndex];
  const prevTop = destLine.cards.length > 0 ? destLine.cards[destLine.cards.length - 1] : null;
  destLine.cards.push(placed);
  if (prevTop) enqueueEffectsOnCover(state, prevTop, ownerIndex);
  log(`play_facedown: ${placed.defId} placed face-down in line ${targetLineIndex}`);
};

registerHandler("play_facedown", handlePlayFacedown);

// ─── return ───────────────────────────────────────────────────────────────────

/** Move an uncovered field card back to a player's hand.
 *  Variants: default (any uncovered), own_any, opponent_any, line_value_2. */
const handleReturn: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const targets = payload.targets as string | undefined;
  const targetLineIndex = payload.targetLineIndex as number | undefined;

  // line_value_2: return all value-2 cards in a selected line to owner's hand
  if (targets === "line_value_2") {
    if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
      log("return line_value_2: no valid targetLineIndex provided");
      return;
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
    return;
  }

  // Default: move a specific uncovered card back to its owner's (or requester's) hand
  const targetId = payload.targetInstanceId as string | undefined;
  if (!targetId) {
    log("return: no target provided");
    return;
  }
  for (let pi = 0 as 0 | 1; pi <= 1; pi = (pi + 1) as 0 | 1) {
    for (const line of state.players[pi].lines) {
      const idx = line.cards.findIndex((c) => c.instanceId === targetId);
      if (idx === -1) continue;

      if (idx !== line.cards.length - 1) {
        log("return: target must be uncovered");
        return;
      }
      if (targets === "own_any" && pi !== ownerIndex) {
        log("return: target must be your own card");
        return;
      }
      if (targets === "opponent_any" && pi === ownerIndex) {
        log("return: target must be your opponent's card");
        return;
      }
      const [returned] = line.cards.splice(idx, 1);
      returned.face = CardFace.FaceUp;
      state.players[pi].hand.push(returned);
      log(`return ${returned.defId} to hand`);
      return;
    }
  }
  log(`return: card ${targetId} not found in any line`);
};

registerHandler("return", handleReturn);
