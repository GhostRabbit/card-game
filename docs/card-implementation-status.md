# Card Implementation Status

Last updated: 2026-03-17

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | All active effects implemented |
| 🔶 | Partially implemented (some effects done, others stubbed) |
| 🔲 | Fully stubbed — no active effects run |
| 🔵 | Passive-only — no active effects exist; needs passive system |
| ⚠️ | At least one effect type is missing from the whitelist (logs a warning in-game) |

Passive effects are **not** tracked per-card here — they require a separate evaluation system and are not yet wired in regardless of card status.

---

## Implemented effect types

| Type | What it does |
|---|---|
| `draw` | Draw N cards from deck; reshuffles trash if empty |
| `discard` | Owner discards a chosen card from hand (by `targetInstanceId`) |
| `opponent_discard` | Opponent discards N random cards from hand |

---

## Card status

### Apathy (proto_apy)

| Card | Value | Active effects | Status |
|---|---|---|---|
| apy_0 | 0 | — | 🔵 passive only |
| apy_1 | 1 | `flip` own face-up others | 🔲 |
| apy_2 | 2 | — | 🔵 passive only |
| apy_3 | 3 | `flip` opponent face-up | 🔲 |
| apy_4 | 4 | `flip` own covered (optional) | 🔲 |
| apy_5 | 5 | `discard` 1 | ✅ |

### Darkness (proto_drk)

| Card | Value | Active effects | Status |
|---|---|---|---|
| drk_0 | 0 | `draw` 3 + `shift` opponent covered | 🔶 draw ✅ / shift 🔲 |
| drk_1 | 1 | `flip` opponent any + `shift` last targeted | � flip ✅ / shift �🔲 |
| drk_2 | 2 | `flip` own covered in line | 🔲 |
| drk_3 | 3 | `play_facedown` | ✅ |
| drk_4 | 4 | `shift` any face-down | 🔲 |
| drk_5 | 5 | `discard` 1 | ✅ |

### Death (proto_dth)

| Card | Value | Active effects | Status |
|---|---|---|---|
| dth_0 | 0 | `delete` any card | ✅ |
| dth_1 | 1 | `draw_then_delete_self` (start) | ✅ |
| dth_2 | 2 | `delete` line values 1–2 | ✅ |
| dth_3 | 3 | `delete` any face-down | ✅ |
| dth_4 | 4 | `delete` value 0 or 1 | ✅ |
| dth_5 | 5 | `discard` 1 | ✅ |

### Fire (proto_fir)

| Card | Value | Active effects | Status |
|---|---|---|---|
| fir_0 | 0 | `flip` any + draw 2 | ✅ |
| fir_1 | 1 | `discard_to_delete` | ✅ |
| fir_2 | 2 | `discard_to_return` | ✅ |
| fir_3 | 3 | `discard_to_flip` (end) | ✅ |
| fir_4 | 4 | `discard_to_draw` | ✅ |
| fir_5 | 5 | `discard` 1 | ✅ |

### Gravity (proto_grv)

| Card | Value | Active effects | Status |
|---|---|---|---|
| grv_0 | 0 | `deck_to_under` | ✅ |
| grv_1 | 1 | `draw` 2 + `shift` to/from line | 🔶 draw ✅ / shift 🔲 |
| grv_2 | 2 | `flip` any + `shift` that card | � flip ✅ / shift �🔲 |
| grv_4 | 4 | `shift` any face-down to line | 🔲 |
| grv_5 | 5 | `discard` 1 | ✅ |
| grv_6 | 6 | `opponent_deck_to_line` | ✅ |

### Hate (proto_hat)

| Card | Value | Active effects | Status |
|---|---|---|---|
| hat_0 | 0 | `delete` any | ✅ |
| hat_1 | 1 | `discard_to_delete2` (discard 3 → delete × 2) | ✅ |
| hat_2 | 2 | `delete_highest_both` | ✅ |
| hat_3 | 3 | — | 🔵 passive only |
| hat_4 | 4 | — | 🔵 passive only |
| hat_5 | 5 | `discard` 1 | ✅ |

### Life (proto_lif)

| Card | Value | Active effects | Status |
|---|---|---|---|
| lif_0 | 0 | `deck_to_each_line` | ✅ |
| lif_1 | 1 | `flip` × 2 | 🔲 |
| lif_2 | 2 | `draw` 1 + `flip` face-down (optional) | 🔶 draw ✅ / flip 🔲 |
| lif_3 | 3 | — | 🔵 passive only |
| lif_4 | 4 | `conditional_draw` (if covering) | ✅ |
| lif_5 | 5 | `discard` 1 | ✅ |

### Light (proto_lgt)

| Card | Value | Active effects | Status |
|---|---|---|---|
| lgt_0 | 0 | `flip_draw_equal` | ✅ |
| lgt_1 | 1 | `draw` 1 (end) | ✅ |
| lgt_2 | 2 | `draw` 2 + `reveal_shift_or_flip` | 🔶 draw ✅ / flip-branch ✅ / shift-branch 🔲 |
| lgt_3 | 3 | `shift` own face-down in line | 🔲 |
| lgt_4 | 4 | `reveal_hand` | ✅ |
| lgt_5 | 5 | `discard` 1 | ✅ |

### Love (proto_lov)

| Card | Value | Active effects | Status |
|---|---|---|---|
| lov_1 | 1 | `draw_from_opponent_deck` + `give_to_draw` (end) | ✅ |
| lov_2 | 2 | `opponent_draw` 1 + `refresh` | ✅ |
| lov_3 | 3 | `exchange_hand` | ✅ |
| lov_4 | 4 | `reveal_own_hand` + `flip` any | ✅ |
| lov_5 | 5 | `discard` 1 | ✅ |
| lov_6 | 6 | `opponent_draw` 2 | ✅ |

### Metal (proto_mtl)

| Card | Value | Active effects | Status |
|---|---|---|---|
| mtl_0 | 0 | `flip` any | 🔲 |
| mtl_1 | 1 | `draw` 2 + `deny_compile` | ✅ |
| mtl_2 | 2 | — | 🔵 passive only |
| mtl_3 | 3 | `draw` 1 + `delete` line 8+ cards | ✅ |
| mtl_5 | 5 | `discard` 1 | ✅ |
| mtl_6 | 6 | — | 🔵 passive only |

### Plague (proto_plg)

| Card | Value | Active effects | Status |
|---|---|---|---|
| plg_0 | 0 | `opponent_discard` 1 | ✅ |
| plg_1 | 1 | `opponent_discard` 1 | ✅ |
| plg_2 | 2 | `discard_to_opp_discard_more` | ✅ |
| plg_3 | 3 | `flip` all other face-up | 🔲 |
| plg_4 | 4 | `opp_delete_facedown_flip_self` (end) | ✅ |
| plg_5 | 5 | `discard` 1 | ✅ |

### Psychic (proto_psy)

| Card | Value | Active effects | Status |
|---|---|---|---|
| psy_0 | 0 | `draw` 2 + `opponent_discard_reveal` 2 | ✅ |
| psy_1 | 1 | `flip_self` (start) | � flip_self ✅ / passive 🔵 |
| psy_2 | 2 | `opponent_discard` 2 + `rearrange_protocols` opp | ✅ |
| psy_3 | 3 | `opponent_discard` 1 | ✅ |
| psy_4 | 4 | `return_opp_flip_self` (end) | ✅ |
| psy_5 | 5 | `discard` 1 | ✅ |

### Speed (proto_spd)

| Card | Value | Active effects | Status |
|---|---|---|---|
| spd_0 | 0 | `play_card` | ✅ |
| spd_1 | 1 | `draw` 2 | ✅ |
| spd_2 | 2 | — | 🔵 passive only |
| spd_3 | 3 | `shift` own others + `shift_flip_self` (end) | 🔶 shift_flip_self ✅ / shift 🔲 |
| spd_4 | 4 | `shift` opp face-down | 🔲 |
| spd_5 | 5 | `discard` 1 | ✅ |

### Spirit (proto_spr)

| Card | Value | Active effects | Status |
|---|---|---|---|
| spr_0 | 0 | `refresh` + `draw` 1 + `skip_check_cache` | ✅ |
| spr_1 | 1 | `play_any_line` + `discard_or_flip_self` (start) | ✅ |
| spr_2 | 2 | `flip` any (optional) | 🔲 |
| spr_3 | 3 | — | 🔵 passive only |
| spr_4 | 4 | `swap_protocols` | ✅ |
| spr_5 | 5 | `discard` 1 | ✅ |

### Water (proto_wtr)

| Card | Value | Active effects | Status |
|---|---|---|---|
| wtr_0 | 0 | `flip` any + `flip_self` | ✅ |
| wtr_1 | 1 | `deck_to_other_lines` | ✅ |
| wtr_2 | 2 | `draw` 2 + `rearrange_protocols` own | ✅ |
| wtr_3 | 3 | `return` line value-2 cards | ✅ |
| wtr_4 | 4 | `return` own any | ✅ |
| wtr_5 | 5 | `discard` 1 | ✅ |

---

## Summary

| Status | Card count |
|---|---|
| ✅ Fully implemented | 65 |
| 🔶 Partial (some effects done, others stubbed) | 5 |
| 🔲 Fully stubbed | 9 |
| 🔵 Passive-only (no active effects) | 9 |
| ⚠️ Has a warning-producing effect type | 0 |
| **Total** | **89** |

### Warning effects to fix

None.
