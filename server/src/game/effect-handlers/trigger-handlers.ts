import { CardFace } from "@compile/shared";
import { getOpponentIndex } from "@compile/shared";
import { CARD_MAP } from "../../data/cards";
import { enqueueEffectsOnCover } from "../CardEffects";
import { drawCards } from "../GameEngine";
import { EffectHandler, registerHandler } from "./registry";

const isCardCovered = (
  state: Parameters<EffectHandler>[0],
  instanceId: string,
): boolean => {
  for (const player of state.players) {
    for (const line of player.lines) {
      const idx = line.cards.findIndex((c) => c.instanceId === instanceId);
      if (idx !== -1) return idx !== line.cards.length - 1;
    }
  }
  return false;
};

const discardFromHandRandom = (
  state: Parameters<EffectHandler>[0],
  playerIndex: 0 | 1,
  amount: number,
): number => {
  const hand = state.players[playerIndex].hand;
  const actual = Math.min(amount, hand.length);
  for (let i = 0; i < actual; i++) {
    const idx = Math.floor(Math.random() * hand.length);
    const [discarded] = hand.splice(idx, 1);
    discarded.face = CardFace.FaceUp;
    state.trashes[playerIndex].push(discarded);
  }
  state.players[playerIndex].trashSize = state.trashes[playerIndex].length;
  return actual;
};

const handleOnCoveredDeleteSelf: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId } = effect;
  if (!sourceInstanceId) {
    log("on_covered_delete_self: no source");
    return;
  }

  let seen = false;
  outer: for (let pi = 0; pi < 2; pi++) {
    for (const line of state.players[pi].lines) {
      const idx = line.cards.findIndex((c) => c.instanceId === sourceInstanceId);
      if (idx === -1) continue;
      const [trashed] = line.cards.splice(idx, 1);
      state.trashes[pi].push(trashed);
      state.players[pi].trashSize = state.trashes[pi].length;
      log(`on_covered_delete_self: deleted ${trashed.defId}`);
      seen = true;
      break outer;
    }
  }

  if (!seen) log(`on_covered_delete_self: source ${sourceInstanceId} not found`);

  for (const player of state.players) {
    for (const line of player.lines) {
      for (const card of line.cards) {
        if (card.face !== CardFace.FaceUp) continue;
        const def = CARD_MAP.get(card.defId);
        if (!def) continue;
        for (const passive of def.effects) {
          if (passive.trigger !== "passive" || passive.type !== "after_delete_draw") continue;
          const drawAmt = (passive.payload?.amount as number) ?? 1;
          log(`after_delete_draw (${card.defId}): drawing ${drawAmt}`);
          drawCards(state, ownerIndex, drawAmt);
        }
      }
    }
  }
};

registerHandler("on_covered_delete_self", handleOnCoveredDeleteSelf);

const handleDeleteSelfIfCovered: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId } = effect;
  if (!sourceInstanceId) {
    log("delete_self_if_covered: no sourceInstanceId");
    return;
  }
  if (!isCardCovered(state, sourceInstanceId)) {
    log("delete_self_if_covered: skipped (source is not covered)");
    return;
  }

  let deleted = false;
  for (let pi = 0; pi < 2; pi++) {
    for (const line of state.players[pi].lines) {
      const idx = line.cards.findIndex((c) => c.instanceId === sourceInstanceId);
      if (idx === -1) continue;
      const [trashed] = line.cards.splice(idx, 1);
      state.trashes[pi].push(trashed);
      state.players[pi].trashSize = state.trashes[pi].length;
      log(`delete_self_if_covered: deleted ${trashed.defId}`);
      deleted = true;
      break;
    }
    if (deleted) break;
  }
  if (!deleted) log("delete_self_if_covered: source card not found");

  for (const player of state.players) {
    for (const line of player.lines) {
      for (const card of line.cards) {
        if (card.face !== CardFace.FaceUp) continue;
        const def = CARD_MAP.get(card.defId);
        if (!def) continue;
        for (const passive of def.effects) {
          if (passive.trigger !== "passive" || passive.type !== "after_delete_draw") continue;
          const drawAmt = (passive.payload?.amount as number) ?? 1;
          log(`after_delete_draw (${card.defId}): drawing ${drawAmt}`);
          drawCards(state, ownerIndex, drawAmt);
        }
      }
    }
  }
};

registerHandler("delete_self_if_covered", handleDeleteSelfIfCovered);

const handleOnCoveredDeleteLowest: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId } = effect;
  if (!sourceInstanceId) {
    log("on_covered_delete_lowest: no source");
    return;
  }

  let found = false;
  outer: for (let pi = 0; pi < 2; pi++) {
    for (const line of state.players[pi].lines) {
      if (!line.cards.some((c) => c.instanceId === sourceInstanceId)) continue;
      found = true;
      if (line.cards.length <= 1) {
        log("on_covered_delete_lowest: no covered cards to delete");
        break outer;
      }

      const coveredSlice = line.cards.slice(0, line.cards.length - 1);
      let lowestCard: (typeof line.cards)[number] | null = null;
      let lowestVal = Infinity;
      for (const c of coveredSlice) {
        const val = c.face === CardFace.FaceDown ? 2 : (CARD_MAP.get(c.defId)?.value ?? 0);
        if (val < lowestVal) {
          lowestVal = val;
          lowestCard = c;
        }
      }

      if (lowestCard) {
        const idx = line.cards.indexOf(lowestCard);
        line.cards.splice(idx, 1);
        state.trashes[pi].push(lowestCard);
        state.players[pi].trashSize = state.trashes[pi].length;
        log(`on_covered_delete_lowest: deleted ${lowestCard.defId} (value ${lowestVal}) from P${pi}`);
      }
      break outer;
    }
  }

  if (!found) log(`on_covered_delete_lowest: source ${sourceInstanceId} not found`);

  for (const player of state.players) {
    for (const line of player.lines) {
      for (const card of line.cards) {
        if (card.face !== CardFace.FaceUp) continue;
        const def = CARD_MAP.get(card.defId);
        if (!def) continue;
        for (const passive of def.effects) {
          if (passive.trigger !== "passive" || passive.type !== "after_delete_draw") continue;
          const drawAmt = (passive.payload?.amount as number) ?? 1;
          log(`after_delete_draw (${card.defId}): drawing ${drawAmt}`);
          drawCards(state, ownerIndex, drawAmt);
        }
      }
    }
  }
};

registerHandler("on_covered_delete_lowest", handleOnCoveredDeleteLowest);

const handleOnCoveredDeckToOtherLine: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId, payload } = effect;
  const target = payload.targetLineIndex as number | undefined;

  if (target === undefined) {
    log("on_covered_deck_to_other_line: no targetLineIndex provided");
    return;
  }
  if (target < 0 || target > 2) {
    log(`on_covered_deck_to_other_line: invalid lineIndex ${target}`);
    return;
  }

  if (sourceInstanceId) {
    const srcLine = state.players[ownerIndex].lines.findIndex((l) =>
      l.cards.some((c) => c.instanceId === sourceInstanceId),
    );
    if (srcLine === target) {
      log("on_covered_deck_to_other_line: must target a different line from the source card");
      return;
    }
  }

  const deck = state.decks[ownerIndex];
  if (deck.length === 0) {
    log(`deck empty for player ${ownerIndex}`);
    return;
  }
  const drawn = deck.shift()!;
  state.players[ownerIndex].deckSize = deck.length;

  drawn.face = CardFace.FaceDown;
  const line = state.players[ownerIndex].lines[target];
  const prevTop = line.cards.length > 0 ? line.cards[line.cards.length - 1] : null;
  line.cards.push(drawn);
  if (prevTop) enqueueEffectsOnCover(state, prevTop, ownerIndex);

  log(`on_covered_deck_to_other_line: played face-down into line ${target}`);
};

registerHandler("on_covered_deck_to_other_line", handleOnCoveredDeckToOtherLine);

const handleAfterDrawShiftSelf: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId, payload } = effect;
  const target = payload.targetLineIndex as number | undefined;

  if (target === undefined) {
    log("after_draw_shift_self: skipped (no targetLineIndex provided)");
    return;
  }
  if (target < 0 || target > 2) {
    log(`after_draw_shift_self: invalid targetLineIndex ${target}`);
    return;
  }
  if (!sourceInstanceId) {
    log("after_draw_shift_self: no sourceInstanceId");
    return;
  }

  let shifted = false;
  outer: for (let li = 0; li < 3; li++) {
    const srcLine = state.players[ownerIndex].lines[li];
    const cardIdx = srcLine.cards.findIndex((c) => c.instanceId === sourceInstanceId);
    if (cardIdx === -1) continue;

    if (li === target) {
      log("after_draw_shift_self: card is already in the target line - skipped");
      shifted = true;
      break outer;
    }

    const [moved] = srcLine.cards.splice(cardIdx, 1);
    const destLine = state.players[ownerIndex].lines[target];
    const prevTop = destLine.cards.length > 0 ? destLine.cards[destLine.cards.length - 1] : null;
    destLine.cards.push(moved);
    if (prevTop) enqueueEffectsOnCover(state, prevTop, ownerIndex);
    log(`after_draw_shift_self: shifted ${moved.defId} to line ${target}`);
    shifted = true;
    break outer;
  }

  if (!shifted) log(`after_draw_shift_self: card ${sourceInstanceId} not found in own lines`);
};

registerHandler("after_draw_shift_self", handleAfterDrawShiftSelf);

const handleOnCompileDeleteShiftSelf: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const savedId = payload.savedInstanceId as string | undefined;
  const target = payload.targetLineIndex as number | undefined;

  if (!savedId) {
    log("on_compile_delete_shift_self: no savedInstanceId in payload");
    return;
  }

  const savedIdx = state.compileSavedCards.findIndex((s) => s.card.instanceId === savedId);
  if (savedIdx === -1) {
    log(`on_compile_delete_shift_self: ${savedId} not found in compileSavedCards`);
    return;
  }

  const { card: savedCard } = state.compileSavedCards.splice(savedIdx, 1)[0];
  if (target === undefined || target < 0 || target > 2) {
    log("on_compile_delete_shift_self: no valid targetLineIndex - card lost");
    return;
  }

  const dest = state.players[ownerIndex].lines[target];
  const prevTop = dest.cards.length > 0 ? dest.cards[dest.cards.length - 1] : null;
  dest.cards.push(savedCard);
  if (prevTop) enqueueEffectsOnCover(state, prevTop, ownerIndex);
  log(`on_compile_delete_shift_self: shifted ${savedCard.defId} to line ${target}`);
};

registerHandler("on_compile_delete_shift_self", handleOnCompileDeleteShiftSelf);

const handleDiscardEntireDeck: EffectHandler = (state, effect, log) => {
  const { ownerIndex } = effect;
  const deck = state.decks[ownerIndex];
  const moved = deck.splice(0);
  for (const card of moved) card.face = CardFace.FaceUp;
  state.trashes[ownerIndex].push(...moved);
  state.players[ownerIndex].deckSize = 0;
  state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
  log(`discard_entire_deck: moved ${moved.length} card(s) to trash`);
};

registerHandler("discard_entire_deck", handleDiscardEntireDeck);

const handleOpponentDiscardRandom: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const oi = getOpponentIndex(ownerIndex);
  const amount = Math.min((payload.amount as number) ?? 1, state.players[oi].hand.length);
  const discarded = discardFromHandRandom(state, oi, amount);
  log(`opponent_discard_random: opponent discarded ${discarded} random card(s)`);
};

registerHandler("opponent_discard_random", handleOpponentDiscardRandom);

const handleDiscardHandThenDrawSame: EffectHandler = (state, effect, log) => {
  const { ownerIndex } = effect;
  const hand = state.players[ownerIndex].hand.splice(0);
  const count = hand.length;
  for (const card of hand) card.face = CardFace.FaceUp;
  state.trashes[ownerIndex].push(...hand);
  state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
  log(`discard_hand_then_draw_same: discarded ${count}, drawing ${count}`);
  if (count > 0) drawCards(state, ownerIndex, count);
};

registerHandler("discard_hand_then_draw_same", handleDiscardHandThenDrawSame);
