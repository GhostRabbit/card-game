import { CardFace } from "@compile/shared";
import { CARD_MAP } from "../../data/cards";
import {
  enqueueEffectsOnCover,
  enqueueEffectsOnFlipFaceUp,
  flipSourceCard,
  isCardCovered,
  scanPassives,
} from "../CardEffects";
import {
  discardFromHand,
  drawCards,
  FACE_DOWN_VALUE,
  lineValue,
  ServerGameState,
} from "../GameEngine";
import { EffectHandler, getEffectHandler, registerHandler } from "./registry";

const countDistinctProtocolsInField = (state: ServerGameState): number => {
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
};

const handleOppDeleteFacedownFlipSelf: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload, sourceInstanceId } = effect;
  const oi = ownerIndex === 0 ? 1 : 0;
  const targetId = payload.targetInstanceId as string | undefined;
  if (!targetId) {
    log("opp_delete_facedown_flip_self: no target provided");
    return;
  }

  let deleted = false;
  outer: for (const line of state.players[oi].lines) {
    const idx = line.cards.findIndex(
      (c) => c.instanceId === targetId && c.face === CardFace.FaceDown,
    );
    if (idx === -1) continue;
    const [trashed] = line.cards.splice(idx, 1);
    state.trashes[oi].push(trashed);
    state.players[oi].trashSize = state.trashes[oi].length;
    log(`opp_delete_facedown_flip_self: deleted ${trashed.defId} from opponent`);
    deleted = true;
    break outer;
  }

  if (!deleted) {
    log(`opp_delete_facedown_flip_self: face-down card ${targetId} not found in opponent lines`);
    return;
  }

  if (payload.flipSelf && sourceInstanceId) {
    flipSourceCard(state, sourceInstanceId, log);
  }
};

registerHandler("opp_delete_facedown_flip_self", handleOppDeleteFacedownFlipSelf);

const handleDiscardToOppDiscardMore: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const oi = ownerIndex === 0 ? 1 : 0;
  const discardIds = payload.discardIds as string[] | undefined;
  if (!discardIds || discardIds.length === 0) {
    log("discard_to_opp_discard_more: skipped (no cards chosen to discard)");
    return;
  }

  const ownHand = state.players[ownerIndex].hand;
  let actualDiscarded = 0;
  for (const id of discardIds) {
    const idx = ownHand.findIndex((c) => c.instanceId === id);
    if (idx === -1) continue;
    const [discarded] = ownHand.splice(idx, 1);
    discarded.face = CardFace.FaceUp;
    state.trashes[ownerIndex].push(discarded);
    actualDiscarded++;
  }
  state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;

  const oppDiscard = actualDiscarded + 1;
  log(`discard_to_opp_discard_more: discarded ${actualDiscarded}, opponent discards ${oppDiscard}`);
  discardFromHand(state, oi, oppDiscard);
};

registerHandler("discard_to_opp_discard_more", handleDiscardToOppDiscardMore);

const handleFlipDrawEqual: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const targetId = payload.targetInstanceId as string | undefined;
  if (!targetId) {
    log("flip_draw_equal: no targetInstanceId provided");
    return;
  }

  let card: (typeof state.players)[number]["lines"][number]["cards"][number] | null = null;
  let cardOwner: 0 | 1 | null = null;
  let cardLine: number | null = null;
  outer: for (let pi = 0; pi < 2; pi++) {
    for (let li = 0; li < 3; li++) {
      const found = state.players[pi].lines[li].cards.find((c) => c.instanceId === targetId);
      if (!found) continue;
      card = found;
      cardOwner = pi as 0 | 1;
      cardLine = li;
      break outer;
    }
  }

  if (!card || cardOwner === null || cardLine === null) {
    log(`flip_draw_equal: card ${targetId} not found`);
    return;
  }

  const wasDown = card.face === CardFace.FaceDown;
  card.face = wasDown ? CardFace.FaceUp : CardFace.FaceDown;
  log(`flip_draw_equal: ${card.defId} is now ${card.face}`);
  if (wasDown) enqueueEffectsOnFlipFaceUp(state, cardOwner, card);

  let drawAmount: number;
  if (card.face === CardFace.FaceDown) {
    let faceDownOverride: number | null = null;
    for (const c of state.players[cardOwner].lines[cardLine].cards) {
      if (c.face !== CardFace.FaceUp) continue;
      const d = CARD_MAP.get(c.defId);
      if (!d) continue;
      for (const eff of d.effects) {
        if (eff.trigger !== "passive" || eff.type !== "facedown_value_override") continue;
        const v = typeof eff.payload?.value === "number" ? eff.payload.value : FACE_DOWN_VALUE;
        faceDownOverride = faceDownOverride === null ? v : Math.max(faceDownOverride, v);
      }
    }
    drawAmount = faceDownOverride ?? FACE_DOWN_VALUE;
  } else {
    drawAmount = CARD_MAP.get(card.defId)?.value ?? 0;
  }

  if (drawAmount > 0) {
    log(`flip_draw_equal: drawing ${drawAmount}`);
    drawCards(state, ownerIndex, drawAmount);
  }
};

registerHandler("flip_draw_equal", handleFlipDrawEqual);

const handleDiscardOrDeleteSelf: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload, sourceInstanceId } = effect;
  const targetId = payload.targetInstanceId as string | undefined;

  if (targetId) {
    const hand = state.players[ownerIndex].hand;
    const idx = hand.findIndex((c) => c.instanceId === targetId);
    if (idx === -1) {
      log(`discard_or_delete_self: ${targetId} not in hand — deleting self`);
    } else {
      const [discarded] = hand.splice(idx, 1);
      discarded.face = CardFace.FaceUp;
      state.trashes[ownerIndex].push(discarded);
      state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
      log(`discard_or_delete_self: discarded ${discarded.defId}`);
      return;
    }
  }

  if (!sourceInstanceId) {
    log("discard_or_delete_self: no sourceInstanceId for delete fallback");
    return;
  }

  outer: for (let pi = 0; pi < 2; pi++) {
    for (const line of state.players[pi as 0 | 1].lines) {
      const idx = line.cards.findIndex((c) => c.instanceId === sourceInstanceId);
      if (idx === -1) continue;
      const [trashed] = line.cards.splice(idx, 1);
      trashed.face = CardFace.FaceUp;
      state.trashes[pi as 0 | 1].push(trashed);
      state.players[pi as 0 | 1].trashSize = state.trashes[pi as 0 | 1].length;
      log(`discard_or_delete_self: deleted ${trashed.defId}`);
      break outer;
    }
  }
};

registerHandler("discard_or_delete_self", handleDiscardOrDeleteSelf);

const countCardsInFieldByProtocol = (state: ServerGameState, protocolId: string): number => {
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
};

const handleFlipOrDraw: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const targetId = payload.targetInstanceId as string | undefined;
  const protocolId = payload.protocolId as string | undefined;
  const minCountInField = payload.minCountInField as number | undefined;

  if (protocolId && minCountInField !== undefined) {
    if (countCardsInFieldByProtocol(state, protocolId) < minCountInField) {
      log(`flip_or_draw: skipped (field has fewer than ${minCountInField} ${protocolId} card(s))`);
      return;
    }
  }

  if (!targetId) {
    log("flip_or_draw: drawing 1");
    drawCards(state, ownerIndex, 1);
    return;
  }

  const flipHandler = getEffectHandler("flip");
  if (!flipHandler) {
    log("flip_or_draw: flip handler missing");
    return;
  }

  flipHandler(state, {
    ...effect,
    type: "flip",
    payload: {
      ...payload,
      targetInstanceId: targetId,
    },
  }, log);
};

registerHandler("flip_or_draw", handleFlipOrDraw);

const handleTakeOpponentFacedownToHand: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const oi = ownerIndex === 0 ? 1 : 0;
  const targetId = payload.targetInstanceId as string | undefined;
  if (!targetId) {
    log("take_opponent_facedown_to_hand: no target");
    return;
  }

  outer: for (const line of state.players[oi].lines) {
    const idx = line.cards.findIndex((c) => c.instanceId === targetId);
    if (idx === -1) continue;
    if (line.cards[idx].face !== CardFace.FaceDown) {
      log("take_opponent_facedown_to_hand: target must be face-down");
      break outer;
    }
    const [taken] = line.cards.splice(idx, 1);
    taken.face = CardFace.FaceUp;
    state.players[ownerIndex].hand.push(taken);
    log(`take_opponent_facedown_to_hand: took ${taken.defId} from opponent`);
    break outer;
  }
};

registerHandler("take_opponent_facedown_to_hand", handleTakeOpponentFacedownToHand);

const handleDeleteInWinningLine: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const oi = ownerIndex === 0 ? 1 : 0;
  const targetId = payload.targetInstanceId as string | undefined;
  if (!targetId) {
    log("delete_in_winning_line: no target");
    return;
  }

  outer: for (let li = 0; li < 3; li++) {
    const line = state.players[oi].lines[li];
    const idx = line.cards.findIndex((c) => c.instanceId === targetId);
    if (idx === -1) continue;

    if (lineValue(state, oi, li) <= lineValue(state, ownerIndex, li)) {
      log(`delete_in_winning_line: opponent does not have higher value in line ${li} — rejected`);
      break outer;
    }
    if (isCardCovered(state, targetId)) {
      log("delete_in_winning_line: target must be uncovered");
      break outer;
    }

    const [trashed] = line.cards.splice(idx, 1);
    trashed.face = CardFace.FaceUp;
    state.trashes[oi].push(trashed);
    state.players[oi].trashSize = state.trashes[oi].length;
    log(`delete_in_winning_line: deleted ${trashed.defId} from P${oi} line ${li}`);

    for (const { amount: drawAmt } of scanPassives(state, ownerIndex, "after_delete_draw")) {
      log(`after_delete_draw: drawing ${drawAmt}`);
      drawCards(state, ownerIndex, drawAmt);
    }

    break outer;
  }
};

registerHandler("delete_in_winning_line", handleDeleteInWinningLine);

const handleShiftSelfToBestOpponentLine: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId } = effect;
  const oi = ownerIndex === 0 ? 1 : 0;
  if (!sourceInstanceId) {
    log("shift_self_to_best_opponent_line: no sourceInstanceId");
    return;
  }

  let selfLoc: { li: number; idx: number } | null = null;
  for (let li = 0; li < 3; li++) {
    const idx = state.players[ownerIndex].lines[li].cards.findIndex((c) => c.instanceId === sourceInstanceId);
    if (idx === -1) continue;
    selfLoc = { li, idx };
    break;
  }
  if (!selfLoc) {
    log("shift_self_to_best_opponent_line: source not found in own lines");
    return;
  }

  let bestLine = 0;
  let bestVal = -Infinity;
  for (let li = 0; li < 3; li++) {
    const v = lineValue(state, oi, li);
    if (v > bestVal) {
      bestVal = v;
      bestLine = li;
    }
  }

  if (selfLoc.li === bestLine) {
    log("shift_self_to_best_opponent_line: already in best line");
    return;
  }

  const [moved] = state.players[ownerIndex].lines[selfLoc.li].cards.splice(selfLoc.idx, 1);
  const destLine = state.players[ownerIndex].lines[bestLine];
  const prevTop = destLine.cards.length > 0 ? destLine.cards[destLine.cards.length - 1] : null;
  destLine.cards.push(moved);
  if (prevTop) enqueueEffectsOnCover(state, prevTop, ownerIndex);
  log(`shift_self_to_best_opponent_line: shifted ${moved.defId} to line ${bestLine} (opp val ${bestVal})`);
};

registerHandler("shift_self_to_best_opponent_line", handleShiftSelfToBestOpponentLine);

const handleDeleteSelfIfFieldProtocolsBelow: EffectHandler = (state, effect, log) => {
  const { payload, sourceInstanceId } = effect;
  const minDistinct = (payload.minDistinct as number) ?? 4;
  const distinct = countDistinctProtocolsInField(state);

  if (distinct >= minDistinct) {
    log(`delete_self_if_field_protocols_below: skipped (${distinct} distinct protocol(s), need < ${minDistinct})`);
    return;
  }
  if (!sourceInstanceId) {
    log("delete_self_if_field_protocols_below: no sourceInstanceId");
    return;
  }

  let deleted = false;
  outer: for (let pi = 0; pi < 2; pi++) {
    for (const line of state.players[pi as 0 | 1].lines) {
      const idx = line.cards.findIndex((c) => c.instanceId === sourceInstanceId);
      if (idx === -1) continue;
      const [trashed] = line.cards.splice(idx, 1);
      trashed.face = CardFace.FaceUp;
      state.trashes[pi as 0 | 1].push(trashed);
      state.players[pi as 0 | 1].trashSize = state.trashes[pi as 0 | 1].length;
      log(`delete_self_if_field_protocols_below: deleted ${trashed.defId} (${distinct} distinct protocol(s))`);
      deleted = true;
      break outer;
    }
  }

  if (!deleted) {
    log("delete_self_if_field_protocols_below: source not found");
  }
};

registerHandler("delete_self_if_field_protocols_below", handleDeleteSelfIfFieldProtocolsBelow);
