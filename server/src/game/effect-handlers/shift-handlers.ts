import { CardFace, CardInstance } from "@compile/shared";
import { enqueueEffectsOnCover, isCardCovered } from "../CardEffects";
import { EffectHandler, registerHandler } from "./registry";

const handleShift: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload, sourceInstanceId } = effect;
  const targets = payload.targets as string | undefined;
  const targetId = payload.targetInstanceId as string | undefined;
  const targetLineIndex = payload.targetLineIndex as number | undefined;
  const toSourceLine = (payload.toSourceLine as boolean) ?? false;
  const optional = (payload.optional as boolean) ?? false;

  const findShiftCard = (
    id: string,
  ): { pi: 0 | 1; li: number; idx: number; card: CardInstance } | null => {
    for (let pi = 0; pi < 2; pi++) {
      for (let li = 0; li < 3; li++) {
        const idx = state.players[pi as 0 | 1].lines[li].cards.findIndex((c) => c.instanceId === id);
        if (idx !== -1) {
          return {
            pi: pi as 0 | 1,
            li,
            idx,
            card: state.players[pi as 0 | 1].lines[li].cards[idx],
          };
        }
      }
    }
    return null;
  };

  const doShift = (
    loc: { pi: 0 | 1; li: number; idx: number; card: CardInstance },
    destLine: number,
  ): boolean => {
    if (destLine < 0 || destLine > 2) {
      log(`shift: invalid destLine ${destLine}`);
      return false;
    }
    if (loc.li === destLine) {
      log("shift: card is already in the target line");
      return false;
    }

    const shiftDest = state.players[loc.pi].lines[destLine];
    const shiftPrevTop = shiftDest.cards.length > 0 ? shiftDest.cards[shiftDest.cards.length - 1] : null;
    const [moved] = state.players[loc.pi].lines[loc.li].cards.splice(loc.idx, 1);
    shiftDest.cards.push(moved);
    if (shiftPrevTop) enqueueEffectsOnCover(state, shiftPrevTop, loc.pi);
    log(`shift: moved ${moved.defId} (P${loc.pi}) from line ${loc.li} to line ${destLine}`);
    return true;
  };

  let srcLine = -1;
  if (sourceInstanceId) {
    for (let li = 0; li < 3; li++) {
      if (state.players[ownerIndex].lines[li].cards.some((c) => c.instanceId === sourceInstanceId)) {
        srcLine = li;
        break;
      }
    }
  }

  if (targets === "own_facedown_in_line") {
    if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
      log("shift own_facedown_in_line: no valid targetLineIndex");
      return;
    }
    if (srcLine === -1) {
      log("shift own_facedown_in_line: source line not found");
      return;
    }
    if (srcLine === targetLineIndex) {
      log("shift own_facedown_in_line: source and target are the same line");
      return;
    }

    let movedCount = 0;
    for (const pi of [0, 1] as const) {
      const srcRef = state.players[pi].lines[srcLine];
      const toMove = srcRef.cards.filter(
        (c) => c.face === CardFace.FaceDown && c.instanceId !== sourceInstanceId,
      );
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
    return;
  }

  if (targets === "last_targeted") {
    const lastId = state.lastTargetedInstanceId;
    if (!lastId) {
      log("shift last_targeted: no last targeted card");
      return;
    }
    const found = findShiftCard(lastId);
    if (!found) {
      log(`shift last_targeted: last targeted card ${lastId} not found`);
      return;
    }
    const dest = toSourceLine ? srcLine : targetLineIndex;
    if (dest === undefined || dest < 0 || dest > 2) {
      log("shift last_targeted: no valid destination line");
      return;
    }
    doShift(found, dest);
    return;
  }

  if (targets === "self_if_covered") {
    if (!sourceInstanceId) {
      log("shift self_if_covered: no sourceInstanceId");
      return;
    }
    if (!isCardCovered(state, sourceInstanceId)) {
      log("shift self_if_covered: source card is not covered — skipped");
      return;
    }
    const selfFound = findShiftCard(sourceInstanceId);
    if (!selfFound) {
      log("shift self_if_covered: source card not found");
      return;
    }
    if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
      if (optional) {
        log("shift self_if_covered: skipped (optional, no line chosen)");
        return;
      }
      log("shift self_if_covered: no valid targetLineIndex");
      return;
    }
    doShift(selfFound, targetLineIndex);
    return;
  }

  if (!targets) {
    if (!targetId) {
      log("shift: no targetInstanceId");
      return;
    }
    if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
      log("shift: no valid targetLineIndex");
      return;
    }

    const found = findShiftCard(targetId);
    if (!found) {
      log(`shift: card ${targetId} not found`);
      return;
    }
    if (isCardCovered(state, found.card.instanceId)) {
      log("shift: target must be uncovered");
      return;
    }
    if (found.pi !== ownerIndex) {
      log("shift: grv_1 may only shift own cards");
      return;
    }
    if (srcLine < 0 || srcLine > 2) {
      log("shift: source line not found");
      return;
    }
    if (found.li === srcLine) {
      if (targetLineIndex === srcLine) {
        log("shift: cannot target same source line when shifting from source line");
        return;
      }
    } else if (targetLineIndex !== srcLine) {
      log("shift: move must be to source line when picked card is outside source line");
      return;
    }

    doShift(found, targetLineIndex);
    return;
  }

  if (!targetId) {
    if (optional) {
      log("shift: skipped (optional, no target chosen)");
      return;
    }
    log("shift: no targetInstanceId");
    return;
  }

  const found = findShiftCard(targetId);
  if (!found) {
    log(`shift: card ${targetId} not found`);
    return;
  }

  if (targets === "any_facedown") {
    if (found.card.face !== CardFace.FaceDown || isCardCovered(state, found.card.instanceId)) {
      log("shift any_facedown: target must be uncovered face-down");
      return;
    }
    const dest = toSourceLine ? srcLine : targetLineIndex;
    if (dest === undefined || dest < 0 || dest > 2) {
      log("shift any_facedown: no valid destination line");
      return;
    }
    doShift(found, dest);
    return;
  }

  if (targets === "any_uncovered") {
    if (isCardCovered(state, found.card.instanceId)) {
      log("shift any_uncovered: target must be uncovered");
      return;
    }
    if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
      log("shift any_uncovered: no valid targetLineIndex");
      return;
    }
    doShift(found, targetLineIndex);
    return;
  }

  if (targets === "covered_facedown") {
    if (found.card.face !== CardFace.FaceDown || !isCardCovered(state, found.card.instanceId)) {
      log("shift covered_facedown: target must be covered face-down");
      return;
    }
    if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
      log("shift covered_facedown: no valid targetLineIndex");
      return;
    }
    doShift(found, targetLineIndex);
    return;
  }

  if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
    log("shift: no valid targetLineIndex");
    return;
  }

  if (targets === "opponent_covered") {
    if (found.pi === ownerIndex) {
      log("shift opponent_covered: must target opponent's card");
      return;
    }
    if (!isCardCovered(state, found.card.instanceId)) {
      log("shift opponent_covered: target must be covered");
      return;
    }
    doShift(found, targetLineIndex);
    return;
  }

  if (targets === "opponent_any") {
    if (found.pi === ownerIndex) {
      log("shift opponent_any: must target opponent's card");
      return;
    }
    if (isCardCovered(state, found.card.instanceId)) {
      log("shift opponent_any: target must be uncovered");
      return;
    }
    doShift(found, targetLineIndex);
    return;
  }

  if (targets === "opponent_facedown") {
    if (found.pi === ownerIndex) {
      log("shift opponent_facedown: must target opponent's card");
      return;
    }
    if (found.card.face !== CardFace.FaceDown || isCardCovered(state, found.card.instanceId)) {
      log("shift opponent_facedown: target must be uncovered face-down");
      return;
    }
    doShift(found, targetLineIndex);
    return;
  }

  if (targets === "own_others") {
    if (found.pi !== ownerIndex) {
      log("shift own_others: must target own card");
      return;
    }
    if (isCardCovered(state, found.card.instanceId)) {
      log("shift own_others: target must be uncovered");
      return;
    }
    if (sourceInstanceId && found.card.instanceId === sourceInstanceId) {
      log("shift own_others: cannot shift source card");
      return;
    }
    doShift(found, targetLineIndex);
    return;
  }

  if (targets === "any_other") {
    if (found.card.instanceId === sourceInstanceId) {
      log("shift any_other: cannot shift source card");
      return;
    }
    if (isCardCovered(state, found.card.instanceId)) {
      log("shift any_other: target must be uncovered");
      return;
    }
    doShift(found, targetLineIndex);
    return;
  }

  if (targets === "own_covered") {
    if (found.pi !== ownerIndex) {
      log("shift own_covered: must target own card");
      return;
    }
    if (!isCardCovered(state, found.card.instanceId)) {
      log("shift own_covered: target must be covered");
      return;
    }
    doShift(found, targetLineIndex);
    return;
  }

  if (targets === "opponent_in_source_line") {
    if (srcLine < 0) {
      log("shift opponent_in_source_line: source line not found");
      return;
    }
    if (found.pi === ownerIndex) {
      log("shift opponent_in_source_line: must target opponent card");
      return;
    }
    if (found.li !== srcLine) {
      log("shift opponent_in_source_line: target must be in source line");
      return;
    }
    if (isCardCovered(state, found.card.instanceId)) {
      log("shift opponent_in_source_line: target must be uncovered");
      return;
    }
    doShift(found, targetLineIndex);
    return;
  }

  log(`shift: unknown targets variant "${targets}"`);
};

registerHandler("shift", handleShift);
