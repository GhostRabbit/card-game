/**
 * Basic Draw Handlers
 * 
 * Draw and draw-adjacent effects that interact with the deck/hand:
 * - draw: Core draw mechanic with after_draw_shift_self passive triggering
 * - opponent_draw: Direct opponent draw
 * - draw_if_hand_empty: Conditional draw on empty hand
 * - draw_if_opponent_higher_in_line: Draw if losing in source line
 */

import { PendingEffect, getOpponentIndex } from "@compile/shared";
import { ServerGameState, drawCards, lineValue } from "../GameEngine";
import { CARD_MAP } from "../../data/cards";
import { scanPassives, findSourceLineIndex } from "../CardEffects";
import { registerHandler, EffectHandler } from "./registry";
import { v4 as uuidv4 } from "uuid";

// ─── draw ─────────────────────────────────────────────────────────────────────

const handleDraw: EffectHandler = (state, effect, log) => {
  const { ownerIndex, trigger } = effect;
  const amount = (effect.payload.amount as number) ?? 1;
  
  log(`draw ${amount}`);
  drawCards(state, ownerIndex, amount);
  
  // Trigger after_draw_shift_self passives
  for (const { card } of scanPassives(state, ownerIndex, "after_draw_shift_self")) {
    const def = CARD_MAP.get(card.defId)!;
    state.effectQueue.push({
      id: uuidv4(),
      cardDefId: card.defId,
      cardName: def.name,
      type: "after_draw_shift_self",
      description: "You may shift this card.",
      ownerIndex,
      trigger: "immediate",
      payload: {},
      sourceInstanceId: card.instanceId,
    });
    log(`after_draw_shift_self enqueued for ${card.defId}`);
  }
};

registerHandler("draw", handleDraw);

// ─── opponent_draw ────────────────────────────────────────────────────────────

const handleOpponentDraw: EffectHandler = (state, effect, log) => {
  const { ownerIndex } = effect;
  const oi = getOpponentIndex(ownerIndex);
  const amount = (effect.payload.amount as number) ?? 1;
  
  log(`opponent_draw ${amount} (opponent draws)`);
  drawCards(state, oi, amount);
};

registerHandler("opponent_draw", handleOpponentDraw);

// ─── draw_if_hand_empty ───────────────────────────────────────────────────────

const handleDrawIfHandEmpty: EffectHandler = (state, effect, log) => {
  const { ownerIndex } = effect;
  const amount = (effect.payload.amount as number) ?? 1;
  
  if (state.players[ownerIndex].hand.length === 0) {
    log(`draw_if_hand_empty: drawing ${amount}`);
    drawCards(state, ownerIndex, amount);
  } else {
    log("draw_if_hand_empty: skipped (hand not empty)");
  }
};

registerHandler("draw_if_hand_empty", handleDrawIfHandEmpty);

// ─── draw_if_opponent_higher_in_line ───────────────────────────────────────────

const handleDrawIfOpponentHigherInLine: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId, payload } = effect;
  const oi = getOpponentIndex(ownerIndex);
  const amount = (payload.amount as number) ?? 1;
  
  const srcLine = findSourceLineIndex(state, ownerIndex, sourceInstanceId);
  if (srcLine === -1) {
    log("draw_if_opponent_higher_in_line: no sourceInstanceId");
    return;
  }
  
  if (lineValue(state, oi, srcLine) > lineValue(state, ownerIndex, srcLine)) {
    log(`draw_if_opponent_higher_in_line: drawing ${amount} (opponent winning)`);
    drawCards(state, ownerIndex, amount);
  } else {
    log("draw_if_opponent_higher_in_line: skipped (opponent not higher)");
  }
};

registerHandler("draw_if_opponent_higher_in_line", handleDrawIfOpponentHigherInLine);

// ─── conditional_draw ─────────────────────────────────────────────────────────

const handleConditionalDraw: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId, payload } = effect;
  const amount = (payload.amount as number) ?? 1;
  
  // Draws if the source card is at index > 0 in a line (i.e., covering another card)
  if (!sourceInstanceId) {
    log("conditional_draw: no sourceInstanceId");
    return;
  }
  
  for (const player of state.players) {
    for (const line of player.lines) {
      const idx = line.cards.findIndex((c) => c.instanceId === sourceInstanceId);
      if (idx > 0) {
        // Source card is covering — draw
        log(`conditional_draw: drawing ${amount} (source card covering)`);
        drawCards(state, ownerIndex, amount);
        return;
      }
    }
  }
  
  log("conditional_draw: skipped (source card not covering)");
};

registerHandler("conditional_draw", handleConditionalDraw);
