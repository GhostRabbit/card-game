# TODO_DONE

Archive of completed tasks.

Rules:
- Move completed tasks here from `TODO.md`.
- Keep newest completions at the top.

## Done
- [x] Added focused codex edge-case regressions in `server/src/game/__tests__/CardEffects.test.ts` for `psy_0` enqueue normalization (`opponent_discard_reveal` -> opponent-owned `discard` prompts) across enqueue-from-card, flip-face-up, and uncover paths; focused server test file passes 349 tests.
- [x] Added `docs/architecture-and-message-flows.md` to document the overall package/class structure, main runtime flows, an end-to-end effect-resolution example, and the socket message frequency/payload model.
- [x] Re-ran and stabilized Playwright UI coverage around effect-resolution flows by fixing the shared effect-description test helper to read the HUD status contract first; focused suite `tests/card-effects.ui.spec.ts` now passes 25/25.
- [x] Replaced the protocol playing-field background tint with the same black-plus-protocol tint treatment used by non-empty card sections, while preserving valid-placement highlighting.
- [x] Fixed opponent-discard ownership flow so discard prompts go directly to the opponent (no intermediate confirm on the card owner), and audited opponent-discard enqueue paths for consistent acting-player prompts.
- [x] PLay cards: The value number ti the right in the card head, should use the same Text style as the head title
- [x] When refereincing the anme iof a card in text (Like "oppenent id playing card XXX") it is not enough to reference teh Proitcol name, the value shoud be part of referrne, (Example "...is playing Psychic 4)
- [x] When there is an ongoing effect by a card, that card and/or section sshould be highlighted. I am thinging of something slowly pulsatingAnn groewing/shrinking boarder, or some color pulse.
- [x] Revisited protocol color diversity with a reproducible pairwise metric (primary ΔE + accent ΔE), added analysis script, and adjusted Unity/Time palettes to raise the global minimum diversity score. | owner: @copilot | priority: P1 | link: scripts/protocol-color-diversity.js
- [x] Restructured GameScene playfield vertical spacing: reduced top dead space, created a dedicated status lane between opponent field and protocol strip, and moved action/effect phase guidance into that lane. | owner: @copilot | priority: P1 | link: client/src/scenes/GameScene.ts
- [x] On title page, adjusted text vertical positioning: moved "A Two-Player Card Game" down one line and moved "AVAILABLE PROTOCOL SETS" + "DRAFT VARIANT" up by a smaller line offset. | owner: @copilot | priority: P2 | link: client/src/scenes/MenuScene.ts
- [x] Performance pass: analyzed likely network/render hotspot and applied easy improvements (truncate transmitted trash-card arrays to recent window + explicit discard counts in UI). | owner: @copilot | priority: P1 | link: server/src/game/StateView.ts
- [x] Finish codex/rules docs sync in README.md and docs/l2p-compile.md. | owner: @copilot | priority: P1 | link: docs/codex-gap-analysis-and-plan.md
- [x] Add codex errata/changelog tracking under docs/. | owner: @copilot | priority: P2 | link: docs/codex-errata-tracking.md
- [x] Implement player-directed resolution order for "each" effects to match codex semantics. | owner: @copilot | priority: P1 | link: docs/codex-gap-analysis-and-plan.md
- [x] Create a dedicated repo task file (this TODO board). | owner: @copilot | priority: P2 | link: TODO.md
