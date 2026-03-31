# executeEffect() Refactoring Progress

## Phase 1: Handler Registry Foundation ✅ DONE (2026-03-29)

**What was done:**
- Created `effect-handlers/registry.ts` with `EffectHandler` type and registration system
- Created `effect-handlers/simple-state-handlers.ts` (5 handlers)
- Created `effect-handlers/draw-handlers.ts` (5 handlers)
- Updated `executeEffect()` to use hybrid approach (try registry, fallback to switch)
- Exported internal helpers from `CardEffects.ts`: `scanPassives()`, `findSourceLineIndex()`
- All 349 CardEffects tests passing ✅

**Handlers completed (10/75):**
1. ✅ `deny_compile`
2. ✅ `skip_check_cache`
3. ✅ `play_card`
4. ✅ `play_any_line`
5. ✅ `refresh`
6. ✅ `draw`
7. ✅ `opponent_draw`
8. ✅ `draw_if_hand_empty`
9. ✅ `draw_if_opponent_higher_in_line`
10. ✅ `conditional_draw`

**Benefits of this approach:**
- Handler registry can be extended incrementally without touching `executeEffect()` main logic
- Tests validate each handler independently
- No breaking changes to existing code
- Clear pattern for new handlers to follow

---

## Phase 2: Discard & Basic Card Movement (NEXT)

**Target: 15 handlers total (+5 from phase 1)**

Create `effect-handlers/discard-handlers.ts`:
- `discard` (complex - triggers after_opp_discard_draw passive)
- `opponent_discard`
- `opponent_discard_reveal`
- `discard_or_flip_self`
- `discard_then_opponent_discard`

**Why these are good candidates:**
- Medium complexity (involve hand/trash mutations)
- Isolated state (hand/trash, no field traversal)
- Good pattern for testing passive triggering

---

## Phase 3: Protocol & Basic State Management

**Target: 25 handlers total (+10)**

Create `effect-handlers/protocol-handlers.ts`:
- `rearrange_protocols` (reorder protocol line assignment)
- `swap_protocols` (swap two protocol positions)

Create `effect-handlers/combo-handlers.ts`:
- `exchange_hand` (two-step: queue next phase)
- `give_to_draw` (give 1 card, draw 2)
- `discard_to_draw` (discard N, draw N+1)
- `discard_to_delete` (discard → delete sequence)
- `discard_to_return` (discard → return sequence)
- `discard_to_flip` (discard → flip)
- `discard_to_delete2` (discard → 2 deletes)
- `draw_then_delete_self` (optional draw → delete)

---

## Phase 4: Complex Conditional Effects

**Target: 40 handlers total (+15)**

Create `effect-handlers/conditional-handlers.ts`:
- `play_facedown` (requires line validation)
- `return` (multi-variant: line_value_2, own_any, opponent_any)
- `draw_per_distinct_protocols_in_source_line`
- `draw_if_opponent_higher_in_line`
- `draw_all_protocol_from_deck_if_hand_empty`
- `flip_self_if_hand_gt`
- `flip_self` (source card flip)
- `flip_self_if_opponent_higher_in_line`
- `discard_entire_deck`
- `flip_self_if_hand_gt`
- `take_opponent_facedown_to_hand`
- `delete_in_winning_line`
- `delete_self_if_field_protocols_below`
- `on_compile_delete_shift_self`
- `delete_self_if_covered`
- `draw_per_protocol_cards_in_field`

---

## Phase 5: Multi-step & Iterative Effects

**Target: 60 handlers total (+20)**

Create `effect-handlers/multistep-handlers.ts`:
- `reveal_hand` (multi-step: queue choice + read)
- `reveal_top_deck` (multi-step: peek + optional discard)
- `reveal_own_hand` (single card reveal)
- `reveal_shift_or_flip` (reveal + conditional)
- `deck_to_other_lines` (play deck cards to non-source lines)
- `deck_to_each_line` (iterative: one per line)
- `opponent_deck_to_line` (opponent deck → player line)
- `deck_to_under` (insert under source)
- `flip_covered_in_each_line` (iterative: queue per line)
- `on_covered_deck_to_other_line` (passive: queue on cover)
- `play_top_deck_facedown_then_flip` (multi-action)
- `top_deck_discard_draw_value` (peak top → discard → draw)
- `top_deck_to_lines_with_facedown` (distribute based on condition)
- `swap_top_deck_draws` (mutual cross-deck)
- `reshuffle_trash` (trash → deck)
- `draw_from_opponent_deck` (cross-player theft)
- `draw_value_from_deck_then_shuffle` (search + shuffle)
- `trash_to_other_line_facedown` (trash card placement)
- `opponent_discard_hand_then_draw_minus` (discard hand, draw -1)
- `both_players_discard_hand` (mutual hand discard)

---

## Phase 6: Field Deletion & Complex Board Operations

**Target: 75 handlers total (+15)**

Create `effect-handlers/delete-handlers.ts` (THE BIG ONE):
- `delete` (6+ variants: any_card, own_any, opp_any, line_lowest, each_other_line, highest_both, etc.)
- `delete_highest_both` (auto-resolve, both players)
- `opp_delete_facedown_flip_self` (opponent delete + conditional self flip)
- `return_opp_flip_self` (return opponent card + flip self)
- `on_covered_delete_self` (passive: delete on cover)
- `on_covered_delete_lowest` (passive: delete line's lowest)
- `shift_flip_self` (shift + conditional flip)
- `shift` (multi-variant: similar to delete complexity)
- `after_draw_shift_self` (passive: shift after draw)
- `discard_or_delete_self` (choice between discard/delete)
- `shift_self_to_best_opponent_line` (find best target + move)

---

## Summary

**Current Status:** 10/75 handlers extracted (13%)

**Next Action:** Extract Phase 2 (discard handlers) to reach 20% milestone

**Estimated Timings:**
- Phase 2: 45 min (discard, opponent_discard patterns well-established)
- Phase 3: 1 hr (protocols, simple combos)
- Phase 4: 1.5 hrs (conditional, requires careful variant handling)
- Phase 5: 2 hrs (multi-step, queue management)
- Phase 6: 3 hrs (delete/shift complexity, field traversal)

**TOTAL REMAINING: ~8 hours to full migration**

---

## Quality Checklist

As each handler is extracted:
- [ ] Handler function created with `EffectHandler` type
- [ ] Handler registered via `registerHandler("type", handler)`
- [ ] CardEffects tests still pass (349/349)
- [ ] No TypeScript errors on build
- [ ] Documentation comment added to handler function
- [ ] Similar handlers grouped in same file for code organization

---

## Benefits of Incremental Migration

✅ **Testing**: Each phase can be paused and validated independently  
✅ **Risk**: No single large change breaks the system  
✅ **Review**: Changes can be reviewed incrementally  
✅ **Debugging**: Problems isolated to specific handler  
✅ **Code reuse**: Handlers can share utilities  
✅ **Maintainability**: 2600-line function gradually transforms to 75 organized handlers  
