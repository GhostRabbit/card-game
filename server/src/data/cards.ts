import { CommandCardDef, ProtocolDef } from "@compile/shared";

export const PROTOCOLS: ProtocolDef[] = [
  { id: "proto_apy", name: "Apathy",  description: "Stillness as strategy. Rewards face-down cards and disrupts opponent face-up cards." },
  { id: "proto_drk", name: "Darkness", description: "Hidden power. Boosts face-down cards and manipulates covered positions." },
  { id: "proto_dth", name: "Death",   description: "Brutal deletion. Destroys low-value cards and accelerates through the deck." },
  { id: "proto_fir", name: "Fire",    description: "Volatile cycling. Discard to delete or return, generating surges of cards." },
  { id: "proto_grv", name: "Gravity", description: "Deck manipulation. Forces cards from decks and pulls cards into specific lines." },
  { id: "proto_hat", name: "Hate",    description: "Symmetrical destruction. Deletes cards from both sides at great cost." },
  { id: "proto_lif", name: "Life",    description: "Deck seeding and positional play. Thrives on covering and uncovering cards." },
  { id: "proto_lgt", name: "Light",   description: "Information and draw. Reveals hidden cards and refills the hand." },
  { id: "proto_lov", name: "Love",    description: "Exchange and cooperation. Shares cards to gain advantage." },
  { id: "proto_mtl", name: "Metal",   description: "Lockdown and denial. Restricts the opponent's actions and reduces their value." },
  { id: "proto_plg", name: "Plague",  description: "Forced discards. Depletes the opponent's hand relentlessly." },
  { id: "proto_psy", name: "Psychic", description: "Mind control. Forces discards, rearranges protocols, and denies plays." },
  { id: "proto_spd", name: "Speed",   description: "Extra plays and repositioning. Shifts cards freely across lines." },
  { id: "proto_spr", name: "Spirit",  description: "Flexible and adaptive. Plays anywhere, draws freely, shifts at will." },
  { id: "proto_wtr", name: "Water",   description: "Fluid control. Returns cards, rearranges protocols, and flips at will." },
];

/** IDs belonging to each release unit (used for game-mode filtering) */
export const MAIN_UNIT_1_IDS = new Set(PROTOCOLS.map((p) => p.id));
export const MAIN_UNIT_2_IDS = new Set<string>(); // placeholder — no cards yet

export const COMMAND_CARDS: CommandCardDef[] = [
  // ── APATHY (proto_apy) ────────────────────────────────────────────────────────────
  { id: "apy_0", name: "Apathy", value: 0, protocolId: "proto_apy",
    effects: [{ trigger: "passive", type: "value_bonus_per_facedown", description: "Your total value in this line is increased by 1 for each face-down card in this line.", payload: {} }] },
  { id: "apy_1", name: "Apathy", value: 1, protocolId: "proto_apy",
    effects: [{ trigger: "immediate", type: "flip", description: "Flip all other face-up cards in this line.", payload: { targets: "own_faceup_others" } }] },
  { id: "apy_2", name: "Apathy", value: 2, protocolId: "proto_apy",
    effects: [
      { trigger: "passive", type: "ignore_mid_commands", description: "Ignore all middle commands of cards in this line.", payload: {} },
      { trigger: "passive", type: "on_covered_flip_self", description: "When this card would be covered: First, flip this card.", payload: {} },
    ] },
  { id: "apy_3", name: "Apathy", value: 3, protocolId: "proto_apy",
    effects: [{ trigger: "immediate", type: "flip", description: "Flip 1 of your opponent's face-up cards.", payload: { targets: "opponent_faceup" } }] },
  { id: "apy_4", name: "Apathy", value: 4, protocolId: "proto_apy",
    effects: [{ trigger: "immediate", type: "flip", description: "You may flip 1 of your face-up covered cards.", payload: { targets: "own_faceup_covered" } }] },
  { id: "apy_5", name: "Apathy", value: 5, protocolId: "proto_apy",
    effects: [{ trigger: "immediate", type: "discard", description: "You discard 1 card.", payload: { amount: 1, who: "self" } }] },
  // ── DARKNESS (proto_drk) ─────────────────────────────────────────────────────────
  { id: "drk_0", name: "Darkness", value: 0, protocolId: "proto_drk",
    effects: [
      { trigger: "immediate", type: "draw", description: "Draw 3 cards.", payload: { amount: 3 } },
      { trigger: "immediate", type: "shift", description: "Shift 1 of your opponent's covered cards.", payload: { targets: "opponent_covered" } },
    ] },
  { id: "drk_1", name: "Darkness", value: 1, protocolId: "proto_drk",
    effects: [
      { trigger: "immediate", type: "flip", description: "Flip 1 of your opponent's cards.", payload: { targets: "opponent_any" } },
      { trigger: "immediate", type: "shift", description: "You may shift that card.", payload: { targets: "last_targeted" } },
    ] },
  { id: "drk_2", name: "Darkness", value: 2, protocolId: "proto_drk",
    effects: [
      { trigger: "passive", type: "facedown_value_override", description: "All face-down cards in this stack have a value of 4.", payload: { value: 4 } },
      { trigger: "immediate", type: "flip", description: "You may flip 1 covered card in this line.", payload: { targets: "own_covered_in_line" } },
    ] },
  { id: "drk_3", name: "Darkness", value: 3, protocolId: "proto_drk",
    effects: [{ trigger: "immediate", type: "play_facedown", description: "Play 1 card face-down in another line.", payload: {} }] },
  { id: "drk_4", name: "Darkness", value: 4, protocolId: "proto_drk",
    effects: [{ trigger: "immediate", type: "shift", description: "Shift 1 face-down card.", payload: { targets: "any_facedown" } }] },
  { id: "drk_5", name: "Darkness", value: 5, protocolId: "proto_drk",
    effects: [{ trigger: "immediate", type: "discard", description: "You discard 1 card.", payload: { amount: 1, who: "self" } }] },
  // ── DEATH (proto_dth) ──────────────────────────────────────────────────────────────
  { id: "dth_0", name: "Death", value: 0, protocolId: "proto_dth",
    effects: [{ trigger: "immediate", type: "delete", description: "Delete 1 card from each other line.", payload: { targets: "each_other_line" } }] },
  { id: "dth_1", name: "Death", value: 1, protocolId: "proto_dth",
    effects: [{ trigger: "start", type: "draw_then_delete_self", description: "You may draw 1 card. If you do, delete 1 other card, then delete this card.", payload: {} }] },
  { id: "dth_2", name: "Death", value: 2, protocolId: "proto_dth",
    effects: [{ trigger: "immediate", type: "delete", description: "Delete all cards in 1 line with values of 1 or 2.", payload: { targets: "line_values_1_2" } }] },
  { id: "dth_3", name: "Death", value: 3, protocolId: "proto_dth",
    effects: [{ trigger: "immediate", type: "delete", description: "Delete 1 face-down card.", payload: { targets: "any_facedown" } }] },
  { id: "dth_4", name: "Death", value: 4, protocolId: "proto_dth",
    effects: [{ trigger: "immediate", type: "delete", description: "Delete a card with a value of 0 or 1.", payload: { targets: "value_0_or_1" } }] },
  { id: "dth_5", name: "Death", value: 5, protocolId: "proto_dth",
    effects: [{ trigger: "immediate", type: "discard", description: "You discard 1 card.", payload: { amount: 1, who: "self" } }] },
  // ── FIRE (proto_fir) ───────────────────────────────────────────────────────────────
  { id: "fir_0", name: "Fire", value: 0, protocolId: "proto_fir",
    effects: [
      { trigger: "immediate", type: "flip", description: "Flip 1 other card. Draw 2 cards.", payload: { targets: "any_card", draw: 2 } },
      { trigger: "passive", type: "on_covered", description: "When covered: first, draw 1 card and flip 1 other card.", payload: {} },
    ] },
  { id: "fir_1", name: "Fire", value: 1, protocolId: "proto_fir",
    effects: [{ trigger: "immediate", type: "discard_to_delete", description: "Discard 1 card. If you do, delete 1 card.", payload: {} }] },
  { id: "fir_2", name: "Fire", value: 2, protocolId: "proto_fir",
    effects: [{ trigger: "immediate", type: "discard_to_return", description: "Discard 1 card. If you do, return 1 card.", payload: {} }] },
  { id: "fir_3", name: "Fire", value: 3, protocolId: "proto_fir",
    effects: [{ trigger: "end", type: "discard_to_flip", description: "You may discard 1 card. If you do, flip 1 card.", payload: {} }] },
  { id: "fir_4", name: "Fire", value: 4, protocolId: "proto_fir",
    effects: [{ trigger: "immediate", type: "discard_to_draw", description: "Discard 1 or more cards. Draw the amount discarded plus 1.", payload: {} }] },
  { id: "fir_5", name: "Fire", value: 5, protocolId: "proto_fir",
    effects: [{ trigger: "immediate", type: "discard", description: "You discard 1 card.", payload: { amount: 1, who: "self" } }] },
  // ── GRAVITY (proto_grv) — values 0,1,2,4,5,6 ────────────────────────────────────────────
  { id: "grv_0", name: "Gravity", value: 0, protocolId: "proto_grv",
    effects: [{ trigger: "immediate", type: "deck_to_under", description: "For every 2 cards in this line, play the top card of your deck face-down under this card.", payload: {} }] },
  { id: "grv_1", name: "Gravity", value: 1, protocolId: "proto_grv",
    effects: [
      { trigger: "immediate", type: "draw", description: "Draw 2 cards.", payload: { amount: 2 } },
      { trigger: "immediate", type: "shift", description: "Shift 1 card either to or from this line.", payload: {} },
    ] },
  { id: "grv_2", name: "Gravity", value: 2, protocolId: "proto_grv",
    effects: [
      { trigger: "immediate", type: "flip", description: "Flip 1 card.", payload: { targets: "any_card" } },
      { trigger: "immediate", type: "shift", description: "Shift that card to this line.", payload: { targets: "last_targeted", toSourceLine: true } },
    ] },
  { id: "grv_4", name: "Gravity", value: 4, protocolId: "proto_grv",
    effects: [{ trigger: "immediate", type: "shift", description: "Shift 1 face-down card to this line.", payload: { targets: "any_facedown", toSourceLine: true } }] },
  { id: "grv_5", name: "Gravity", value: 5, protocolId: "proto_grv",
    effects: [{ trigger: "immediate", type: "discard", description: "You discard 1 card.", payload: { amount: 1, who: "self" } }] },
  { id: "grv_6", name: "Gravity", value: 6, protocolId: "proto_grv",
    effects: [{ trigger: "immediate", type: "opponent_deck_to_line", description: "Your opponent plays the top card of their deck face-down in this line.", payload: {} }] },
  // ── HATE (proto_hat) ───────────────────────────────────────────────────────────────
  { id: "hat_0", name: "Hate", value: 0, protocolId: "proto_hat",
    effects: [{ trigger: "immediate", type: "delete", description: "Delete 1 card.", payload: { targets: "any_card" } }] },
  { id: "hat_1", name: "Hate", value: 1, protocolId: "proto_hat",
    effects: [{ trigger: "immediate", type: "discard_to_delete2", description: "Discard 3 cards. Delete 1 card. Delete 1 card.", payload: { discard: 3 } }] },
  { id: "hat_2", name: "Hate", value: 2, protocolId: "proto_hat",
    effects: [{ trigger: "immediate", type: "delete_highest_both", description: "Delete your highest value card. Delete your opponent's highest value card.", payload: {} }] },
  { id: "hat_3", name: "Hate", value: 3, protocolId: "proto_hat",
    effects: [{ trigger: "passive", type: "after_delete_draw", description: "After you delete cards: Draw 1 card.", payload: { amount: 1 } }] },
  { id: "hat_4", name: "Hate", value: 4, protocolId: "proto_hat",
    effects: [{ trigger: "passive", type: "on_covered_delete_lowest", description: "When covered: first, delete the lowest value covered card in this line.", payload: {} }] },
  { id: "hat_5", name: "Hate", value: 5, protocolId: "proto_hat",
    effects: [{ trigger: "immediate", type: "discard", description: "You discard 1 card.", payload: { amount: 1, who: "self" } }] },
  // ── LIFE (proto_lif) ───────────────────────────────────────────────────────────────
  { id: "lif_0", name: "Life", value: 0, protocolId: "proto_lif",
    effects: [
      { trigger: "immediate", type: "deck_to_each_line", description: "Play the top card of your deck face-down in each line where you have a card.", payload: {} },
      { trigger: "passive", type: "on_covered_delete_self", description: "When covered: first, delete this card.", payload: {} },
    ] },
  { id: "lif_1", name: "Life", value: 1, protocolId: "proto_lif",
    effects: [{ trigger: "immediate", type: "flip", description: "Flip 1 card. Flip 1 card.", payload: { count: 2, targets: "any_uncovered" } }] },
  { id: "lif_2", name: "Life", value: 2, protocolId: "proto_lif",
    effects: [
      { trigger: "immediate", type: "draw", description: "Draw 1 card.", payload: { amount: 1 } },
      { trigger: "immediate", type: "flip", description: "You may flip 1 face-down card.", payload: { targets: "any_facedown", optional: true } },
    ] },
  { id: "lif_3", name: "Life", value: 3, protocolId: "proto_lif",
    effects: [{ trigger: "passive", type: "on_covered_deck_to_other_line", description: "When covered: first, play the top card of your deck face-down in another line.", payload: {} }] },
  { id: "lif_4", name: "Life", value: 4, protocolId: "proto_lif",
    effects: [{ trigger: "immediate", type: "conditional_draw", description: "If this card is covering a card, draw 1 card.", payload: { amount: 1 } }] },
  { id: "lif_5", name: "Life", value: 5, protocolId: "proto_lif",
    effects: [{ trigger: "immediate", type: "discard", description: "You discard 1 card.", payload: { amount: 1, who: "self" } }] },
  // ── LIGHT (proto_lgt) ──────────────────────────────────────────────────────────────
  { id: "lgt_0", name: "Light", value: 0, protocolId: "proto_lgt",
    effects: [{ trigger: "immediate", type: "flip_draw_equal", description: "Flip 1 card. Draw cards equal to that card's value.", payload: {} }] },
  { id: "lgt_1", name: "Light", value: 1, protocolId: "proto_lgt",
    effects: [{ trigger: "end", type: "draw", description: "Draw 1 card.", payload: { amount: 1 } }] },
  { id: "lgt_2", name: "Light", value: 2, protocolId: "proto_lgt",
    effects: [
      { trigger: "immediate", type: "draw", description: "Draw 2 cards.", payload: { amount: 2 } },
      { trigger: "immediate", type: "reveal_shift_or_flip", description: "Reveal 1 face-down card. You may shift or flip that card.", payload: {} },
    ] },
  { id: "lgt_3", name: "Light", value: 3, protocolId: "proto_lgt",
    effects: [{ trigger: "immediate", type: "shift", description: "Shift all face-down cards in this line to another line.", payload: { targets: "own_facedown_in_line" } }] },
  { id: "lgt_4", name: "Light", value: 4, protocolId: "proto_lgt",
    effects: [{ trigger: "immediate", type: "reveal_hand", description: "Your opponent reveals their hand.", payload: {} }] },
  { id: "lgt_5", name: "Light", value: 5, protocolId: "proto_lgt",
    effects: [{ trigger: "immediate", type: "discard", description: "You discard 1 card.", payload: { amount: 1, who: "self" } }] },
  // ── LOVE (proto_lov) — values 1–6 ────────────────────────────────────────────────────────
  { id: "lov_1", name: "Love", value: 1, protocolId: "proto_lov",
    effects: [
      { trigger: "immediate", type: "draw_from_opponent_deck", description: "Draw the top card of your opponent's deck.", payload: {} },
      { trigger: "end", type: "give_to_draw", description: "You may give 1 card from your hand to your opponent. If you do, draw 2 cards.", payload: {} },
    ] },
  { id: "lov_2", name: "Love", value: 2, protocolId: "proto_lov",
    effects: [
      { trigger: "immediate", type: "opponent_draw", description: "Your opponent draws 1 card.", payload: { amount: 1 } },
      { trigger: "immediate", type: "refresh", description: "Refresh.", payload: {} },
    ] },
  { id: "lov_3", name: "Love", value: 3, protocolId: "proto_lov",
    effects: [{ trigger: "immediate", type: "exchange_hand", description: "Take 1 random card from your opponent's hand. Give 1 card from your hand to your opponent.", payload: {} }] },
  { id: "lov_4", name: "Love", value: 4, protocolId: "proto_lov",
    effects: [
      { trigger: "immediate", type: "reveal_own_hand", description: "Reveal 1 card from your hand.", payload: {} },
      { trigger: "immediate", type: "flip", description: "Flip 1 card.", payload: { targets: "any_card" } },
    ] },
  { id: "lov_5", name: "Love", value: 5, protocolId: "proto_lov",
    effects: [{ trigger: "immediate", type: "discard", description: "You discard 1 card.", payload: { amount: 1, who: "self" } }] },
  { id: "lov_6", name: "Love", value: 6, protocolId: "proto_lov",
    effects: [{ trigger: "immediate", type: "opponent_draw", description: "Your opponent draws 2 cards.", payload: { amount: 2 } }] },
  // ── METAL (proto_mtl) — values 0,1,2,3,5,6 ─────────────────────────────────────────────────
  { id: "mtl_0", name: "Metal", value: 0, protocolId: "proto_mtl",
    effects: [
      { trigger: "passive", type: "reduce_opponent_value", description: "Your opponent's total value in this line is reduced by 2.", payload: { amount: 2 } },
      { trigger: "immediate", type: "flip", description: "Flip 1 card.", payload: { targets: "any_card" } },
    ] },
  { id: "mtl_1", name: "Metal", value: 1, protocolId: "proto_mtl",
    effects: [
      { trigger: "immediate", type: "draw", description: "Draw 2 cards.", payload: { amount: 2 } },
      { trigger: "immediate", type: "deny_compile", description: "Your opponent cannot compile next turn.", payload: {} },
    ] },
  { id: "mtl_2", name: "Metal", value: 2, protocolId: "proto_mtl",
    effects: [{ trigger: "passive", type: "deny_facedown", description: "Your opponent cannot play cards face-down in this line.", payload: {} }] },
  { id: "mtl_3", name: "Metal", value: 3, protocolId: "proto_mtl",
    effects: [
      { trigger: "immediate", type: "draw", description: "Draw 1 card.", payload: { amount: 1 } },
      { trigger: "immediate", type: "delete", description: "Delete all cards in 1 other line with 8 or more cards.", payload: { targets: "line_8plus_cards" } },
    ] },
  { id: "mtl_5", name: "Metal", value: 5, protocolId: "proto_mtl",
    effects: [{ trigger: "immediate", type: "discard", description: "You discard 1 card.", payload: { amount: 1, who: "self" } }] },
  { id: "mtl_6", name: "Metal", value: 6, protocolId: "proto_mtl",
    effects: [{ trigger: "passive", type: "on_covered_or_flip_delete_self", description: "When this card would be covered or flipped: First, delete this card.", payload: {} }] },
  // ── PLAGUE (proto_plg) ─────────────────────────────────────────────────────────────
  { id: "plg_0", name: "Plague", value: 0, protocolId: "proto_plg",
    effects: [
      { trigger: "immediate", type: "opponent_discard", description: "Your opponent discards 1 card.", payload: { amount: 1 } },
      { trigger: "passive", type: "deny_play_in_line", description: "Your opponent cannot play cards in this line.", payload: {} },
    ] },
  { id: "plg_1", name: "Plague", value: 1, protocolId: "proto_plg",
    effects: [
      { trigger: "immediate", type: "opponent_discard", description: "Your opponent discards 1 card.", payload: { amount: 1 } },
      { trigger: "passive", type: "after_opp_discard_draw", description: "After your opponent discards cards: Draw 1 card.", payload: { amount: 1 } },
    ] },
  { id: "plg_2", name: "Plague", value: 2, protocolId: "proto_plg",
    effects: [{ trigger: "immediate", type: "discard_to_opp_discard_more", description: "Discard 1 or more cards. Your opponent discards the amount discarded plus 1.", payload: {} }] },
  { id: "plg_3", name: "Plague", value: 3, protocolId: "proto_plg",
    effects: [{ trigger: "immediate", type: "flip", description: "Flip each other face-up card.", payload: { targets: "all_other_faceup" } }] },
  { id: "plg_4", name: "Plague", value: 4, protocolId: "proto_plg",
    effects: [{ trigger: "end", type: "opp_delete_facedown_flip_self", description: "Your opponent deletes 1 of their face-down cards. You may flip this card.", payload: {} }] },
  { id: "plg_5", name: "Plague", value: 5, protocolId: "proto_plg",
    effects: [{ trigger: "immediate", type: "discard", description: "You discard 1 card.", payload: { amount: 1, who: "self" } }] },
  // ── PSYCHIC (proto_psy) ───────────────────────────────────────────────────────────
  { id: "psy_0", name: "Psychic", value: 0, protocolId: "proto_psy",
    effects: [
      { trigger: "immediate", type: "draw", description: "Draw 2 cards.", payload: { amount: 2 } },
      { trigger: "immediate", type: "opponent_discard_reveal", description: "Your opponent discards 2 cards, then reveals their hand.", payload: { amount: 2 } },
    ] },
  { id: "psy_1", name: "Psychic", value: 1, protocolId: "proto_psy",
    effects: [
      { trigger: "passive", type: "deny_faceup", description: "Your opponent can only play cards face-down.", payload: {} },
      { trigger: "start", type: "flip_self", description: "Flip this card.", payload: { targets: "self" } },
    ] },
  { id: "psy_2", name: "Psychic", value: 2, protocolId: "proto_psy",
    effects: [
      { trigger: "immediate", type: "opponent_discard", description: "Your opponent discards 2 cards.", payload: { amount: 2 } },
      { trigger: "immediate", type: "rearrange_protocols", description: "Rearrange their protocols.", payload: { whose: "opponent" } },
    ] },
  { id: "psy_3", name: "Psychic", value: 3, protocolId: "proto_psy",
    effects: [
      { trigger: "immediate", type: "opponent_discard", description: "Your opponent discards 1 card.", payload: { amount: 1 } },
      { trigger: "immediate", type: "shift", description: "Shift 1 of their cards.", payload: { targets: "opponent_any" } },
    ] },
  { id: "psy_4", name: "Psychic", value: 4, protocolId: "proto_psy",
    effects: [{ trigger: "end", type: "return_opp_flip_self", description: "You may return 1 of your opponent's cards. If you do, flip this card.", payload: {} }] },
  { id: "psy_5", name: "Psychic", value: 5, protocolId: "proto_psy",
    effects: [{ trigger: "immediate", type: "discard", description: "You discard 1 card.", payload: { amount: 1, who: "self" } }] },
  // ── SPEED (proto_spd) ─────────────────────────────────────────────────────────────
  { id: "spd_0", name: "Speed", value: 0, protocolId: "proto_spd",
    effects: [{ trigger: "immediate", type: "play_card", description: "Play 1 card.", payload: {} }] },
  { id: "spd_1", name: "Speed", value: 1, protocolId: "proto_spd",
    effects: [
      { trigger: "immediate", type: "draw", description: "Draw 2 cards.", payload: { amount: 2 } },
      { trigger: "passive", type: "after_clear_cache_draw", description: "After you clear cache: Draw 1 card.", payload: { amount: 1 } },
    ] },
  { id: "spd_2", name: "Speed", value: 2, protocolId: "proto_spd",
    effects: [{ trigger: "passive", type: "on_compile_delete_shift_self", description: "When deleted by compiling: Shift this card, even if covered.", payload: {} }] },
  { id: "spd_3", name: "Speed", value: 3, protocolId: "proto_spd",
    effects: [
      { trigger: "immediate", type: "shift", description: "Shift 1 of your other cards.", payload: { targets: "own_others" } },
      { trigger: "end", type: "shift_flip_self", description: "You may shift 1 of your cards. If you do, flip this card.", payload: {} },
    ] },
  { id: "spd_4", name: "Speed", value: 4, protocolId: "proto_spd",
    effects: [{ trigger: "immediate", type: "shift", description: "Shift 1 of your opponent's face-down cards.", payload: { targets: "opponent_facedown" } }] },
  { id: "spd_5", name: "Speed", value: 5, protocolId: "proto_spd",
    effects: [{ trigger: "immediate", type: "discard", description: "You discard 1 card.", payload: { amount: 1, who: "self" } }] },
  // ── SPIRIT (proto_spr) ────────────────────────────────────────────────────────────
  { id: "spr_0", name: "Spirit", value: 0, protocolId: "proto_spr",
    effects: [
      { trigger: "immediate", type: "refresh", description: "Refresh.", payload: {} },
      { trigger: "immediate", type: "draw", description: "Draw 1 card.", payload: { amount: 1 } },
      { trigger: "immediate", type: "skip_check_cache", description: "Skip your check cache phase.", payload: {} },
    ] },
  { id: "spr_1", name: "Spirit", value: 1, protocolId: "proto_spr",
    effects: [
      { trigger: "immediate", type: "play_any_line", description: "You can play cards in any line. Draw 2 cards.", payload: { draw: 2 } },
      { trigger: "start", type: "discard_or_flip_self", description: "Either discard 1 card or flip this card.", payload: {} },
    ] },
  { id: "spr_2", name: "Spirit", value: 2, protocolId: "proto_spr",
    effects: [{ trigger: "immediate", type: "flip", description: "You may flip 1 card.", payload: { targets: "any_card", optional: true } }] },
  { id: "spr_3", name: "Spirit", value: 3, protocolId: "proto_spr",
    effects: [{ trigger: "passive", type: "after_draw_shift_self", description: "After you draw cards: You may shift this card, even if covered.", payload: {} }] },
  { id: "spr_4", name: "Spirit", value: 4, protocolId: "proto_spr",
    effects: [{ trigger: "immediate", type: "swap_protocols", description: "Swap the positions of 2 of your protocols.", payload: {} }] },
  { id: "spr_5", name: "Spirit", value: 5, protocolId: "proto_spr",
    effects: [{ trigger: "immediate", type: "discard", description: "You discard 1 card.", payload: { amount: 1, who: "self" } }] },
  // ── WATER (proto_wtr) ─────────────────────────────────────────────────────────────
  { id: "wtr_0", name: "Water", value: 0, protocolId: "proto_wtr",
    effects: [
      { trigger: "immediate", type: "flip", description: "Flip 1 other card.", payload: { targets: "any_other" } },
      { trigger: "immediate", type: "flip_self", description: "Flip this card.", payload: { targets: "self" } },
    ] },
  { id: "wtr_1", name: "Water", value: 1, protocolId: "proto_wtr",
    effects: [{ trigger: "immediate", type: "deck_to_other_lines", description: "Play the top card of your deck face-down in each other line.", payload: {} }] },
  { id: "wtr_2", name: "Water", value: 2, protocolId: "proto_wtr",
    effects: [
      { trigger: "immediate", type: "draw", description: "Draw 2 cards.", payload: { amount: 2 } },
      { trigger: "immediate", type: "rearrange_protocols", description: "Rearrange your protocols.", payload: { whose: "self" } },
    ] },
  { id: "wtr_3", name: "Water", value: 3, protocolId: "proto_wtr",
    effects: [{ trigger: "immediate", type: "return", description: "Return all cards with a value of 2 in 1 line.", payload: { targets: "line_value_2" } }] },
  { id: "wtr_4", name: "Water", value: 4, protocolId: "proto_wtr",
    effects: [{ trigger: "immediate", type: "return", description: "Return 1 of your cards.", payload: { targets: "own_any" } }] },
  { id: "wtr_5", name: "Water", value: 5, protocolId: "proto_wtr",
    effects: [{ trigger: "immediate", type: "discard", description: "You discard 1 card.", payload: { amount: 1, who: "self" } }] },
];

export const PROTOCOL_MAP = new Map(PROTOCOLS.map((p) => [p.id, p]));
export const CARD_MAP     = new Map(COMMAND_CARDS.map((c) => [c.id, c]));

/** Returns the 6 command cards that belong to the given protocol */
export function getCardsForProtocol(protocolId: string): CommandCardDef[] {
  return COMMAND_CARDS.filter((c) => c.protocolId === protocolId);
}
