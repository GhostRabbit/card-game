import { CardFace } from "@compile/shared";
import { v4 as uuidv4 } from "uuid";
import { drawCards, ServerGameState } from "../GameEngine";
import { enqueueEffectsOnFlipFaceUp } from "../CardEffects";
import { EffectHandler, registerHandler } from "./registry";

const handleDrawThenDeleteSelf: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId, payload } = effect;
  const deleteTargetId = payload.targetInstanceId as string | undefined;

  if (!deleteTargetId) {
    log("draw_then_delete_self: skipped (opted out)");
    return;
  }

  drawCards(state, ownerIndex, 1);

  let deletedOther = false;
  outer: for (let pi = 0; pi < 2; pi++) {
    for (const line of state.players[pi].lines) {
      const idx = line.cards.findIndex(
        (c) => c.instanceId === deleteTargetId && c.instanceId !== sourceInstanceId,
      );
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
    return;
  }

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
};

registerHandler("draw_then_delete_self", handleDrawThenDeleteSelf);

const handleDiscardToDelete: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const discardId = payload.discardInstanceId as string | undefined;
  const deleteTargetId = payload.targetInstanceId as string | undefined;

  if (!discardId) {
    log("discard_to_delete: skipped (no card chosen to discard)");
    return;
  }

  const ownHand = state.players[ownerIndex].hand;
  const dIdx = ownHand.findIndex((c) => c.instanceId === discardId);
  if (dIdx === -1) {
    log(`discard_to_delete: discard card ${discardId} not found in hand`);
    return;
  }

  const [discarded] = ownHand.splice(dIdx, 1);
  discarded.face = CardFace.FaceUp;
  state.trashes[ownerIndex].push(discarded);
  state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
  log(`discard_to_delete: discarded ${discarded.defId}`);

  if (!deleteTargetId) {
    log("discard_to_delete: no deleteTarget provided");
    return;
  }

  let found = false;
  outer: for (let pi = 0; pi < 2; pi++) {
    for (const line of state.players[pi].lines) {
      const idx = line.cards.findIndex((c) => c.instanceId === deleteTargetId);
      if (idx !== -1) {
        const [trashed] = line.cards.splice(idx, 1);
        state.trashes[pi].push(trashed);
        state.players[pi].trashSize = state.trashes[pi].length;
        log(`discard_to_delete: deleted ${trashed.defId}`);
        found = true;
        break outer;
      }
    }
  }

  if (!found) log(`discard_to_delete: delete target ${deleteTargetId} not found`);
};

registerHandler("discard_to_delete", handleDiscardToDelete);

const handleDiscardToReturn: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const discardId = payload.discardInstanceId as string | undefined;
  const returnTargetId = payload.targetInstanceId as string | undefined;

  if (!discardId) {
    log("discard_to_return: skipped (no card chosen to discard)");
    return;
  }

  const ownHand = state.players[ownerIndex].hand;
  const dIdx = ownHand.findIndex((c) => c.instanceId === discardId);
  if (dIdx === -1) {
    log(`discard_to_return: discard card ${discardId} not found in hand`);
    return;
  }

  const [discarded] = ownHand.splice(dIdx, 1);
  discarded.face = CardFace.FaceUp;
  state.trashes[ownerIndex].push(discarded);
  state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
  log(`discard_to_return: discarded ${discarded.defId}`);

  if (!returnTargetId) {
    log("discard_to_return: no return target provided");
    return;
  }

  let found = false;
  outer: for (let pi = 0; pi < 2; pi++) {
    for (const line of state.players[pi].lines) {
      const idx = line.cards.findIndex((c) => c.instanceId === returnTargetId);
      if (idx !== -1) {
        const [returned] = line.cards.splice(idx, 1);
        returned.face = CardFace.FaceUp;
        state.players[ownerIndex].hand.push(returned);
        log(`discard_to_return: returned ${returned.defId} to hand`);
        found = true;
        break outer;
      }
    }
  }

  if (!found) log(`discard_to_return: return target ${returnTargetId} not found`);
};

registerHandler("discard_to_return", handleDiscardToReturn);

const handleDiscardToDraw: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const discardIds = payload.discardIds as string[] | undefined;

  if (!discardIds || discardIds.length === 0) {
    log("discard_to_draw: skipped (no cards chosen to discard)");
    return;
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
};

registerHandler("discard_to_draw", handleDiscardToDraw);

const handleDiscardToFlip: EffectHandler = (state, effect, log) => {
  const { payload } = effect;
  const discardId = payload.discardInstanceId as string | undefined;
  const flipTargetId = payload.targetInstanceId as string | undefined;
  const ownerIndex = effect.ownerIndex;

  if (!discardId) {
    log("discard_to_flip: skipped (no card chosen to discard)");
    return;
  }

  const ownHand = state.players[ownerIndex].hand;
  const dIdx = ownHand.findIndex((c) => c.instanceId === discardId);
  if (dIdx === -1) {
    log(`discard_to_flip: discard card ${discardId} not found in hand`);
    return;
  }

  const [discarded] = ownHand.splice(dIdx, 1);
  discarded.face = CardFace.FaceUp;
  state.trashes[ownerIndex].push(discarded);
  state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
  log(`discard_to_flip: discarded ${discarded.defId}`);

  if (!flipTargetId) {
    log("discard_to_flip: no flip target provided");
    return;
  }

  let found = false;
  for (let pi = 0; pi < 2; pi++) {
    for (const line of state.players[pi].lines) {
      const c = line.cards.find((card) => card.instanceId === flipTargetId);
      if (c) {
        const wasDown = c.face === CardFace.FaceDown;
        c.face = wasDown ? CardFace.FaceUp : CardFace.FaceDown;
        log(`discard_to_flip: ${c.defId} is now ${c.face}`);
        if (wasDown) enqueueEffectsOnFlipFaceUp(state, pi as 0 | 1, c);
        found = true;
        break;
      }
    }
    if (found) break;
  }

  if (!found) log(`discard_to_flip: flip target ${flipTargetId} not found`);
};

registerHandler("discard_to_flip", handleDiscardToFlip);

const handleDiscardToDelete2: EffectHandler = (state, effect, log) => {
  const { ownerIndex, cardDefId, payload, sourceInstanceId } = effect;
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
};

registerHandler("discard_to_delete2", handleDiscardToDelete2);
