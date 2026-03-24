# Compile Codex Gap Analysis and Adjustment Plan

Source analyzed: `docs/The_Compile_Codex.pdf` (extracted to `docs/The_Compile_Codex.extracted.txt`)
Date: 2026-03-24

## Scope
This compares codex rules/clarifications against:
- Rules summary docs (`docs/l2p-compile.md`, `README.md` quick summary)
- Current server behavior (`server/src/game/GameEngine.ts`, `server/src/game/CardEffects.ts`)
- Current client targeting UX assumptions (`client/src/scenes/GameScene.ts`)

## Key Findings (Codex vs Current)

### 1) Refresh eligibility mismatch
- Codex: You cannot refresh at 5+ cards in hand.
- Current server: `refresh()` succeeds even at 5+, drawing 0 and ending turn.
- Gap type: Rules enforcement bug.
- Priority: P0.

### 2) Deck refill trigger mismatch (draw-only in codex)
- Codex: Auto-reshuffle only when a player would draw. Effects that play/discard/reveal top of deck do nothing if deck empty.
- Current server: `takeDeckCard()` reshuffles trash whenever deck is empty, and is used by non-draw effects (deck-to-line, etc.).
- Gap type: Core engine behavior mismatch.
- Priority: P0.

### 3) Default targeting too permissive for covered cards
- Codex default: Targeting effects select uncovered cards unless text says covered/all, or refers to implied "this/that" card.
- Current state:
  - Server validations for several modes (`any_card`, `opponent_any`, etc.) do not always enforce uncovered-only.
  - Client picker (`isBoardCardValidForEffect`) allows covered cards in broad modes.
- Gap type: Rules/UX targeting mismatch.
- Priority: P0.

### 4) "Each" processing order not player-directed
- Codex: For "each", identify valid objects first, then owner chooses processing order, resolving one at a time.
- Current server: "each" variants generally iterate in fixed order (line/card order).
- Gap type: Rules fidelity / choice model gap.
- Priority: P1.

### 5) Rules docs drift from codex clarifications
- `docs/l2p-compile.md` and `README.md` are simplified and omit/blur codex-critical edge cases:
   - Draw/discard batch semantics
   - Draw-only reshuffle rule
  - Refresh hand-size restriction
  - Covered/uncovered default targeting semantics
  - Start/End noting-window nuance
- Gap type: Documentation mismatch.
- Priority: P1.

## Areas that appear aligned
- Compile remains mandatory when available.
- Compile clears line as simultaneous "all" delete and does not process per-card delete triggers.
- Recompile top-of-opponent-deck ownership transfer behavior is present.
- Control token reset + optional protocol reorder on compile/refresh with control is implemented.
- Light 3 clarification direction is now substantially closer (all face-down in source line moved to one destination line, including opponent covered face-down).

## Implementation Plan

### Phase 1 (P0) — Engine correctness
1. Enforce refresh hand-size gate.
   - Update `refresh()` in `server/src/game/GameEngine.ts` to reject when hand size >= 5.
   - Add/adjust tests for refresh rejection at 5+.

2. Split deck top-card handling into draw-only vs non-draw behavior.
   - Keep reshuffle behavior in draw path (`drawCards`).
   - Introduce non-reshuffling top-deck helper for non-draw effects.
   - Refactor `CardEffects.ts` callers to use the correct helper.
   - Add tests: empty deck + non-draw top-deck effects should no-op without reshuffle.

3. Normalize targeting defaults to uncovered-only.
   - Server: add uncovered checks for broad target modes unless effect explicitly permits covered.
   - Client: mirror same rules in `isBoardCardValidForEffect` so UI only highlights legal targets.
   - Add tests for covered-card rejection in default modes and acceptance in covered/all/that-card cases.

### Phase 2 (P1) — "Each" semantics and ordering
4. Implement explicit object-note + owner-selected resolution order for "each" effects.
   - Add pending selection state for each-target batches (similar to current multi-step effect resolution).
   - Migrate affected effects (e.g., delete each other line, plague-style each flips where applicable).
   - Add tests validating order choice changes outcomes where applicable.

### Phase 3 (P1) — Rules/docs synchronization
5. Update player-facing rules docs to codex-consistent wording.
   - `docs/l2p-compile.md` + `README.md` quick summary.
   - Add concise "Codex-aligned rules nuances" section (batch semantics, covered targeting, draw-only reshuffle, refresh gate).

### Phase 4 (P2) — Codex errata tracking scaffolding
6. Add a codex-versioned changelog table under `docs/`.
   - Track card-level errata/clarifications and implementation/test status.
   - Include owner/date columns to prevent future drift.

## Suggested test updates
- `server/src/game/__tests__/CardEffects.test.ts`
  - Targeting legality matrix for covered/uncovered by mode.
  - Empty-deck behavior for non-draw top-deck effects.
  - "Each" ordering tests after phase 2.
- `server/src/game/__tests__/GameEngine.*`
  - Refresh denied at 5+ cards.

## Proposed execution order
1. Phase 1 items 1-3 in one branch (smallest rule-correctness set with strongest gameplay impact).
2. Phase 3 docs sync immediately after phase 1 merges.
3. Phase 2 as a dedicated branch (larger interaction model change).
4. Phase 4 lightweight process hardening.

## Risks and notes
- Tightening targeting rules may invalidate current UI/e2e tests that assumed broader selectable targets.
- "Each" order-choice introduces additional client interaction states; should be staged carefully to avoid regressions.
- Keep server authoritative: client highlight logic must mirror, not define, legality.
