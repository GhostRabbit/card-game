import { CardFace, getOpponentIndex } from "@compile/shared";
import { v4 as uuidv4 } from "uuid";
import { CARD_MAP } from "../../data/cards";
import { enqueueEffectsOnCover, enqueueEffectsOnFlipFaceUp } from "../CardEffects";
import { drawCards, FACE_DOWN_VALUE } from "../GameEngine";
import { shuffle } from "../DraftEngine";
import { EffectHandler, registerHandler } from "./registry";

const getCardDefinitionValue = (card: { defId: string }): number => {
  return CARD_MAP.get(card.defId)?.value ?? 0;
};

const takeTopDeckCardNoReshuffle = (
  state: Parameters<EffectHandler>[0],
  playerIndex: 0 | 1,
  log: (msg: string) => void,
): (typeof state.players)[number]["hand"][number] | null => {
  const deck = state.decks[playerIndex];
  if (deck.length === 0) {
    log(`deck empty for player ${playerIndex}`);
    return null;
  }
  const drawn = deck.shift()!;
  state.players[playerIndex].deckSize = deck.length;
  return drawn;
};

const pushDeckCardFaceDown = (
  state: Parameters<EffectHandler>[0],
  ownerIndex: 0 | 1,
  line: (typeof state.players)[number]["lines"][number],
  log: (msg: string) => void,
): void => {
  const drawn = takeTopDeckCardNoReshuffle(state, ownerIndex, log);
  if (!drawn) return;
  drawn.face = CardFace.FaceDown;
  const prevTop = line.cards.length > 0 ? line.cards[line.cards.length - 1] : null;
  line.cards.push(drawn);
  if (prevTop) enqueueEffectsOnCover(state, prevTop, ownerIndex);
};

const handleDrawValueFromDeckThenShuffle: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const wantedValue = payload.value as number | undefined;

  if (wantedValue === undefined) {
    log("draw_value_from_deck_then_shuffle: missing value");
    return;
  }

  const deck = state.decks[ownerIndex];
  const matchIndex = deck.findIndex((card) => getCardDefinitionValue(card) === wantedValue);
  if (matchIndex === -1) {
    state.decks[ownerIndex] = shuffle(deck);
    state.players[ownerIndex].deckSize = state.decks[ownerIndex].length;
    log(`draw_value_from_deck_then_shuffle: no value-${wantedValue} card found; shuffled deck`);
    return;
  }

  const [drawn] = deck.splice(matchIndex, 1);
  drawn.face = CardFace.FaceUp;
  state.players[ownerIndex].hand.push(drawn);
  state.decks[ownerIndex] = shuffle(deck);
  state.players[ownerIndex].deckSize = state.decks[ownerIndex].length;
  log(`draw_value_from_deck_then_shuffle: drew ${drawn.defId} and shuffled deck`);
};

registerHandler("draw_value_from_deck_then_shuffle", handleDrawValueFromDeckThenShuffle);

const handleTrashToOtherLineFacedown: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId, payload } = effect;
  const targetLineIndex = payload.targetLineIndex as number | undefined;

  if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
    log("trash_to_other_line_facedown: no valid targetLineIndex provided");
    return;
  }

  if (sourceInstanceId) {
    const sourceLineIndex = state.players[ownerIndex].lines.findIndex((line) =>
      line.cards.some((card) => card.instanceId === sourceInstanceId),
    );
    if (sourceLineIndex >= 0 && sourceLineIndex === targetLineIndex) {
      log("trash_to_other_line_facedown: target line must be different from source line");
      return;
    }
  }

  const trash = state.trashes[ownerIndex];
  if (trash.length === 0) {
    log("trash_to_other_line_facedown: trash is empty");
    return;
  }

  const [moved] = trash.splice(0, 1);
  state.players[ownerIndex].trashSize = trash.length;
  moved.face = CardFace.FaceDown;

  const destLine = state.players[ownerIndex].lines[targetLineIndex];
  const prevTop = destLine.cards.length > 0 ? destLine.cards[destLine.cards.length - 1] : null;
  destLine.cards.push(moved);
  if (prevTop) enqueueEffectsOnCover(state, prevTop, ownerIndex);

  log(
    `trash_to_other_line_facedown: moved ${moved.defId} from trash to line ${targetLineIndex} face-down`,
  );
};

registerHandler("trash_to_other_line_facedown", handleTrashToOtherLineFacedown);

const handleRevealHand: EffectHandler = (state, effect, log) => {
  const { ownerIndex, cardDefId, payload, trigger } = effect;

  if (payload.awaitRead === true) {
    log("reveal_hand: read confirmed");
    return;
  }

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
};

registerHandler("reveal_hand", handleRevealHand);

const handleRevealTopDeck: EffectHandler = (state, effect, log) => {
  const { ownerIndex, cardDefId, payload, trigger } = effect;

  if (payload.awaitRead === true) {
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
    return;
  }

  const deck = state.decks[ownerIndex];
  if (deck.length === 0) {
    log("reveal_top_deck: deck empty");
    return;
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
};

registerHandler("reveal_top_deck", handleRevealTopDeck);

const handleRevealOwnHand: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const oi = getOpponentIndex(ownerIndex);
  const cardId = payload.targetInstanceId as string | undefined;

  if (!cardId) {
    log("reveal_own_hand: no card chosen");
    return;
  }

  const inHand = state.players[ownerIndex].hand.some((c) => c.instanceId === cardId);
  if (!inHand) {
    log(`reveal_own_hand: card ${cardId} not found in hand`);
    return;
  }

  state.revealHandCardFor = { viewerIndex: oi, cardId };
  log(`reveal_own_hand: card ${cardId} revealed to opponent`);
};

registerHandler("reveal_own_hand", handleRevealOwnHand);

const handleRevealShiftOrFlip: EffectHandler = (state, effect, log) => {
  const { payload } = effect;
  const targetId = payload.targetInstanceId as string | undefined;
  const action = payload.action as "flip" | "shift" | undefined;

  if (!targetId) {
    log("reveal_shift_or_flip: no targetInstanceId");
    return;
  }

  let rsfCard = null as (typeof state.players)[number]["lines"][number]["cards"][number] | null;
  let rsfOwnerIdx = null as 0 | 1 | null;
  outer: for (let pi = 0; pi < 2; pi++) {
    for (const line of state.players[pi].lines) {
      const c = line.cards.find((card) => card.instanceId === targetId);
      if (c) {
        rsfCard = c;
        rsfOwnerIdx = pi as 0 | 1;
        break outer;
      }
    }
  }

  if (!rsfCard || rsfOwnerIdx === null) {
    log(`reveal_shift_or_flip: card ${targetId} not found`);
    return;
  }
  if (rsfCard.face !== CardFace.FaceDown) {
    log("reveal_shift_or_flip: target is not face-down");
    return;
  }

  log(`reveal_shift_or_flip: revealed ${rsfCard.defId}`);

  if (action === "flip") {
    rsfCard.face = CardFace.FaceUp;
    enqueueEffectsOnFlipFaceUp(state, rsfOwnerIdx, rsfCard);
    log(`reveal_shift_or_flip: flipped ${rsfCard.defId} face-up`);
    return;
  }

  if (action === "shift") {
    const shiftDest = payload.targetLineIndex as number | undefined;
    if (shiftDest === undefined || shiftDest < 0 || shiftDest > 2) {
      log("reveal_shift_or_flip: no valid targetLineIndex for shift");
      return;
    }

    let shifted = false;
    outerShift: for (let pi = 0; pi < 2; pi++) {
      for (let li = 0; li < 3; li++) {
        const idx = state.players[pi].lines[li].cards.findIndex((c) => c.instanceId === targetId);
        if (idx === -1) continue;

        if (li === shiftDest) {
          log("reveal_shift_or_flip: card is already in target line");
        } else {
          const [moved] = state.players[pi].lines[li].cards.splice(idx, 1);
          state.players[pi].lines[shiftDest].cards.push(moved);
          log(`reveal_shift_or_flip: shifted ${moved.defId} (P${pi}) to line ${shiftDest}`);
          shifted = true;
        }
        break outerShift;
      }
    }

    if (!shifted) log(`reveal_shift_or_flip: card ${targetId} not found for shift`);
    return;
  }

  log("reveal_shift_or_flip: skipped (no action chosen)");
};

registerHandler("reveal_shift_or_flip", handleRevealShiftOrFlip);

const handleDeckToOtherLines: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId } = effect;
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
};

registerHandler("deck_to_other_lines", handleDeckToOtherLines);

const handleDeckToEachLine: EffectHandler = (state, effect, log) => {
  const { ownerIndex, cardDefId, sourceInstanceId, trigger, payload } = effect;
  const remainingFromPayload = payload.remainingLineIndices as number[] | undefined;

  const enqueueNextStep = (remainingLineIndices: number[]) => {
    if (remainingLineIndices.length === 0) return;
    state.effectQueue.unshift({
      id: uuidv4(),
      ownerIndex,
      cardDefId,
      cardName: effect.cardName,
      sourceInstanceId,
      type: "deck_to_each_line",
      description: `Choose the next line to process (${remainingLineIndices.length} left).`,
      trigger,
      payload: { ...payload, remainingLineIndices },
    });
  };

  if (!remainingFromPayload) {
    const initialRemaining = [0, 1, 2].filter(
      (li) => state.players[ownerIndex].lines[li].cards.length > 0,
    );
    if (initialRemaining.length === 0) {
      log("deck_to_each_line: no occupied lines to process");
      return;
    }
    enqueueNextStep(initialRemaining);
    return;
  }

  const selectedLine = payload.targetLineIndex as number | undefined;
  if (selectedLine == null || !remainingFromPayload.includes(selectedLine)) {
    log("deck_to_each_line: selected line is not in remaining choices");
    enqueueNextStep(remainingFromPayload);
    return;
  }

  if (state.players[ownerIndex].lines[selectedLine].cards.length > 0) {
    pushDeckCardFaceDown(state, ownerIndex, state.players[ownerIndex].lines[selectedLine], log);
    log(`deck_to_each_line: processed line ${selectedLine}`);
  } else {
    log(`deck_to_each_line: line ${selectedLine} became empty before resolution`);
  }

  const nextRemaining = remainingFromPayload.filter((li) => li !== selectedLine);
  if (nextRemaining.length > 0) enqueueNextStep(nextRemaining);
};

registerHandler("deck_to_each_line", handleDeckToEachLine);

const handleOpponentDeckToLine: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId } = effect;
  const oi = getOpponentIndex(ownerIndex);
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
    return;
  }

  pushDeckCardFaceDown(state, oi, state.players[oi].lines[lineIndex], log);
  log(`opponent_deck_to_line: opponent played face-down into line ${lineIndex}`);
};

registerHandler("opponent_deck_to_line", handleOpponentDeckToLine);

const handleDeckToUnder: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId } = effect;
  if (!sourceInstanceId) {
    log("deck_to_under: no sourceInstanceId");
    return;
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

  if (!foundLine) log("deck_to_under: source card not found in any line");
};

registerHandler("deck_to_under", handleDeckToUnder);

const handlePlayTopDeckFacedownThenFlip: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId } = effect;
  let placed = false;

  for (let li = 0; li < 3; li++) {
    if (!sourceInstanceId || !state.players[ownerIndex].lines[li].cards.some((c) => c.instanceId === sourceInstanceId)) {
      continue;
    }

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
};

registerHandler("play_top_deck_facedown_then_flip", handlePlayTopDeckFacedownThenFlip);

const handleTopDeckDiscardDrawValue: EffectHandler = (state, effect, log) => {
  const { ownerIndex } = effect;
  const discarded = takeTopDeckCardNoReshuffle(state, ownerIndex, log);
  if (!discarded) return;

  const wasFaceDown = discarded.face === CardFace.FaceDown;
  discarded.face = CardFace.FaceUp;
  state.trashes[ownerIndex].push(discarded);
  state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;

  const def = CARD_MAP.get(discarded.defId);
  const amount = wasFaceDown ? FACE_DOWN_VALUE : (def?.value ?? FACE_DOWN_VALUE);
  log(`top_deck_discard_draw_value: discarded ${discarded.defId}, drawing ${amount}`);
  drawCards(state, ownerIndex, amount);
};

registerHandler("top_deck_discard_draw_value", handleTopDeckDiscardDrawValue);

const handleTopDeckToLinesWithFacedown: EffectHandler = (state, effect, log) => {
  const { ownerIndex } = effect;
  let moved = 0;
  for (let li = 0; li < 3; li++) {
    const line = state.players[ownerIndex].lines[li];
    if (!line.cards.some((card) => card.face === CardFace.FaceDown)) continue;
    pushDeckCardFaceDown(state, ownerIndex, line, log);
    moved++;
  }
  log(`top_deck_to_lines_with_facedown: played into ${moved} line(s)`);
};

registerHandler("top_deck_to_lines_with_facedown", handleTopDeckToLinesWithFacedown);

const handleSwapTopDeckDraws: EffectHandler = (state, effect, log) => {
  const { ownerIndex } = effect;
  const oi = getOpponentIndex(ownerIndex);

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
};

registerHandler("swap_top_deck_draws", handleSwapTopDeckDraws);

const handleFlipCoveredInEachLine: EffectHandler = (state, effect, log) => {
  const { ownerIndex, cardDefId, sourceInstanceId, trigger, payload } = effect;
  const remainingFromPayload = payload.remainingLineIndices as number[] | undefined;

  const encodeLine = (pi: 0 | 1, li: number) => pi * 3 + li;
  const decodeLine = (encoded: number): { pi: 0 | 1; li: number } =>
    encoded >= 3 ? { pi: 1, li: encoded - 3 } : { pi: 0, li: encoded };
  const hasCoveredCard = (pi: 0 | 1, li: number): boolean =>
    state.players[pi].lines[li].cards.length >= 2;

  const enqueueNextStep = (remainingLineIndices: number[]) => {
    if (remainingLineIndices.length === 0) return;
    state.effectQueue.unshift({
      id: uuidv4(),
      ownerIndex,
      cardDefId,
      cardName: effect.cardName,
      sourceInstanceId,
      type: "flip_covered_in_each_line",
      description: `Choose the next line to process (${remainingLineIndices.length} left).`,
      trigger,
      payload: { ...payload, remainingLineIndices },
    });
  };

  if (!remainingFromPayload) {
    const initialRemaining: number[] = [];
    for (let pi = 0 as 0 | 1; pi <= 1; pi = (pi + 1) as 0 | 1) {
      for (let li = 0; li < 3; li++) {
        if (hasCoveredCard(pi, li)) initialRemaining.push(encodeLine(pi, li));
      }
    }
    if (initialRemaining.length === 0) {
      log("flip_covered_in_each_line: no covered cards to process");
      return;
    }
    enqueueNextStep(initialRemaining);
    return;
  }

  const selectedEncoded = payload.targetLineIndex as number | undefined;
  if (selectedEncoded == null || !remainingFromPayload.includes(selectedEncoded)) {
    log("flip_covered_in_each_line: selected line is not in remaining choices");
    enqueueNextStep(remainingFromPayload);
    return;
  }

  const { pi, li } = decodeLine(selectedEncoded);
  const line = state.players[pi].lines[li];
  if (line.cards.length >= 2) {
    const target = line.cards[0];
    const wasDown = target.face === CardFace.FaceDown;
    target.face = wasDown ? CardFace.FaceUp : CardFace.FaceDown;
    log(`flip_covered_in_each_line: P${pi} L${li} flipped ${target.defId} to ${target.face}`);
    if (wasDown) enqueueEffectsOnFlipFaceUp(state, pi, target);
  } else {
    log(`flip_covered_in_each_line: P${pi} L${li} had no covered cards at resolution time`);
  }

  const nextRemaining = remainingFromPayload.filter((encoded) => encoded !== selectedEncoded);
  if (nextRemaining.length > 0) enqueueNextStep(nextRemaining);
};

registerHandler("flip_covered_in_each_line", handleFlipCoveredInEachLine);

const handleOpponentDiscardHandThenDrawMinus: EffectHandler = (state, effect, log) => {
  const { ownerIndex } = effect;
  const oi = getOpponentIndex(ownerIndex);

  const hand = state.players[oi].hand.splice(0);
  const discardedCount = hand.length;
  for (const card of hand) card.face = CardFace.FaceUp;
  state.trashes[oi].push(...hand);
  state.players[oi].trashSize = state.trashes[oi].length;

  const drawAmount = Math.max(0, discardedCount - 1);
  log(
    `opponent_discard_hand_then_draw_minus: discarded ${discardedCount}, drawing ${drawAmount}`,
  );
  if (drawAmount > 0) drawCards(state, oi, drawAmount);
};

registerHandler("opponent_discard_hand_then_draw_minus", handleOpponentDiscardHandThenDrawMinus);

const handleBothPlayersDiscardHand: EffectHandler = (state, _effect, log) => {
  for (const pi of [0, 1] as const) {
    const hand = state.players[pi].hand.splice(0);
    for (const card of hand) card.face = CardFace.FaceUp;
    state.trashes[pi].push(...hand);
    state.players[pi].trashSize = state.trashes[pi].length;
  }
  log("both_players_discard_hand: both hands discarded");
};

registerHandler("both_players_discard_hand", handleBothPlayersDiscardHand);

const handleReshuffleTrash: EffectHandler = (state, effect, log) => {
  const { ownerIndex } = effect;
  const trash = state.trashes[ownerIndex];

  if (trash.length === 0) {
    log("reshuffle_trash: trash is already empty");
    return;
  }

  const reshuffled = shuffle(trash.splice(0));
  reshuffled.forEach((c) => (c.face = CardFace.FaceDown));
  state.decks[ownerIndex].push(...reshuffled);
  state.players[ownerIndex].deckSize = state.decks[ownerIndex].length;
  state.players[ownerIndex].trashSize = 0;
  log(`reshuffle_trash: shuffled ${reshuffled.length} card(s) from trash into deck`);
};

registerHandler("reshuffle_trash", handleReshuffleTrash);
