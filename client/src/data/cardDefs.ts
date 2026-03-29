import {
  GENERATED_MAIN_UNIT_2_CARD_DEFS,
  GENERATED_MAIN_UNIT_2_PROTOCOL_ACCENT_COLORS,
  GENERATED_MAIN_UNIT_2_PROTOCOL_COLORS,
  GENERATED_MAIN_UNIT_2_PROTOCOL_NAMES,
} from "./mainUnit2Generated";

/**
 * Client-side card definitions mirror.
 * Keeps Phaser client independent of the server source tree.
 * Update both this file and server/src/data/cards.ts when changing card data.
 *
 * Three display sections on a face-up card:
 *  top  — START and/or passive text (visible even when card is covered)
 *  mid  — IMMEDIATE text
 *  bot  — END text
 */

export interface ClientCardDef {
  name: string;
  value: number;
  top?: string;      // START and/or passive text
  topTag?: string;   // Defaults to START
  mid?: string;      // IMMEDIATE text
  midTag?: string;   // Defaults to IMMEDIATE
  bot?: string;      // END text
  botTag?: string;   // Defaults to END
}

const defs: Array<{ id: string } & ClientCardDef> = [
  // ── APATHY ──────────────────────────────────────────────────────────────────
  { id: "apy_0", name: "Apathy", value: 0, top: "Your total value in this line is increased by 1 for each face-down card in this line.", topTag: "PASSIVE" },
  { id: "apy_1", name: "Apathy", value: 1, mid: "Flip all other face-up cards in this line." },
  { id: "apy_2", name: "Apathy", value: 2, top: "Ignore all middle commands of cards in this line.", 
                                           bot:"When this card would be covered: First, flip this card.", topTag: "PASSIVE" },
  { id: "apy_3", name: "Apathy", value: 3, mid: "Flip 1 of your opponent's face-up cards." },
  { id: "apy_4", name: "Apathy", value: 4, mid: "You may flip 1 of your face-up covered cards." },
  { id: "apy_5", name: "Apathy", value: 5, mid: "You discard 1 card." },
  // ── DARKNESS ───────────────────────────────────────────────────────────────
  { id: "drk_0", name: "Darkness", value: 0, mid: "Draw 3 cards. Shift 1 of your opponent's covered cards." },
  { id: "drk_1", name: "Darkness", value: 1, mid: "Flip 1 of your opponent's cards. You may shift that card." },
  { id: "drk_2", name: "Darkness", value: 2, top: "All face-down cards in this stack have a value of 4.", topTag: "PASSIVE", mid: "You may flip 1 covered card in this line." },
  { id: "drk_3", name: "Darkness", value: 3, mid: "Play 1 card face-down in another line." },
  { id: "drk_4", name: "Darkness", value: 4, mid: "Shift 1 face-down card." },
  { id: "drk_5", name: "Darkness", value: 5, mid: "You discard 1 card." },
  // ── DEATH ───────────────────────────────────────────────────────────────────
  { id: "dth_0", name: "Death", value: 0, mid: "Delete 1 card from each other line." },
  { id: "dth_1", name: "Death", value: 1, top: "Start: You may draw 1 card. If you do, delete 1 other card, then delete this card." },
  { id: "dth_2", name: "Death", value: 2, mid: "Delete all cards in 1 line with values of 1 or 2." },
  { id: "dth_3", name: "Death", value: 3, mid: "Delete 1 face-down card." },
  { id: "dth_4", name: "Death", value: 4, mid: "Delete a card with a value of 0 or 1." },
  { id: "dth_5", name: "Death", value: 5, mid: "You discard 1 card." },
  // ── FIRE ────────────────────────────────────────────────────────────────────
  { id: "fir_0", name: "Fire",    value: 0, mid: "Flip 1 other card. Draw 2 cards.", 
                                            bot: "When covered: first, draw 1 card and flip 1 other card." },
  { id: "fir_1", name: "Fire",    value: 1, mid: "Discard 1 card. If you do, delete 1 card." },
  { id: "fir_2", name: "Fire",    value: 2, mid: "Discard 1 card. If you do, return 1 card." },
  { id: "fir_3", name: "Fire",    value: 3, bot: "End: You may discard 1 card. If you do, flip 1 card." },
  { id: "fir_4", name: "Fire",    value: 4, mid: "Discard 1 or more cards. Draw the amount discarded plus 1." },
  { id: "fir_5", name: "Fire",    value: 5, mid: "You discard 1 card." },
  // ── GRAVITY (values 0,1,2,4,5,6) ─────────────────────────────────────────────────
  { id: "grv_0", name: "Gravity", value: 0, mid: "For every 2 cards in this line, play the top card of your deck face-down under this card." },
  { id: "grv_1", name: "Gravity", value: 1, mid: "Draw 2 cards. Shift 1 card either to or from this line." },
  { id: "grv_2", name: "Gravity", value: 2, mid: "Flip 1 card. Shift that card to this line." },
  { id: "grv_4", name: "Gravity", value: 4, mid: "Shift 1 face-down card to this line." },
  { id: "grv_5", name: "Gravity", value: 5, mid: "You discard 1 card." },
  { id: "grv_6", name: "Gravity", value: 6, mid: "Your opponent plays the top card of their deck face-down in this line." },
  // ── HATE ───────────────────────────────────────────────────────────────────
  { id: "hat_0", name: "Hate",    value: 0, mid: "Delete 1 card." },
  { id: "hat_1", name: "Hate",    value: 1, mid: "Discard 3 cards. Delete 1 card. Delete 1 card." },
  { id: "hat_2", name: "Hate",    value: 2, mid: "Delete your highest value card. Delete your opponent's highest value card." },
  { id: "hat_3", name: "Hate",    value: 3, top: "After you delete cards: Draw 1 card.", topTag: "PASSIVE" },
  { id: "hat_4", name: "Hate",    value: 4, bot: "When covered: first, delete the lowest value covered card in this line." },
  { id: "hat_5", name: "Hate",    value: 5, mid: "You discard 1 card." },
  // ── LIFE ───────────────────────────────────────────────────────────────────
  { id: "lif_0", name: "Life",    value: 0, top: "End: If this is covered, delete this card.", topTag: "PASSIVE", mid: "Play the top card of your deck face-down in each line where you have a card." },
  { id: "lif_1", name: "Life",    value: 1, mid: "Flip 1 card. Flip 1 card." },
  { id: "lif_2", name: "Life",    value: 2, mid: "Draw 1 card. You may flip 1 face-down card." },
  { id: "lif_3", name: "Life",    value: 3, bot: "When covered: first, play the top card of your deck face-down in another line." },
  { id: "lif_4", name: "Life",    value: 4, mid: "If this card is covering a card, draw 1 card." },
  { id: "lif_5", name: "Life",    value: 5, mid: "You discard 1 card." },
  // ── LIGHT ──────────────────────────────────────────────────────────────────
  { id: "lgt_0", name: "Light",   value: 0, mid: "Flip 1 card. Draw cards equal to that card's value." },
  { id: "lgt_1", name: "Light",   value: 1, bot: "End: Draw 1 card." },
  { id: "lgt_2", name: "Light",   value: 2, mid: "Draw 2 cards. Reveal 1 face-down card. You may shift or flip that card." },
  { id: "lgt_3", name: "Light",   value: 3, mid: "Shift all face-down cards in this line (both players) to another line." },
  { id: "lgt_4", name: "Light",   value: 4, mid: "Your opponent reveals their hand." },
  { id: "lgt_5", name: "Light",   value: 5, mid: "You discard 1 card." },
  // ── LOVE (values 1–6) ────────────────────────────────────────────────────────────
  { id: "lov_1", name: "Love",    value: 1, mid: "Draw the top card of your opponent's deck.", bot: "End: You may give 1 card from your hand to your opponent. If you do, draw 2 cards." },
  { id: "lov_2", name: "Love",    value: 2, mid: "Your opponent draws 1 card. Refresh." },
  { id: "lov_3", name: "Love",    value: 3, mid: "Take 1 random card from your opponent's hand. Give 1 card from your hand to your opponent." },
  { id: "lov_4", name: "Love",    value: 4, mid: "Reveal 1 card from your hand. Flip 1 card." },
  { id: "lov_5", name: "Love",    value: 5, mid: "You discard 1 card." },
  { id: "lov_6", name: "Love",    value: 6, mid: "Your opponent draws 2 cards." },
  // ── METAL (values 0,1,2,3,5,6) ───────────────────────────────────────────────────────
  { id: "mtl_0", name: "Metal",   value: 0, top: "Your opponent's total value in this line is reduced by 2.", topTag: "PASSIVE", mid: "Flip 1 card." },
  { id: "mtl_1", name: "Metal",   value: 1, mid: "Draw 2 cards. Your opponent cannot compile next turn." },
  { id: "mtl_2", name: "Metal",   value: 2, top: "Your opponent cannot play cards face-down in this line.", topTag: "PASSIVE" },
  { id: "mtl_3", name: "Metal",   value: 3, mid: "Draw 1 card. Delete all cards in 1 other line with 8 or more cards." },
  { id: "mtl_5", name: "Metal",   value: 5, mid: "You discard 1 card." },
  { id: "mtl_6", name: "Metal",   value: 6, top: "When this card would be covered or flipped: First, delete this card.", topTag: "PASSIVE" },
  // ── PLAGUE ─────────────────────────────────────────────────────────────────
  { id: "plg_0", name: "Plague",  value: 0, mid: "Your opponent discards 1 card.", 
                                            bot: "Your opponent cannot play cards in this line." },
  { id: "plg_1", name: "Plague",  value: 1, top: "After your opponent discards cards: Draw 1 card.", topTag: "PASSIVE", mid: "Your opponent discards 1 card." },
  { id: "plg_2", name: "Plague",  value: 2, mid: "Discard 1 or more cards. Your opponent discards the amount discarded plus 1." },
  { id: "plg_3", name: "Plague",  value: 3, mid: "Flip each other face-up card." },
  { id: "plg_4", name: "Plague",  value: 4, bot: "End: Your opponent deletes 1 of their face-down cards. You may flip this card." },
  { id: "plg_5", name: "Plague",  value: 5, mid: "You discard 1 card." },
  // ── PSYCHIC ────────────────────────────────────────────────────────────────
  { id: "psy_0", name: "Psychic", value: 0, mid: "Draw 2 cards. Your opponent discards 2 cards, then reveals their hand." },
  { id: "psy_1", name: "Psychic", value: 1, top: "Your opponent can only play cards face-down. Flip this card.", topTag: "START / PASSIVE" },
  { id: "psy_2", name: "Psychic", value: 2, mid: "Your opponent discards 2 cards. Rearrange their protocols." },
  { id: "psy_3", name: "Psychic", value: 3, mid: "Your opponent discards 1 card." },
  { id: "psy_4", name: "Psychic", value: 4, bot: "End: You may return 1 of your opponent's cards. If you do, flip this card." },
  { id: "psy_5", name: "Psychic", value: 5, mid: "You discard 1 card." },
  // ── SPEED ──────────────────────────────────────────────────────────────────
  { id: "spd_0", name: "Speed",   value: 0, mid: "Play 1 card." },
  { id: "spd_1", name: "Speed",   value: 1, top: "After you clear cache: Draw 1 card.", topTag: "PASSIVE", mid: "Draw 2 cards." },
  { id: "spd_2", name: "Speed",   value: 2, top: "When deleted by compiling: Shift this card, even if covered.", topTag: "PASSIVE" },
  { id: "spd_3", name: "Speed",   value: 3, mid: "Shift 1 of your other cards.", bot: "End: You may shift 1 of your cards. If you do, flip this card." },
  { id: "spd_4", name: "Speed",   value: 4, mid: "Shift 1 of your opponent's face-down cards." },
  { id: "spd_5", name: "Speed",   value: 5, mid: "You discard 1 card." },
  // ── SPIRIT ─────────────────────────────────────────────────────────────────
  { id: "spr_0", name: "Spirit",  value: 0, mid: "Refresh. Draw 1 card.", bot: "Skip your check cache phase." },
  { id: "spr_1", name: "Spirit",  value: 1, top: "You can play cards in any line.",
                                            mid: "Start: Draw 2 cards.",
                                            bot: "Either discard 1 card or flip this card." },
  { id: "spr_2", name: "Spirit",  value: 2, mid: "You may flip 1 card." },
  { id: "spr_3", name: "Spirit",  value: 3, top: "After you draw cards: You may shift this card, even if covered.", topTag: "PASSIVE" },
  { id: "spr_4", name: "Spirit",  value: 4, mid: "Swap the positions of 2 of your protocols." },
  { id: "spr_5", name: "Spirit",  value: 5, mid: "You discard 1 card." },
  // ── WATER ──────────────────────────────────────────────────────────────────
  { id: "wtr_0", name: "Water",   value: 0, mid: "Flip 1 other card. Flip this card." },
  { id: "wtr_1", name: "Water",   value: 1, mid: "Play the top card of your deck face-down in each other line." },
  { id: "wtr_2", name: "Water",   value: 2, mid: "Draw 2 cards. Rearrange your protocols." },
  { id: "wtr_3", name: "Water",   value: 3, mid: "Return all cards with a value of 2 in 1 line." },
  { id: "wtr_4", name: "Water",   value: 4, mid: "Return 1 of your cards." },
  { id: "wtr_5", name: "Water",   value: 5, mid: "You discard 1 card." },
  ...GENERATED_MAIN_UNIT_2_CARD_DEFS,
];

export const CARD_DEFS_CLIENT = new Map<string, ClientCardDef>(
  defs.map(({ id, ...rest }) => [id, rest])
);

/** Hex fill colour for the name bar of each protocol's cards. */
export const PROTOCOL_COLORS = new Map<string, number>([
  ["proto_apy", 0x704661],
  ["proto_drk", 0x1f2140],
  ["proto_dth", 0x52090b],
  ["proto_fir", 0x6c1800],
  ["proto_grv", 0x402b21],
  ["proto_hat", 0x5c0026],
  ["proto_lif", 0x0c4c1b],
  ["proto_lgt", 0x134008],
  ["proto_lov", 0x400a23],
  ["proto_mtl", 0x003140],
  ["proto_plg", 0x5e4812],
  ["proto_psy", 0x2b0b4f],
  ["proto_spd", 0x403206],
  ["proto_spr", 0x290056],
  ["proto_wtr", 0x0d44a1],
  ...GENERATED_MAIN_UNIT_2_PROTOCOL_COLORS,
]);

/**
 * Bright accent colours for the card name bar — vivid and thematically distinct.
 * Each accent is designed to pop against the dark body (PROTOCOL_COLORS),
 * giving every protocol a unique visual identity regardless of hue proximity.
 */
export const PROTOCOL_ACCENT_COLORS = new Map<string, number>([
  ["proto_apy", 0x768c93],
  ["proto_drk", 0x451eca],
  ["proto_dth", 0xe3d8b6],
  ["proto_fir", 0xff6501],
  ["proto_grv", 0x9c8724],
  ["proto_hat", 0xff0042],
  ["proto_lif", 0x0ee458],
  ["proto_lgt", 0xffee09],
  ["proto_lov", 0xfe8fb8],
  ["proto_mtl", 0x083859],
  ["proto_plg", 0x97e308],
  ["proto_psy", 0x001d71],
  ["proto_spd", 0x00ffc3],
  ["proto_spr", 0xe79dfc],
  ["proto_wtr", 0x317cff],
  ...GENERATED_MAIN_UNIT_2_PROTOCOL_ACCENT_COLORS,
]);

/** Returns the protocol hex colour for a card def id like "spd_3". */
export function protocolColorFromDefId(defId: string): number {
  const prefix = defId.split("_")[0];
  return PROTOCOL_COLORS.get(`proto_${prefix}`) ?? 0x1a3a5c;
}

/** Returns the bright accent colour for the name bar for a card def id like "spd_3". */
export function protocolAccentFromDefId(defId: string): number {
  const prefix = defId.split("_")[0];
  return PROTOCOL_ACCENT_COLORS.get(`proto_${prefix}`) ?? 0x4488cc;
}

export const PROTOCOL_NAMES_CLIENT = new Map<string, string>([
  ["proto_apy", "Apathy"],
  ["proto_drk", "Darkness"],
  ["proto_dth", "Death"],
  ["proto_fir", "Fire"],
  ["proto_grv", "Gravity"],
  ["proto_hat", "Hate"],
  ["proto_lif", "Life"],
  ["proto_lgt", "Light"],
  ["proto_lov", "Love"],
  ["proto_mtl", "Metal"],
  ["proto_plg", "Plague"],
  ["proto_psy", "Psychic"],
  ["proto_spd", "Speed"],
  ["proto_spr", "Spirit"],
  ["proto_wtr", "Water"],
  ...GENERATED_MAIN_UNIT_2_PROTOCOL_NAMES,
]);
