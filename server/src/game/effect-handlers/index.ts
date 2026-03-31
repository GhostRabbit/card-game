/**
 * Effect Handlers Index
 * 
 * This file imports all effect handler modules, causing them to register
 * themselves with the effect handler registry on module load.
 * 
 * Import this file early in the application lifecycle (e.g., in CardEffects.ts)
 * to ensure all handlers are available before any effects are executed.
 */

// Import all handler modules (order doesn't matter as each auto-registers)
import "./simple-state-handlers";
import "./draw-handlers";
import "./hand-discard-handlers";
import "./protocol-handlers";
import "./combo-handlers";
import "./conditional-handlers";
import "./multistep-handlers";
import "./trigger-handlers";
import "./board-conditional-handlers";
import "./board-action-handlers";
import "./delete-handlers";
import "./shift-handlers";
import "./flip-handlers";
// Future handler modules will be imported here as they are created:
// import "./delete-handlers";
// import "./card-movement-handlers";
// import "./flip-shift-handlers";
// ... etc

export { registerHandler, getEffectHandler, executeEffectByHandler } from "./registry";
