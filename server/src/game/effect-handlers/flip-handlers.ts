import { CardFace, CardInstance } from "@compile/shared";
import { v4 as uuidv4 } from "uuid";
import { CARD_MAP } from "../../data/cards";
import { enqueueEffectsOnFlipFaceUp, isCardCovered } from "../CardEffects";
import { drawCards, FACE_DOWN_VALUE, ServerGameState } from "../GameEngine";
import { EffectHandler, registerHandler } from "./registry";

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

const getEffectiveCardValue = (card: CardInstance): number => {
  if (card.face === CardFace.FaceDown) return FACE_DOWN_VALUE;
  return CARD_MAP.get(card.defId)?.value ?? 0;
};

const handleFlip: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload, sourceInstanceId } = effect;
  const oi: 0 | 1 = ownerIndex === 0 ? 1 : 0;

  const targets = payload.targets as string | undefined;
  const optional = (payload.optional as boolean) ?? false;
  const bonusDraw = (payload.draw as number) ?? 0;
  const targetId = payload.targetInstanceId as string | undefined;
  const flipCount = (payload.count as number) ?? 1;

  const findFlipCard = (id: string): { card: CardInstance; ownerIdx: 0 | 1 } | null => {
    for (let pi = 0; pi < 2; pi++) {
      for (const line of state.players[pi as 0 | 1].lines) {
        const c = line.cards.find((card) => card.instanceId === id);
        if (c) return { card: c, ownerIdx: pi as 0 | 1 };
      }
    }
    return null;
  };

  const doFlip = (card: CardInstance, cardOwnerIdx: 0 | 1): void => {
    const flipDef = CARD_MAP.get(card.defId);
    if (flipDef?.effects.some((e) => e.trigger === "passive" && e.type === "cannot_be_flipped")) {
      log(`flip: ${card.defId} cannot be flipped`);
      return;
    }

    if (
      flipDef?.effects.some(
        (e) => e.trigger === "passive" && e.type === "on_covered_or_flip_delete_self",
      )
    ) {
      for (const line of state.players[cardOwnerIdx].lines) {
        const idx = line.cards.findIndex((c) => c.instanceId === card.instanceId);
        if (idx === -1) continue;
        const [trashed] = line.cards.splice(idx, 1);
        state.trashes[cardOwnerIdx].push(trashed);
        state.players[cardOwnerIdx].trashSize = state.trashes[cardOwnerIdx].length;
        log(`flip: ${card.defId} has on_covered_or_flip_delete_self — deleted instead`);
        return;
      }
      return;
    }

    const wasDown = card.face === CardFace.FaceDown;
    card.face = wasDown ? CardFace.FaceUp : CardFace.FaceDown;
    log(`flip: ${card.defId} is now ${card.face}`);
    if (wasDown) enqueueEffectsOnFlipFaceUp(state, cardOwnerIdx, card);
  };

  if (targets === "own_faceup_others") {
    for (const line of state.players[ownerIndex].lines) {
      if (sourceInstanceId && !line.cards.some((c) => c.instanceId === sourceInstanceId)) continue;
      for (const c of line.cards) {
        if (c.instanceId === sourceInstanceId) continue;
        if (c.face === CardFace.FaceUp) doFlip(c, ownerIndex);
      }
    }
    log("flip: auto-flipped own face-up others in source line");
    return;
  }

  if (targets === "all_other_faceup") {
    for (let pi = 0; pi < 2; pi++) {
      for (const line of state.players[pi as 0 | 1].lines) {
        for (const c of line.cards) {
          if (c.instanceId === sourceInstanceId) continue;
          if (c.face === CardFace.FaceUp) doFlip(c, pi as 0 | 1);
        }
      }
    }
    log("flip: auto-flipped all other face-up cards");
    return;
  }

  if (optional && !targetId) {
    log("flip: optional, skipped");
    return;
  }

  if (!targetId) {
    log("flip: no targetInstanceId provided");
    return;
  }

  const flipFound = findFlipCard(targetId);
  if (!flipFound) {
    log(`flip: target ${targetId} not found`);
    return;
  }
  const { card: flipTarget, ownerIdx: flipOwnerIdx } = flipFound;

  if (targets === "any_other" && targetId === sourceInstanceId) {
    log("flip: cannot flip the source card (any_other)");
    return;
  }

  if (targets === "opponent_in_last_target_line") {
    if (flipOwnerIdx === ownerIndex || isCardCovered(state, targetId)) {
      log("flip: target must be an opponent's uncovered card");
      return;
    }

    const lastTargetId = state.lastTargetedInstanceId;
    if (!lastTargetId) {
      log("flip: no last targeted card for line comparison");
      return;
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
      return;
    }

    const targetLine = state.players[oi].lines.findIndex((line) =>
      line.cards.some((c) => c.instanceId === targetId),
    );
    if (targetLine !== lastTargetLine) {
      log("flip: target must be in the same line as the last targeted card");
      return;
    }
  }

  if (targets === "self") {
    if (!sourceInstanceId) {
      log("flip: self target requires sourceInstanceId");
      return;
    }
    if (targetId !== sourceInstanceId) {
      log("flip: self target must be the source card");
      return;
    }
  }

  if (targets === "own_any" && flipOwnerIdx !== ownerIndex) {
    log("flip: target must be your own uncovered card");
    return;
  }
  if (targets === "any_card" && isCardCovered(state, targetId)) {
    log("flip: target must be an uncovered card");
    return;
  }
  if (
    targets === "any_faceup_uncovered" &&
    (flipTarget.face !== CardFace.FaceUp || isCardCovered(state, targetId))
  ) {
    log("flip: target must be an uncovered face-up card");
    return;
  }
  if (targets === "own_any" && isCardCovered(state, targetId)) {
    log("flip: target must be an uncovered card");
    return;
  }

  const minCountInField = payload.minCountInField as number | undefined;
  const protocolId = payload.protocolId as string | undefined;
  if (protocolId && minCountInField !== undefined) {
    if (countCardsInFieldByProtocol(state, protocolId) < minCountInField) {
      log(`flip: skipped (field has fewer than ${minCountInField} ${protocolId} card(s))`);
      return;
    }
  }

  const maxValueSource = payload.maxValueSource as string | undefined;
  const valueComparison = (payload.valueComparison as string | undefined) ?? "lt";
  if (maxValueSource === "distinct_protocols_in_field") {
    const threshold = countDistinctProtocolsInField(state);
    const cardValue = getEffectiveCardValue(flipTarget);
    const allowed = valueComparison === "lte" ? cardValue <= threshold : cardValue < threshold;
    if (!allowed) {
      log(
        `flip: target value must be ${valueComparison === "lte" ? "at most" : "less than"} ${threshold}`,
      );
      return;
    }
  }

  if (targets === "any_covered" && !isCardCovered(state, targetId)) {
    log("flip: target must be a covered card");
    return;
  }
  if (
    targets === "any_faceup_covered" &&
    (flipTarget.face !== CardFace.FaceUp || !isCardCovered(state, targetId))
  ) {
    log("flip: target must be a face-up covered card");
    return;
  }
  if (targets === "any_other" && isCardCovered(state, targetId)) {
    log("flip: target must be an uncovered card");
    return;
  }

  if (targets === "opponent_faceup") {
    if (flipOwnerIdx === ownerIndex || flipTarget.face !== CardFace.FaceUp || isCardCovered(state, targetId)) {
      log("flip: target must be an opponent face-up card");
      return;
    }
  }
  if (targets === "opponent_any" && (flipOwnerIdx === ownerIndex || isCardCovered(state, targetId))) {
    log("flip: target must be an opponent's uncovered card");
    return;
  }
  if (targets === "any_uncovered" && isCardCovered(state, targetId)) {
    log("flip: target must be an uncovered card");
    return;
  }

  if (targets === "own_faceup_covered") {
    if (flipOwnerIdx !== ownerIndex || flipTarget.face !== CardFace.FaceUp || !isCardCovered(state, targetId)) {
      log("flip: target must be own face-up covered card");
      return;
    }
  }
  if (targets === "any_facedown" && (flipTarget.face !== CardFace.FaceDown || isCardCovered(state, targetId))) {
    log("flip: target must be an uncovered face-down card");
    return;
  }

  if (targets === "own_covered_in_line") {
    if (flipOwnerIdx !== ownerIndex || !isCardCovered(state, targetId)) {
      log("flip: target must be own covered card");
      return;
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
        return;
      }
    }
  }

  doFlip(flipTarget, flipOwnerIdx);
  state.lastTargetedInstanceId = targetId;
  if (bonusDraw > 0) drawCards(state, ownerIndex, bonusDraw);

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
};

registerHandler("flip", handleFlip);
