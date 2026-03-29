# Compile Codex Gap Analysis and Adjustment Plan

Source analyzed: `docs/The_Compile_Codex.pdf` (extracted to `docs/The_Compile_Codex.extracted.txt`)
Date: 2026-03-24
Re-evaluated: 2026-03-29

## Scope
This compares codex rules/clarifications against:
- Rules summary docs (`docs/l2p-compile.md`, `README.md` quick summary)
- Current server behavior (`server/src/game/GameEngine.ts`, `server/src/game/CardEffects.ts`)
- Current client targeting UX assumptions (`client/src/scenes/GameScene.ts`)

## Key Findings (Codex vs Current)

### 1) Refresh eligibility mismatch
- Status: Fixed.
- Codex: You cannot refresh at 5+ cards in hand.
- Current server: `refresh()` succeeds even at 5+, drawing 0 and ending turn.
- Gap type: Rules enforcement bug.
- Priority: P0.

Current status note:
- `refresh()` now rejects when hand size is 5 or more in `server/src/game/GameEngine.ts`.

### 2) Deck refill trigger mismatch (draw-only in codex)
- Status: Fixed.
- Codex: Auto-reshuffle only when a player would draw. Effects that play/discard/reveal top of deck do nothing if deck empty.
- Current server: `takeDeckCard()` reshuffles trash whenever deck is empty, and is used by non-draw effects (deck-to-line, etc.).
- Gap type: Core engine behavior mismatch.
- Priority: P0.

Current status note:
- Non-draw top-deck effects now use a non-reshuffling helper in `server/src/game/CardEffects.ts`.

### 3) Default targeting too permissive for covered cards
- Status: Fixed.
- Codex default: Targeting effects select uncovered cards unless text says covered/all, or refers to implied "this/that" card.
- Current state:
  - Server validations for several modes (`any_card`, `opponent_any`, etc.) do not always enforce uncovered-only.
  - Client picker (`isBoardCardValidForEffect`) allows covered cards in broad modes.
- Gap type: Rules/UX targeting mismatch.
- Priority: P0.

Current status note:
- Server validations and client target highlighting now default to uncovered-only except for explicit covered-mode effects.

### 4) "Each" processing order not player-directed
- Status: Fixed.
- Codex: For "each", identify valid objects first, then owner chooses processing order, resolving one at a time.
- Current server: "each" variants now stage valid targets and resolve in owner-chosen order, one at a time.
- Gap type: Rules fidelity / choice model gap.
- Priority: P1.

### 5) Rules docs drift from codex clarifications
- Status: Fixed.
- `docs/l2p-compile.md` and `README.md` are simplified and omit/blur codex-critical edge cases:
   - Draw/discard batch semantics
   - Draw-only reshuffle rule
  - Refresh hand-size restriction
  - Covered/uncovered default targeting semantics
  - Start/End noting-window nuance
- Gap type: Documentation mismatch.
- Priority: P1.

Current status note:
- `README.md` quick summary and `docs/l2p-compile.md` now include codex-aligned nuance coverage (refresh gate, draw-only reshuffle, covered targeting defaults, each-order semantics, and start/end queue timing).

## Areas that appear aligned
- Compile remains mandatory when available.
- Compile clears line as simultaneous "all" delete and does not process per-card delete triggers.
- Recompile top-of-opponent-deck ownership transfer behavior is present.
- Control token reset + optional protocol reorder on compile/refresh with control is implemented.
- Light 3 clarification direction is now substantially closer (all face-down in source line moved to one destination line, including opponent covered face-down).

## Implementation Plan

### Completed since this analysis was written
1. Refresh hand-size gate has been enforced.
2. Draw-only reshuffle behavior has been separated from non-draw top-deck handling.
3. Default targeting has been tightened to uncovered-only unless the effect explicitly allows covered targets.
4. "Each" effects now resolve through owner-directed staged order where applicable.
5. Rules docs have been synchronized with codex nuance wording.

### Remaining work

#### Phase 3 (P2) — Codex errata tracking scaffolding
1. Add a codex-versioned changelog table under `docs/`.
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
1. Add codex errata/changelog scaffolding to lock in documentation hygiene.

## Risks and notes
- Tightening targeting rules may invalidate current UI/e2e tests that assumed broader selectable targets.
- "Each" order-choice introduces additional client interaction states; should be staged carefully to avoid regressions.
- Keep server authoritative: client highlight logic must mirror, not define, legality.
