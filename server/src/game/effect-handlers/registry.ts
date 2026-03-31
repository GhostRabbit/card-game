/**
 * Effect Handler Registry System
 * 
 * This module provides the infrastructure for effect handlers, replacing the
 * 2600+ line executeEffect() switch statement with a modular handler registry.
 * 
 * Each effect type maps to a handler function that mutates state and logs.
 * Multi-step effects can queue new effects for continued resolution.
 */

import { PendingEffect } from "@compile/shared";
import { ServerGameState } from "../GameEngine";

// ─── Handler Type & Registry ──────────────────────────────────────────────────

/**
 * Core effect handler signature: receives state, effect, and a logger function.
 * Handler is responsible for all state mutations and logging.
 */
export type EffectHandler = (
  state: ServerGameState,
  effect: PendingEffect,
  log: (msg: string) => void,
) => void;

/**
 * Registry mapping effect types to their handlers.
 * Built incrementally as handlers are added via registerHandler().
 */
const handlerRegistry = new Map<string, EffectHandler>();

/**
 * Register a single effect handler in the registry.
 * Called during module initialization to wire up all 75 handlers.
 */
export function registerHandler(type: string, handler: EffectHandler): void {
  if (handlerRegistry.has(type)) {
    console.warn(`[Effect Registry] Overwriting handler for effect type: ${type}`);
  }
  handlerRegistry.set(type, handler);
}

/**
 * Get a handler from the registry by effect type.
 * Returns the handler if found, or undefined if not registered.
 */
export function getEffectHandler(type: string): EffectHandler | undefined {
  return handlerRegistry.get(type);
}

/**
 * Execute an effect by looking up and calling its registered handler.
 * This is the main entry point that replaces the old giant switch statement.
 */
export function executeEffectByHandler(
  state: ServerGameState,
  effect: PendingEffect,
): void {
  const { ownerIndex, cardDefId, type, trigger } = effect;
  const log = (msg: string) =>
    state.pendingLogs.push(`  EFFECT [${trigger}] ${cardDefId}: ${msg}`);

  const handler = getEffectHandler(type);

  if (!handler) {
    // Maintain old behavior: log unhandled if not a known stub type
    const KNOWN_STUB_TYPES = new Set<string>(["ocr_unimplemented"]);
    if (!KNOWN_STUB_TYPES.has(type)) {
      log(`unhandled effect type: ${type}`);
    }
    return;
  }

  // Check source card is still active (same as before)
  if (effect.sourceInstanceId && !isSourceCardActive(state, effect.sourceInstanceId)) {
    log(`effect cancelled — source card ${effect.sourceInstanceId} no longer active`);
    return;
  }

  // Call the handler
  handler(state, effect, log);
}

// ─── Helper Functions (Shared by All Handlers) ────────────────────────────────

/**
 * Check if a card with given instanceId is face-up in any line.
 * Used for source card validation before effect execution.
 */
function isSourceCardActive(state: ServerGameState, instanceId: string): boolean {
  for (const player of state.players) {
    for (const line of player.lines) {
      for (const card of line.cards) {
        if (card.instanceId === instanceId && card.face === "FaceUp") {
          return true;
        }
      }
    }
  }
  return false;
}

// ─── Export Handler Registration Function ────────────────────────────────────

/**
 * Call this during module initialization to register all 75 effect handlers.
 * This is done by importing and calling setup code from handler modules.
 */
export function initializeEffectHandlers(): void {
  // Handlers will be registered via import of handler modules that call registerHandler()
  // This function is here for explicit initialization if needed.
}
