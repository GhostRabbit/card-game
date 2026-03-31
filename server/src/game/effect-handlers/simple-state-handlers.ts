/**
 * Simple State Flag Handlers
 * 
 * Effects that primarily set game state flags:
 * - deny_compile: Mark compile as denied for this turn
 * - skip_check_cache: Skip the end-of-turn cache-clear discard
 * - play_card: Grant a bonus card play (any line)
 * - play_any_line: Grant bonus play + draw combo
 * - refresh: Draw cards to hand size 5
 */

import { PendingEffect } from "@compile/shared";
import { ServerGameState, drawCards } from "../GameEngine";
import { registerHandler, EffectHandler } from "./registry";

// ─── deny_compile ─────────────────────────────────────────────────────────────

const handleDenyCompile: EffectHandler = (state, effect, log) => {
  state.denyCompile = true;
  log("deny_compile: compile is denied for this turn");
};

registerHandler("deny_compile", handleDenyCompile);

// ─── skip_check_cache ─────────────────────────────────────────────────────────

const handleSkipCheckCache: EffectHandler = (state, effect, log) => {
  state.skipCheckCache = true;
  log("skip_check_cache: clear-cache discard will be skipped this turn");
};

registerHandler("skip_check_cache", handleSkipCheckCache);

// ─── play_card ────────────────────────────────────────────────────────────────

const handlePlayCard: EffectHandler = (state, effect, log) => {
  state.pendingBonusPlay = { anyLine: false };
  log("play_card: bonus card play granted (must choose line)");
};

registerHandler("play_card", handlePlayCard);

// ─── play_any_line ────────────────────────────────────────────────────────────

const handlePlayAnyLine: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const drawAmount = (payload.draw as number) ?? 1;
  
  // First draw, then grant bonus play
  if (drawAmount > 0) {
    drawCards(state, ownerIndex, drawAmount);
  }
  state.pendingBonusPlay = { anyLine: true };
  log(`play_any_line: drew ${drawAmount}, granted bonus card play (any line)`);
};

registerHandler("play_any_line", handlePlayAnyLine);

// ─── refresh ──────────────────────────────────────────────────────────────────

const handleRefresh: EffectHandler = (state, effect, log) => {
  const { ownerIndex } = effect;
  const needed = 5 - state.players[ownerIndex].hand.length;
  
  if (needed > 0) {
    log(`refresh: drawing ${needed} to fill hand to 5`);
    drawCards(state, ownerIndex, needed);
  } else {
    log("refresh: hand already at 5 or more, nothing to draw");
  }
};

registerHandler("refresh", handleRefresh);
