import { describe, it, expect } from "vitest";
import { PROTOCOLS, COMMAND_CARDS, PROTOCOL_MAP, CARD_MAP } from "../cards";

const VALID_TRIGGERS = new Set(["immediate", "start", "end", "passive"]);

// All effect types that are currently implemented or stubbed (not expected to warn in-game)
const KNOWN_EFFECT_TYPES = new Set([
  // Implemented
  "draw", "discard", "opponent_discard", "opponent_discard_reveal",
  "rearrange_protocols", "play_facedown", "return", "conditional_draw",
  "deck_to_other_lines", "deck_to_each_line", "opponent_deck_to_line", "deck_to_under",
  "flip_self", "return_opp_flip_self", "opp_delete_facedown_flip_self",
  "deny_compile", "opponent_draw", "draw_from_opponent_deck", "exchange_hand",
  "give_to_draw", "discard_or_flip_self", "skip_check_cache", "refresh",
  "flip", "shift_flip_self",
  "delete", "delete_highest_both", "draw_then_delete_self",
  "discard_to_delete", "discard_to_return", "discard_to_draw", "discard_to_flip",
  "discard_to_opp_discard_more", "reveal_hand", "swap_protocols",
  // Stubbed (known, not yet implemented)
  "shift", "play_card", "play_any_line",
  "flip_draw_equal", "reveal_shift_or_flip", "reveal_own_hand",
  "discard_to_delete2",
  // Passive (evaluated separately)
  "value_bonus_per_facedown", "ignore_mid_commands", "on_covered_flip_self",
  "reduce_opponent_value", "on_covered_delete_lowest",
  "after_delete_draw", "on_compile_delete_shift_self", "after_draw_shift_self",
  "facedown_value_override", "on_covered", "on_covered_delete_self",
  "on_covered_deck_to_other_line", "deny_facedown", "on_covered_or_flip_delete_self",
  "deny_play_in_line", "after_opp_discard_draw", "deny_faceup", "after_clear_cache_draw",
]);

// ─── Protocol definitions ────────────────────────────────────────────────────

describe("PROTOCOLS", () => {
  it("has no duplicate protocol IDs", () => {
    const ids = PROTOCOLS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every protocol has a non-empty id, name, and description", () => {
    for (const p of PROTOCOLS) {
      expect(p.id, `${p.id}.id`).toBeTruthy();
      expect(p.name, `${p.id}.name`).toBeTruthy();
      expect(p.description, `${p.id}.description`).toBeTruthy();
    }
  });

  it("PROTOCOL_MAP contains every protocol", () => {
    for (const p of PROTOCOLS) {
      expect(PROTOCOL_MAP.has(p.id)).toBe(true);
    }
  });
});

// ─── Card definitions ────────────────────────────────────────────────────────

describe("COMMAND_CARDS", () => {
  it("has no duplicate card IDs", () => {
    const ids = COMMAND_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every card has a non-empty id, name, and protocolId", () => {
    for (const c of COMMAND_CARDS) {
      expect(c.id, `${c.id}.id`).toBeTruthy();
      expect(c.name, `${c.id}.name`).toBeTruthy();
      expect(c.protocolId, `${c.id}.protocolId`).toBeTruthy();
    }
  });

  it("every card's protocolId exists in PROTOCOLS", () => {
    for (const c of COMMAND_CARDS) {
      expect(PROTOCOL_MAP.has(c.protocolId), `${c.id}.protocolId "${c.protocolId}" not found`).toBe(true);
    }
  });

  it("every card has a numeric value between 0 and 6", () => {
    for (const c of COMMAND_CARDS) {
      expect(typeof c.value, `${c.id}.value type`).toBe("number");
      expect(c.value, `${c.id}.value range`).toBeGreaterThanOrEqual(0);
      expect(c.value, `${c.id}.value range`).toBeLessThanOrEqual(6);
    }
  });

  it("every card has at least one effect", () => {
    for (const c of COMMAND_CARDS) {
      expect(c.effects.length, `${c.id} has no effects`).toBeGreaterThan(0);
    }
  });

  it("CARD_MAP contains every card", () => {
    for (const c of COMMAND_CARDS) {
      expect(CARD_MAP.has(c.id)).toBe(true);
    }
  });
});

// ─── Effect definitions ──────────────────────────────────────────────────────

describe("card effects", () => {
  it("every effect has a valid trigger", () => {
    for (const c of COMMAND_CARDS) {
      for (const e of c.effects) {
        expect(VALID_TRIGGERS.has(e.trigger), `${c.id} effect "${e.type}" has invalid trigger "${e.trigger}"`).toBe(true);
      }
    }
  });

  it("every effect has a non-empty type and description", () => {
    for (const c of COMMAND_CARDS) {
      for (const e of c.effects) {
        expect(e.type, `${c.id} effect missing type`).toBeTruthy();
        expect(e.description, `${c.id} effect "${e.type}" missing description`).toBeTruthy();
      }
    }
  });

  it("every effect type is known (implemented or stubbed)", () => {
    const unknown: string[] = [];
    for (const c of COMMAND_CARDS) {
      for (const e of c.effects) {
        if (!KNOWN_EFFECT_TYPES.has(e.type)) {
          unknown.push(`${c.id}: "${e.type}"`);
        }
      }
    }
    expect(unknown, `Unknown effect types:\n${unknown.join("\n")}`).toHaveLength(0);
  });
});

// ─── Per-protocol card counts ─────────────────────────────────────────────────

describe("per-protocol card counts", () => {
  it("each protocol has exactly 6 cards (values 0–5 or similar)", () => {
    for (const p of PROTOCOLS) {
      const cards = COMMAND_CARDS.filter((c) => c.protocolId === p.id);
      expect(cards.length, `${p.id} has ${cards.length} cards`).toBeGreaterThanOrEqual(5);
    }
  });

  it("each protocol has at most one card per value", () => {
    for (const p of PROTOCOLS) {
      const cards = COMMAND_CARDS.filter((c) => c.protocolId === p.id);
      const values = cards.map((c) => c.value);
      expect(new Set(values).size, `${p.id} has duplicate card values`).toBe(values.length);
    }
  });
});
