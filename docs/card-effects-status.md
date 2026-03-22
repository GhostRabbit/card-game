# Card Effects — Implementation Status & Sign-off

**Legend**
- `✅` Implemented and fires correctly
- `⚠️` Implemented with a known caveat (see note)
- `🔲` Stub — whitelisted, silently skips (no game logic runs)
- `❌` Missing from whitelist — currently logs "unhandled effect type" warning
- `🔴` Dead code — switch case exists in CardEffects.ts but no card uses this effect type

Sign-off column: mark `[x]` when you're happy with the current behaviour.

---

## Passive effects (evaluated outside resolveEffects)

`trigger: "passive"` effects are **not handled by the queued `resolveEffects` path**. They are evaluated via hook points in the current game loop (e.g. line value calculation, play-denial checks, and on-cover/after-event hooks).

| Effect type | Cards | Meaning | Sign-off |
|---|---|---|---|
| `value_bonus_per_facedown` | apy_0 | +1 line value per face-down card in line | `[ ]` |
| `ignore_mid_commands` | apy_2 | Ignore middle cards' effects in this line | `[ ]` |
| `on_covered_flip_self` | apy_2 | When covered: flip self first | `[ ]` |
| `facedown_value_override` | drk_2 | Face-down cards in stack count as 4 | `[ ]` |
| `on_covered` | fir_0 | When covered: draw 1, flip 1 | `[ ]` |
| `after_delete_draw` | hat_3 | After you delete: draw 1 | `[ ]` |
| `on_covered_delete_lowest` | hat_4 | When covered: delete lowest covered card in line | `[ ]` |
| `on_covered_delete_self` | lif_0 | When covered: delete self first | `[ ]` |
| `on_covered_deck_to_other_line` | lif_3 | When covered: play top deck card face-down in another line | `[ ]` |
| `reduce_opponent_value` | mtl_0 | Opponent's line value –2 | `[ ]` |
| `deny_facedown` | mtl_2 | Opponent cannot play face-down in this line | `[ ]` |
| `deny_play_in_line` | plg_0 | Opponent cannot play cards in this line | `[ ]` |
| `after_opp_discard_draw` | plg_1 | After opponent discards: draw 1 | `[ ]` |
| `deny_faceup` | psy_1 | Opponent can only play face-down | `[ ]` |
| `after_clear_cache_draw` | spd_1 | After you clear cache: draw 1 | `[ ]` |
| `on_compile_delete_shift_self` | spd_2 | When deleted by compiling: shift self (even if covered) | `[ ]` |
| `after_draw_shift_self` | spr_3 | After you draw: may shift self (even if covered) | `[ ]` |
| `on_covered_or_flip_delete_self` | mtl_6 | When covered or flipped: delete self first | `[ ]` |

---

## Active effects — all fully implemented (42 types)

All types are handled in `executeEffect()` in CardEffects.ts. Effects that require player input set `state.phase = "EffectResolution"` and wait for a `resolve_effect` socket event.

### Core types

| Effect type | Trigger | Cards | What happens | Sign-off |
|---|---|---|---|---|
| `draw` | immediate / end | drk_0 (3), grv_1 (2), lif_2 (1), lgt_1 (1 end), lgt_2 (2), mtl_1 (2), mtl_3 (1), psy_0 (2), spd_1 (2), spr_0 (1), wtr_2 (2) | `drawCards(owner, N)` — draws N cards face-up from deck; reshuffles trash if deck empty | `[ ]` |
| `opponent_discard` | immediate | plg_0 (1), plg_1 (1), psy_2 (2), psy_3 (1) | `discardFromHand(opponent, N)` — discards N random cards from opponent's hand | `[ ]` |
| `discard` | immediate | all _5 cards (15) | Remove targeted card from own hand to trash | `[ ]` |
| `return` | immediate | wtr_3, wtr_4 | Remove targeted card from any line → owner's hand face-up | `[ ]` |
| `conditional_draw` | immediate | lif_4 | Draw N if source card is at index > 0 in its line | `[ ]` |
| `rearrange_protocols` | immediate | psy_2 (opp), wtr_2 (self) | Reassign lineIndex only; compile status preserved | `[ ]` |
| `deck_to_other_lines` | immediate | wtr_1 | Play top deck card face-down in each line other than source's | `[ ]` |
| `deck_to_each_line` | immediate | lif_0 | Play top deck card face-down in each occupied line | `[ ]` |
| `opponent_deck_to_line` | immediate | grv_6 | Opponent plays their top deck card face-down in the matching line | `[ ]` |
| `deck_to_under` | immediate | grv_0 | Insert floor(N/2) deck cards just below source card | `[ ]` |
| `flip_self` | immediate / start | wtr_0, psy_1 | Toggle source card’s face (face-up ↔ face-down) | `[ ]` |
| `return_opp_flip_self` | end | psy_4 | Return 1 opponent card to their hand; then flip this card | `[ ]` |
| `opp_delete_facedown_flip_self` | end | plg_4 | Opponent trashes 1 of their face-down cards; owner may flip this card | `[ ]` |
| `play_facedown` | immediate | drk_3 | Move a hand card face-down into a different line (no effects triggered) | `[ ]` |
| `refresh` | immediate | lov_2, spr_0 | Draw cards until hand is 5; turn ends naturally when queue drains | `[ ]` |
| `skip_check_cache` | immediate | spr_0 | Sets a flag consumed by endTurn — clear-cache discard skipped once | `[ ]` |
| `deny_compile` | immediate | mtl_1 | Sets a flag — opponent’s compile phase produces no lines next turn | `[ ]` |
| `opponent_draw` | immediate | lov_2 (1), lov_6 (2) | `drawCards(opponent, N)` | `[ ]` |
| `draw_from_opponent_deck` | immediate | lov_1 | Takes top card of opponent’s deck into owner’s hand face-up | `[ ]` |
| `exchange_hand` | immediate | lov_3 | Takes 1 random opponent hand card; gives 1 chosen hand card to opponent | `[ ]` |
| `give_to_draw` | end | lov_1 | Gives 1 chosen hand card to opponent; draws 2 (skipped if no target) | `[ ]` |
| `discard_or_flip_self` | start | spr_1 | Discards chosen card OR flips this card (choice via targetInstanceId) | `[ ]` |


---

### Additional types

| Effect type | Trigger | Cards | What happens | Sign-off |
|---|---|---|---|---|
| `flip` | immediate | apy_1/3/4, drk_1/2, fir_0, grv_2, lif_1/2, lgt_2, lov_4, mtl_0, plg_3, spr_2, wtr_0 | Toggle a card's face; variant in `payload.targets`; flipping face-up fires `enqueueEffectsOnFlipFaceUp()` | `[ ]` |
| `shift` | immediate / end | drk_0/4, grv_1/2/4, lgt_3, psy_3, spd_3/4 | Move a card to a different line; `targetLineIndex` required | `[ ]` |
| `delete` | immediate | dth_0/2/3/4, hat_0, mtl_3 | Trash card(s) from any line; `payload.targets` selects variant (`each_other_line`, `line_values_1_2`, `line_8plus_cards`, `any_card`, `any_facedown`, `value_0_or_1`) | `[ ]` |
| `delete_highest_both` | immediate | hat_2 | Each player trashes their own highest-value card | `[ ]` |
| `opponent_discard_reveal` | immediate | psy_0 | Opponent discards N random cards, then reveals their hand | `[ ]` |
| `play_card` | immediate | spd_0 | Grants an extra card play within the same turn | `[ ]` |
| `play_any_line` | immediate | spr_1 | Allow playing a card into any line this turn, plus draw 2 | `[ ]` |
| `flip_draw_equal` | immediate | lgt_0 | Flip 1 card; draw cards equal to that card's value | `[ ]` |
| `shift_flip_self` | end | spd_3 | Optionally shift 1 own card; if you do, flip the source card | `[ ]` |
| `discard_to_delete` | immediate | fir_1 | Discard 1 card; if you do, delete 1 card | `[ ]` |
| `discard_to_delete2` | immediate | hat_1 | Discard 1 card; if you do, delete up to 2 cards | `[ ]` |
| `discard_to_opp_discard_more` | immediate | plg_2 | Discard 1+ cards; opponent discards that amount + 1 | `[ ]` |
| `discard_to_flip` | end | fir_3 | Discard 1 card; if you do, flip 1 card | `[ ]` |
| `discard_to_draw` | immediate | fir_4 | Discard 1+ cards; draw that amount + 1 | `[ ]` |
| `discard_to_return` | immediate | fir_2 | Discard 1 card; if you do, return 1 card to owner's hand | `[ ]` |
| `swap_protocols` | immediate | spr_4 | Swap the lineIndex of 2 of your own protocols | `[ ]` |
| `reveal_shift_or_flip` | immediate | lgt_2 | Reveal 1 face-down card; choose to shift or flip it | `[ ]` |
| `reveal_hand` | immediate | lgt_4 | Opponent's full hand is broadcast as revealed to the owner | `[ ]` |
| `reveal_own_hand` | immediate | lov_4 | Owner reveals 1 chosen hand card to both players | `[ ]` |
| `draw_then_delete_self` | start | dth_1 | Draw 1 card, then this card removes itself from its line | `[ ]` |

---

## Per-card quick reference

| Card | Effects fired (trigger -> type) | Status |
|---|---|---|
| apy_0 | passive: value_bonus_per_facedown | done |
| apy_1 | immediate: flip (own face-up others) | done |
| apy_2 | passive: on_covered_flip_self; passive stub: ignore_mid_commands | on_covered_flip_self done; ignore_mid_commands not implemented |
| apy_3 | immediate: flip (opp face-up) | done |
| apy_4 | immediate: flip (own covered, optional) | done |
| apy_5 | immediate: discard 1 | done |
| drk_0 | immediate: draw 3 + shift (opp covered) | done |
| drk_1 | immediate: flip opp any + shift last targeted | done |
| drk_2 | passive: facedown_value_override + immediate: flip covered in line | done active / passive |
| drk_3 | immediate: play_facedown | done |
| drk_4 | immediate: shift any face-down | done |
| drk_5 | immediate: discard 1 | done |
| dth_0 | immediate: delete each other line | done |
| dth_1 | start: draw_then_delete_self | done |
| dth_2 | immediate: delete line values 1-2 | done |
| dth_3 | immediate: delete any face-down | done |
| dth_4 | immediate: delete value 0 or 1 | done |
| dth_5 | immediate: discard 1 | done |
| fir_0 | immediate: flip any + draw 2; passive: on_covered | done active / passive |
| fir_1 | immediate: discard_to_delete | done |
| fir_2 | immediate: discard_to_return | done |
| fir_3 | end: discard_to_flip | done |
| fir_4 | immediate: discard_to_draw | done |
| fir_5 | immediate: discard 1 | done |
| grv_0 | immediate: deck_to_under | done |
| grv_1 | immediate: draw 2 + shift to/from source line | done |
| grv_2 | immediate: flip any + shift that card to source line | done |
| grv_4 | immediate: shift any face-down to source line | done |
| grv_5 | immediate: discard 1 | done |
| grv_6 | immediate: opponent_deck_to_line | done |
| hat_0 | immediate: delete any | done |
| hat_1 | immediate: discard_to_delete2 | done |
| hat_2 | immediate: delete_highest_both | done |
| hat_3 | passive: after_delete_draw | done |
| hat_4 | passive: on_covered_delete_lowest | done |
| hat_5 | immediate: discard 1 | done |
| lif_0 | immediate: deck_to_each_line; passive: on_covered_delete_self | done active / passive |
| lif_1 | immediate: flip x2 (any_uncovered, re-enqueue) | done |
| lif_2 | immediate: draw 1 + flip any face-down (optional) | done |
| lif_3 | passive: on_covered_deck_to_other_line | done |
| lif_4 | immediate: conditional_draw | done |
| lif_5 | immediate: discard 1 | done |
| lgt_0 | immediate: flip_draw_equal | done |
| lgt_1 | end: draw 1 | done |
| lgt_2 | immediate: draw 2 + reveal_shift_or_flip | done |
| lgt_3 | immediate: shift own face-down in line to another line | done |
| lgt_4 | immediate: reveal_hand | done |
| lgt_5 | immediate: discard 1 | done |
| lov_1 | immediate: draw_from_opponent_deck; end: give_to_draw | done |
| lov_2 | immediate: opponent_draw 1 + refresh | done |
| lov_3 | immediate: exchange_hand | done |
| lov_4 | immediate: reveal_own_hand + flip any | done |
| lov_5 | immediate: discard 1 | done |
| lov_6 | immediate: opponent_draw 2 | done |
| mtl_0 | passive: reduce_opponent_value; immediate: flip any | done active / passive |
| mtl_1 | immediate: draw 2 + deny_compile | done |
| mtl_2 | passive: deny_facedown | done |
| mtl_3 | immediate: draw 1 + delete line 8+ cards | done |
| mtl_5 | immediate: discard 1 | done |
| mtl_6 | passive: on_covered_or_flip_delete_self | done |
| plg_0 | immediate: opponent_discard 1; passive: deny_play_in_line | done active / passive |
| plg_1 | immediate: opponent_discard 1; passive: after_opp_discard_draw | done active / passive |
| plg_2 | immediate: discard_to_opp_discard_more | done |
| plg_3 | immediate: flip all other face-up | done |
| plg_4 | end: opp_delete_facedown_flip_self | done |
| plg_5 | immediate: discard 1 | done |
| psy_0 | immediate: draw 2 + opponent_discard_reveal 2 | done |
| psy_1 | passive: deny_faceup; start: flip_self | done active / passive |
| psy_2 | immediate: opponent_discard 2 + rearrange_protocols opp | done |
| psy_3 | immediate: opponent_discard 1 + shift opp any | done |
| psy_4 | end: return_opp_flip_self | done |
| psy_5 | immediate: discard 1 | done |
| spd_0 | immediate: play_card | done |
| spd_1 | immediate: draw 2; passive: after_clear_cache_draw | done active / passive |
| spd_2 | passive: on_compile_delete_shift_self | done |
| spd_3 | immediate: shift own others; end: shift_flip_self | done |
| spd_4 | immediate: shift opp face-down | done |
| spd_5 | immediate: discard 1 | done |
| spr_0 | immediate: refresh + draw 1 + skip_check_cache | done |
| spr_1 | immediate: play_any_line + draw 2; start: discard_or_flip_self | done |
| spr_2 | immediate: flip any (optional) | done |
| spr_3 | passive: after_draw_shift_self | done |
| spr_4 | immediate: swap_protocols | done |
| spr_5 | immediate: discard 1 | done |
| wtr_0 | immediate: flip any + flip_self | done |
| wtr_1 | immediate: deck_to_other_lines | done |
| wtr_2 | immediate: draw 2 + rearrange_protocols own | done |
| wtr_3 | immediate: return line value-2 cards | done |
| wtr_4 | immediate: return own any | done |
| wtr_5 | immediate: discard 1 | done |

---

## Quick summary

| Category | Count |
|---|---|
| Active effect types fully implemented | 42 types |
| Active effect types with caveats | 0 |
| Stub effect types remaining | 0 |
| Passive effect types implemented | 17 of 18 (`ignore_mid_commands` not yet wired in) |
