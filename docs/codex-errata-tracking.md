# Codex Errata and Clarification Tracking

Purpose: keep a lightweight, versioned record of codex clarifications and implementation sync status to prevent rules drift.

## Usage
- Add one row per distinct clarification/errata item.
- Update `Impl Status` and `Test Status` whenever code/tests change.
- Keep `Owner` and `Date` current for accountability.

## Table

| Codex Version | Area | Card/Rule | Issue / Ambiguity | Clarification / Agreed Interpretation | Impl Status | Test Status | Owner | Date |
|---|---|---|---|---|---|---|---|---|
| 2026-03 extract | Core rules | Refresh eligibility | Refresh wording was interpreted as always allowed. | Refresh is legal only when hand size is below 5. | done | done | @copilot | 2026-03-29 |
| 2026-03 extract | Core rules | Draw-only reshuffle | Non-draw top-deck effects were reshuffling trash. | Auto-reshuffle applies only to draw events. | done | done | @copilot | 2026-03-29 |
| 2026-03 extract | Core rules | Covered targeting defaults | Broad targeting modes allowed covered cards too often. | Default targeting is uncovered-only unless text says covered/all or implied specific target. | done | done | @copilot | 2026-03-29 |
| 2026-03 extract | Effect semantics | each processing order | each variants resolved in fixed order. | Snapshot valid objects, then owner chooses processing order step-by-step. | done | done | @copilot | 2026-03-29 |
| 2026-03 extract | Docs sync | README + l2p cue card | Docs omitted several codex nuance rules. | Added codex-aligned nuances (refresh gate, draw-only reshuffle, covered defaults, each-order, start/end queue timing). | done | n/a | @copilot | 2026-03-29 |

## Status Legend
- `planned`: identified, not implemented.
- `in-progress`: partially implemented or partially tested.
- `done`: implemented and validated.
- `n/a`: not applicable.
