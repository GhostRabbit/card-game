import { CardFace } from "@compile/shared";
import { v4 as uuidv4 } from "uuid";
import { CARD_MAP } from "../../data/cards";
import { scanPassives } from "../CardEffects";
import { drawCards } from "../GameEngine";
import { EffectHandler, registerHandler } from "./registry";

const handleDelete: EffectHandler = (state, effect, log) => {
  const { ownerIndex, cardDefId, payload, trigger, sourceInstanceId } = effect;
  const targets = payload.targets as string | undefined;
  const targetId = payload.targetInstanceId as string | undefined;
  const targetLineIndex = payload.targetLineIndex as number | undefined;

  const deleteCard = (instanceId: string): boolean => {
    for (let pi = 0; pi < 2; pi++) {
      for (const line of state.players[pi as 0 | 1].lines) {
        const idx = line.cards.findIndex((c) => c.instanceId === instanceId);
        if (idx === -1) continue;

        const [trashed] = line.cards.splice(idx, 1);
        state.trashes[pi as 0 | 1].push(trashed);
        state.players[pi as 0 | 1].trashSize = state.trashes[pi as 0 | 1].length;
        log(`delete: removed ${trashed.defId} (player ${pi})`);
        return true;
      }
    }
    return false;
  };

  if (targets === "each_other_line") {
    const remainingFromPayload = payload.remainingLineIndices as number[] | undefined;

    const enqueueNextEachOtherLineStep = (remainingLineIndices: number[]) => {
      state.effectQueue.unshift({
        id: uuidv4(),
        cardDefId,
        cardName: effect.cardName,
        type: "delete",
        description: `Choose the next line to process (${remainingLineIndices.length} left).`,
        ownerIndex,
        trigger,
        payload: { ...payload, targets: "each_other_line", remainingLineIndices },
        sourceInstanceId,
      });
    };

    if (!remainingFromPayload || remainingFromPayload.length === 0) {
      let srcLine = -1;
      if (sourceInstanceId) {
        for (let li = 0; li < 3; li++) {
          if (state.players[ownerIndex].lines[li].cards.some((c) => c.instanceId === sourceInstanceId)) {
            srcLine = li;
            break;
          }
        }
      }

      const initialRemaining = [0, 1, 2].filter(
        (li) => li !== srcLine && state.players[ownerIndex].lines[li].cards.length > 0,
      );
      if (initialRemaining.length === 0) {
        log("delete each_other_line: no valid other lines to process");
        return;
      }

      enqueueNextEachOtherLineStep(initialRemaining);
      return;
    }

    if (targetLineIndex === undefined || !remainingFromPayload.includes(targetLineIndex)) {
      log("delete each_other_line: selected line is not in remaining choices");
      enqueueNextEachOtherLineStep(remainingFromPayload);
      return;
    }

    const selectedLine = targetLineIndex;
    const line = state.players[ownerIndex].lines[selectedLine];
    if (line.cards.length > 0) {
      const [trashed] = line.cards.splice(line.cards.length - 1, 1);
      state.trashes[ownerIndex].push(trashed);
      state.players[ownerIndex].trashSize = state.trashes[ownerIndex].length;
      log(`delete each_other_line: removed ${trashed.defId} from line ${selectedLine}`);
      for (const { card, amount: drawAmt } of scanPassives(state, ownerIndex, "after_delete_draw")) {
        log(`after_delete_draw (${card.defId}): drawing ${drawAmt}`);
        drawCards(state, ownerIndex, drawAmt);
      }
    } else {
      log(`delete each_other_line: line ${selectedLine} had no cards at resolution time`);
    }

    const nextRemaining = remainingFromPayload.filter((li) => li !== selectedLine);
    if (nextRemaining.length > 0) {
      enqueueNextEachOtherLineStep(nextRemaining);
    }
    return;
  }

  if (targets === "line_values_1_2") {
    if (targetLineIndex === undefined) {
      log("delete line_values_1_2: no targetLineIndex provided");
      return;
    }
    const li = targetLineIndex;
    if (li < 0 || li > 2) {
      log(`delete line_values_1_2: invalid lineIndex ${li}`);
      return;
    }

    let totalDeleted = 0;
    for (const lpi of [0, 1] as const) {
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
    return;
  }

  if (targets === "line_8plus_cards") {
    if (targetLineIndex === undefined) {
      log("delete line_8plus_cards: no targetLineIndex provided");
      return;
    }
    const li = targetLineIndex;
    if (li < 0 || li > 2) {
      log(`delete line_8plus_cards: invalid lineIndex ${li}`);
      return;
    }

    const totalCards = state.players[0].lines[li].cards.length + state.players[1].lines[li].cards.length;
    if (totalCards < 8) {
      log(`delete line_8plus_cards: line ${li} has only ${totalCards} total cards`);
      return;
    }

    let totalRemoved = 0;
    for (const lpi of [0, 1] as const) {
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
    return;
  }

  if (!targetId) {
    log("delete: no targetInstanceId provided");
    return;
  }

  let found = false;
  outer: for (let pi = 0; pi < 2; pi++) {
    for (const line of state.players[pi as 0 | 1].lines) {
      const c = line.cards.find((cc) => cc.instanceId === targetId);
      if (!c) continue;

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

  if (found) {
    deleteCard(targetId);
    for (const { card, amount: drawAmt } of scanPassives(state, ownerIndex, "after_delete_draw")) {
      log(`after_delete_draw (${card.defId}): drawing ${drawAmt}`);
      drawCards(state, ownerIndex, drawAmt);
    }
    return;
  }

  log(`delete: target ${targetId} not found or invalid`);
};

registerHandler("delete", handleDelete);
