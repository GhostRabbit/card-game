import { describe, it, expect, beforeEach } from "vitest";
import { CardFace, CardInstance, PendingEffect, ProtocolStatus } from "@compile/shared";
import { executeEffect, enqueueEffectsFromCard, enqueueEffectsOnFlipFaceUp, enqueueEffectsOnUncover } from "../CardEffects";
import { createServerGameState, ServerGameState, lineValue, playCard, processAutoPhases, chooseCompile, refresh, resolveControlReorder } from "../GameEngine";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makePlayer(id: string) {
  return {
    id,
    username: id,
    protocols: [] as Array<{ protocolId: string; status: ProtocolStatus; lineIndex: number }>,
    hand: [] as CardInstance[],
    deckSize: 0,
    trashSize: 0,
    lines: [
      { cards: [] as CardInstance[] },
      { cards: [] as CardInstance[] },
      { cards: [] as CardInstance[] },
    ] as [{ cards: CardInstance[] }, { cards: CardInstance[] }, { cards: CardInstance[] }],
    hasControl: false,
  };
}

function makeState(): ServerGameState {
  return createServerGameState(
    [makePlayer("p0") as any, makePlayer("p1") as any],
    [[], []]
  );
}

function card(id: string, face = CardFace.FaceUp): CardInstance {
  return { instanceId: id, defId: "dummy", face };
}

function effect(
  type: string,
  ownerIndex: 0 | 1 = 0,
  payload: Record<string, unknown> = {},
  sourceInstanceId?: string
): PendingEffect {
  return {
    id: "eid",
    cardDefId: "dummy",
    cardName: "Dummy",
    type,
    description: "",
    ownerIndex,
    trigger: "immediate",
    payload,
    sourceInstanceId,
  };
}

// ─── executeEffect: draw ──────────────────────────────────────────────────────

describe("executeEffect — draw", () => {
  it("draws the specified number of cards from deck to hand", () => {
    const state = makeState();
    state.decks[0].push(card("d1"), card("d2"), card("d3"));
    state.players[0].deckSize = 3;

    executeEffect(state, effect("draw", 0, { amount: 2 }));

    expect(state.players[0].hand).toHaveLength(2);
    expect(state.decks[0]).toHaveLength(1);
    expect(state.players[0].deckSize).toBe(1);
  });

  it("drawn cards are always face-up", () => {
    const state = makeState();
    const c = card("d1", CardFace.FaceDown);
    state.decks[0].push(c);

    executeEffect(state, effect("draw", 0, { amount: 1 }));

    expect(state.players[0].hand[0].face).toBe(CardFace.FaceUp);
  });

  it("reshuffles trash into deck when deck is empty before drawing", () => {
    const state = makeState();
    state.trashes[0].push(card("t1"), card("t2"));
    state.players[0].trashSize = 2;
    // deck is empty — draw should reshuffle trash first

    executeEffect(state, effect("draw", 0, { amount: 1 }));

    expect(state.players[0].hand).toHaveLength(1);
    // trash was consumed into deck; what's left depends on shuffle, but sizes must add up
    expect(state.players[0].hand.length + state.decks[0].length).toBe(2);
    expect(state.players[0].trashSize).toBe(0);
  });

  it("draws for the correct player (ownerIndex)", () => {
    const state = makeState();
    state.decks[1].push(card("d1"));
    state.players[1].deckSize = 1;

    executeEffect(state, effect("draw", 1, { amount: 1 }));

    expect(state.players[1].hand).toHaveLength(1);
    expect(state.players[0].hand).toHaveLength(0);
  });

  it("uses amount 1 when payload.amount is missing", () => {
    const state = makeState();
    state.decks[0].push(card("d1"), card("d2"));

    executeEffect(state, effect("draw", 0, {}));

    expect(state.players[0].hand).toHaveLength(1);
  });
});

// ─── executeEffect: discard ───────────────────────────────────────────────────

describe("executeEffect — discard", () => {
  it("moves the targeted card from hand to trash by instanceId", () => {
    const state = makeState();
    const target = card("c1");
    const other = card("c2");
    state.players[0].hand.push(target, other);

    executeEffect(state, effect("discard", 0, { targetInstanceId: "c1" }));

    expect(state.players[0].hand).toHaveLength(1);
    expect(state.players[0].hand[0].instanceId).toBe("c2");
    expect(state.trashes[0]).toHaveLength(1);
    expect(state.trashes[0][0].instanceId).toBe("c1");
    expect(state.players[0].trashSize).toBe(1);
  });

  it("discarded card is set face-up", () => {
    const state = makeState();
    const target = card("c1", CardFace.FaceDown);
    state.players[0].hand.push(target);

    executeEffect(state, effect("discard", 0, { targetInstanceId: "c1" }));

    expect(state.trashes[0][0].face).toBe(CardFace.FaceUp);
  });

  it("logs and skips when no targetInstanceId is provided", () => {
    const state = makeState();
    state.players[0].hand.push(card("c1"));

    executeEffect(state, effect("discard", 0, {}));

    expect(state.players[0].hand).toHaveLength(1);
    expect(state.trashes[0]).toHaveLength(0);
    expect(state.pendingLogs.some((l) => l.includes("no target"))).toBe(true);
  });

  it("logs and skips when instanceId is not in hand", () => {
    const state = makeState();
    state.players[0].hand.push(card("c1"));

    executeEffect(state, effect("discard", 0, { targetInstanceId: "not-here" }));

    expect(state.players[0].hand).toHaveLength(1);
    expect(state.pendingLogs.some((l) => l.includes("not found"))).toBe(true);
  });
});

// ─── executeEffect: opponent_discard ─────────────────────────────────────────

describe("executeEffect — opponent_discard", () => {
  it("queues discard sub-effects for the opponent to choose", () => {
    const state = makeState();
    state.players[1].hand.push(card("c1"), card("c2"), card("c3"));

    executeEffect(state, effect("opponent_discard", 0, { amount: 2 }));

    const discardEffects = state.effectQueue.filter(e => e.type === "discard" && e.ownerIndex === 1);
    expect(discardEffects).toHaveLength(2);
    // Cards are not removed yet — opponent must choose
    expect(state.players[1].hand).toHaveLength(3);
  });

  it("does not touch the owner's hand", () => {
    const state = makeState();
    state.players[0].hand.push(card("c1"));
    state.players[1].hand.push(card("c2"));

    executeEffect(state, effect("opponent_discard", 0, { amount: 1 }));

    expect(state.players[0].hand).toHaveLength(1);
  });
});

// ─── executeEffect: unknown / stub types ─────────────────────────────────────

describe("executeEffect — unhandled effect types", () => {
  it("logs 'unhandled effect type' for completely unknown types", () => {
    const state = makeState();

    executeEffect(state, effect("totally_unknown_xyz", 0));

    expect(state.pendingLogs.some((l) => l.includes("unhandled effect type"))).toBe(true);
  });

  it("does NOT emit an unhandled log for known stub types", () => {
    const state = makeState();

    executeEffect(state, effect("shift", 0));

    expect(state.pendingLogs.some((l) => l.includes("unhandled effect type"))).toBe(false);
  });
});

// ─── enqueueEffectsFromCard ───────────────────────────────────────────────────

describe("enqueueEffectsFromCard", () => {
  it("queues effects matching the requested trigger", () => {
    // drk_0 has two immediate effects: draw + shift
    const state = makeState();

    enqueueEffectsFromCard(state, 0, "drk_0", "immediate");

    expect(state.effectQueue).toHaveLength(2);
    expect(state.effectQueue[0].type).toBe("draw");
    expect(state.effectQueue[1].type).toBe("shift");
  });

  it("stores the correct ownerIndex and cardDefId on each queued effect", () => {
    const state = makeState();

    enqueueEffectsFromCard(state, 1, "drk_0", "immediate");

    for (const e of state.effectQueue) {
      expect(e.ownerIndex).toBe(1);
      expect(e.cardDefId).toBe("drk_0");
    }
  });

  it("does not queue effects for a different trigger", () => {
    // drk_0 only has immediate effects — queuing for 'start' should produce nothing
    const state = makeState();

    enqueueEffectsFromCard(state, 0, "drk_0", "start");

    expect(state.effectQueue).toHaveLength(0);
  });

  it("skips passive effects even when trigger matches", () => {
    // apy_0 has only a passive effect — should never be queued
    const state = makeState();

    enqueueEffectsFromCard(state, 0, "apy_0", "immediate");

    expect(state.effectQueue).toHaveLength(0);
  });

  it("queues start-trigger effects correctly", () => {
    // dth_1 has one start effect: draw_then_delete_self
    const state = makeState();

    enqueueEffectsFromCard(state, 0, "dth_1", "start");

    expect(state.effectQueue).toHaveLength(1);
    expect(state.effectQueue[0].type).toBe("draw_then_delete_self");
    expect(state.effectQueue[0].trigger).toBe("start");
  });

  it("psy_3 queues only opponent_discard (no extra shift effect)", () => {
    const state = makeState();

    enqueueEffectsFromCard(state, 0, "psy_3", "immediate");

    expect(state.effectQueue).toHaveLength(1);
    expect(state.effectQueue[0].type).toBe("opponent_discard");
  });

  it("is a no-op for an unknown card defId", () => {
    const state = makeState();

    enqueueEffectsFromCard(state, 0, "not_a_real_card", "immediate");

    expect(state.effectQueue).toHaveLength(0);
  });

  it("assigns a unique id to each queued effect", () => {
    const state = makeState();

    enqueueEffectsFromCard(state, 0, "drk_0", "immediate");

    const ids = state.effectQueue.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("plg_4 queues two separate end effects (opponent delete, then optional self flip)", () => {
    const state = makeState();

    enqueueEffectsFromCard(state, 0, "plg_4", "end", "src");

    expect(state.effectQueue).toHaveLength(2);
    expect(state.effectQueue[0].type).toBe("delete");
    expect(state.effectQueue[0].payload.targets).toBe("opponent_facedown");
    expect(state.effectQueue[1].type).toBe("flip");
    expect(state.effectQueue[1].payload.targets).toBe("self");
    expect(state.effectQueue[1].payload.optional).toBe(true);
  });
});

// ─── executeEffect: rearrange_protocols ──────────────────────────────────────

describe("executeEffect — rearrange_protocols (psy_2 / wtr_2)", () => {
  function stateWithProtocols(): ServerGameState {
    const state = makeState();
    state.players[0].protocols = [
      { protocolId: "proto_a", status: "Loading" as any, lineIndex: 0 },
      { protocolId: "proto_b", status: "Loading" as any, lineIndex: 1 },
      { protocolId: "proto_c", status: "Loading" as any, lineIndex: 2 },
    ];
    state.players[1].protocols = [
      { protocolId: "proto_x", status: "Loading" as any, lineIndex: 0 },
      { protocolId: "proto_y", status: "Loading" as any, lineIndex: 1 },
      { protocolId: "proto_z", status: "Loading" as any, lineIndex: 2 },
    ];
    return state;
  }

  it("rearranges own protocols when whose=self", () => {
    const state = stateWithProtocols();
    executeEffect(state, effect("rearrange_protocols", 0, { whose: "self", newProtocolOrder: ["proto_c", "proto_a", "proto_b"] }));

    const p = state.players[0].protocols;
    expect(p.find((x) => x.protocolId === "proto_c")!.lineIndex).toBe(0);
    expect(p.find((x) => x.protocolId === "proto_a")!.lineIndex).toBe(1);
    expect(p.find((x) => x.protocolId === "proto_b")!.lineIndex).toBe(2);
  });

  it("rearranges opponent protocols when whose=opponent", () => {
    const state = stateWithProtocols();
    executeEffect(state, effect("rearrange_protocols", 0, { whose: "opponent", newProtocolOrder: ["proto_z", "proto_x", "proto_y"] }));

    const p = state.players[1].protocols;
    expect(p.find((x) => x.protocolId === "proto_z")!.lineIndex).toBe(0);
    expect(p.find((x) => x.protocolId === "proto_x")!.lineIndex).toBe(1);
    expect(p.find((x) => x.protocolId === "proto_y")!.lineIndex).toBe(2);
  });

  it("does not touch the other player's protocols", () => {
    const state = stateWithProtocols();
    executeEffect(state, effect("rearrange_protocols", 0, { whose: "self", newProtocolOrder: ["proto_b", "proto_c", "proto_a"] }));

    const opp = state.players[1].protocols;
    expect(opp.find((x) => x.protocolId === "proto_x")!.lineIndex).toBe(0);
    expect(opp.find((x) => x.protocolId === "proto_y")!.lineIndex).toBe(1);
    expect(opp.find((x) => x.protocolId === "proto_z")!.lineIndex).toBe(2);
  });

  it("logs and skips when newProtocolOrder is missing", () => {
    const state = stateWithProtocols();
    executeEffect(state, effect("rearrange_protocols", 0, { whose: "self" }));

    expect(state.players[0].protocols.find((x) => x.protocolId === "proto_a")!.lineIndex).toBe(0);
    expect(state.pendingLogs.some((l) => l.includes("no valid"))).toBe(true);
  });

  it("logs and skips when newProtocolOrder contains wrong protocol ids", () => {
    const state = stateWithProtocols();
    executeEffect(state, effect("rearrange_protocols", 0, { whose: "self", newProtocolOrder: ["proto_a", "proto_b", "proto_WRONG"] }));

    expect(state.players[0].protocols.find((x) => x.protocolId === "proto_a")!.lineIndex).toBe(0);
    expect(state.pendingLogs.some((l) => l.includes("invalid protocol ids"))).toBe(true);
  });

  it("logs and skips when the new order is identical to the current order", () => {
    const state = stateWithProtocols();
    executeEffect(state, effect("rearrange_protocols", 0, { whose: "self", newProtocolOrder: ["proto_a", "proto_b", "proto_c"] }));

    expect(state.players[0].protocols.find((x) => x.protocolId === "proto_a")!.lineIndex).toBe(0);
    expect(state.pendingLogs.some((l) => l.includes("order unchanged"))).toBe(true);
  });

  it("logs and skips when newProtocolOrder has wrong length", () => {
    const state = stateWithProtocols();
    executeEffect(state, effect("rearrange_protocols", 0, { whose: "self", newProtocolOrder: ["proto_a", "proto_b"] }));

    expect(state.pendingLogs.some((l) => l.includes("no valid"))).toBe(true);
  });

  it("preserves compile status — compiled protocol keeps its status after rearrange", () => {
    const state = stateWithProtocols();
    state.players[0].protocols[1].status = ProtocolStatus.Compiled; // proto_b is Compiled
    executeEffect(state, effect("rearrange_protocols", 0, { whose: "self", newProtocolOrder: ["proto_c", "proto_a", "proto_b"] }));

    // proto_b moved to lineIndex 2, still Compiled
    expect(state.players[0].protocols.find((x) => x.protocolId === "proto_b")!.status).toBe(ProtocolStatus.Compiled);
    // proto_a and proto_c remain Loading
    expect(state.players[0].protocols.find((x) => x.protocolId === "proto_a")!.status).toBe(ProtocolStatus.Loading);
  });

  it("does not change compile status of any protocol during rearrange", () => {
    const state = stateWithProtocols();
    state.players[0].protocols[0].status = ProtocolStatus.Compiled; // proto_a Compiled
    state.players[0].protocols[2].status = ProtocolStatus.Compiled; // proto_c Compiled
    executeEffect(state, effect("rearrange_protocols", 0, { whose: "self", newProtocolOrder: ["proto_b", "proto_c", "proto_a"] }));

    expect(state.players[0].protocols.find((x) => x.protocolId === "proto_a")!.status).toBe(ProtocolStatus.Compiled);
    expect(state.players[0].protocols.find((x) => x.protocolId === "proto_c")!.status).toBe(ProtocolStatus.Compiled);
    expect(state.players[0].protocols.find((x) => x.protocolId === "proto_b")!.status).toBe(ProtocolStatus.Loading);
  });
});

// ─── executeEffect: return ────────────────────────────────────────────────────

describe("executeEffect — return (wtr_3 / wtr_4)", () => {
  it("moves the targeted card from a line to the owner's hand", () => {
    const state = makeState();
    const target = card("c1");
    state.players[0].lines[0].cards.push(target);

    executeEffect(state, effect("return", 0, { targetInstanceId: "c1" }));

    expect(state.players[0].lines[0].cards).toHaveLength(0);
    expect(state.players[0].hand).toHaveLength(1);
    expect(state.players[0].hand[0].instanceId).toBe("c1");
  });

  it("returned card is set face-up", () => {
    const state = makeState();
    state.players[0].lines[1].cards.push(card("c1", CardFace.FaceDown));

    executeEffect(state, effect("return", 0, { targetInstanceId: "c1" }));

    expect(state.players[0].hand[0].face).toBe(CardFace.FaceUp);
  });

  it("can return a card from the opponent's line to that card owner's hand", () => {
    const state = makeState();
    state.players[1].lines[2].cards.push(card("c1"));

    executeEffect(state, effect("return", 0, { targetInstanceId: "c1" }));

    expect(state.players[1].lines[2].cards).toHaveLength(0);
    expect(state.players[1].hand[0].instanceId).toBe("c1");
    expect(state.players[0].hand).toHaveLength(0);
  });

  it("opponent_any returns the card to its actual owner's hand", () => {
    const state = makeState();
    state.players[1].lines[1].cards.push({ instanceId: "opp1", defId: "spd_3", face: CardFace.FaceDown });

    executeEffect(state, effect("return", 0, { targets: "opponent_any", targetInstanceId: "opp1" }));

    expect(state.players[1].lines[1].cards).toHaveLength(0);
    expect(state.players[1].hand.map((c) => c.instanceId)).toEqual(["opp1"]);
    expect(state.players[0].hand).toHaveLength(0);
    expect(state.players[1].hand[0].face).toBe(CardFace.FaceUp);
  });

  it("logs and skips when no targetInstanceId is provided", () => {
    const state = makeState();
    state.players[0].lines[0].cards.push(card("c1"));

    executeEffect(state, effect("return", 0, {}));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
    expect(state.players[0].hand).toHaveLength(0);
    expect(state.pendingLogs.some((l) => l.includes("no target"))).toBe(true);
  });

  it("logs and skips when targetInstanceId is not in any line", () => {
    const state = makeState();

    executeEffect(state, effect("return", 0, { targetInstanceId: "ghost" }));

    expect(state.players[0].hand).toHaveLength(0);
    expect(state.pendingLogs.some((l) => l.includes("not found"))).toBe(true);
  });

  it("only removes the targeted card, leaving others in the same line", () => {
    const state = makeState();
    state.players[0].lines[0].cards.push(card("c1"), card("c2"), card("c3"));

    executeEffect(state, effect("return", 0, { targetInstanceId: "c3" }));

    expect(state.players[0].lines[0].cards).toHaveLength(2);
    expect(state.players[0].lines[0].cards.map((c) => c.instanceId)).toEqual(["c1", "c2"]);
  });

  it("rejects covered targets", () => {
    const state = makeState();
    state.players[0].lines[0].cards.push(card("c1", CardFace.FaceDown), card("cover", CardFace.FaceUp));

    executeEffect(state, effect("return", 0, { targetInstanceId: "c1" }));

    expect(state.players[0].lines[0].cards).toHaveLength(2);
    expect(state.players[0].hand).toHaveLength(0);
    expect(state.pendingLogs.some((l) => l.includes("must be uncovered"))).toBe(true);
  });

  it("line_value_2 returns all value-2 cards from the selected line", () => {
    const state = makeState();
    // line 1 (both sides): value-2 cards include face-down cards and explicit value-2 defs.
    state.players[0].lines[1].cards.push(
      { instanceId: "p0_fd", defId: "spd_5", face: CardFace.FaceDown }, // value 2 when face-down
      { instanceId: "p0_v2", defId: "wtr_2", face: CardFace.FaceUp },
      { instanceId: "p0_v3", defId: "wtr_3", face: CardFace.FaceUp },
    );
    state.players[1].lines[1].cards.push(
      { instanceId: "p1_v2", defId: "dth_2", face: CardFace.FaceUp },
      { instanceId: "p1_v5", defId: "dth_5", face: CardFace.FaceUp },
    );

    executeEffect(state, effect("return", 0, { targets: "line_value_2", targetLineIndex: 1 }));

    expect(state.players[0].lines[1].cards.map((c) => c.instanceId)).toEqual(["p0_v3"]);
    expect(state.players[1].lines[1].cards.map((c) => c.instanceId)).toEqual(["p1_v5"]);
    expect(state.players[0].hand.map((c) => c.instanceId).sort()).toEqual(["p0_fd", "p0_v2", "p1_v2"].sort());
  });

  it("line_value_2 logs and skips when targetLineIndex is missing", () => {
    const state = makeState();
    state.players[0].lines[0].cards.push({ instanceId: "v2", defId: "wtr_2", face: CardFace.FaceUp });

    executeEffect(state, effect("return", 0, { targets: "line_value_2" }));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
    expect(state.players[0].hand).toHaveLength(0);
    expect(state.pendingLogs.some((l) => l.includes("line_value_2: no valid targetLineIndex"))).toBe(true);
  });
});

// ─── executeEffect: conditional_draw ─────────────────────────────────────────

describe("executeEffect — conditional_draw (lif_4)", () => {
  function conditionalDrawEffect(sourceInstanceId?: string): PendingEffect {
    return { ...effect("conditional_draw", 0, { amount: 1 }), sourceInstanceId };
  }

  it("draws when the source card is at index > 0 in a line (covering another card)", () => {
    const state = makeState();
    state.decks[0].push(card("d1"));
    // line: [bottom, lif4_inst] — lif4 is at index 1, covering the bottom card
    state.players[0].lines[0].cards.push(card("bottom"), card("lif4_inst"));

    executeEffect(state, conditionalDrawEffect("lif4_inst"));

    expect(state.players[0].hand).toHaveLength(1);
  });

  it("does NOT draw when the source card is at index 0 (not covering anything)", () => {
    const state = makeState();
    state.decks[0].push(card("d1"));
    state.players[0].lines[0].cards.push(card("lif4_inst")); // only card, index 0

    executeEffect(state, conditionalDrawEffect("lif4_inst"));

    expect(state.players[0].hand).toHaveLength(0);
    expect(state.pendingLogs.some((l) => l.includes("not covering"))).toBe(true);
  });

  it("does NOT draw when sourceInstanceId is absent", () => {
    const state = makeState();
    state.decks[0].push(card("d1"));
    state.players[0].lines[0].cards.push(card("bottom"), card("lif4_inst"));

    executeEffect(state, conditionalDrawEffect()); // no sourceInstanceId

    expect(state.players[0].hand).toHaveLength(0);
  });

  it("finds the source card in any line across both players", () => {
    const state = makeState();
    state.decks[0].push(card("d1"));
    // source card is in opponent's line at index 1 — covering check still passes
    state.players[1].lines[2].cards.push(card("beneath"), card("lif4_inst"));

    executeEffect(state, conditionalDrawEffect("lif4_inst"));

    expect(state.players[0].hand).toHaveLength(1);
  });

  it("logs that the condition was met when drawing", () => {
    const state = makeState();
    state.decks[0].push(card("d1"));
    state.players[0].lines[0].cards.push(card("bottom"), card("lif4_inst"));

    executeEffect(state, conditionalDrawEffect("lif4_inst"));

    expect(state.pendingLogs.some((l) => l.includes("covering"))).toBe(true);
  });
});

// ─── executeEffect: source card cancellation ─────────────────────────────────

describe("executeEffect — source card cancellation", () => {
  it("executes normally when sourceInstanceId is absent (no guard)", () => {
    const state = makeState();
    state.decks[0].push(card("d1"));
    // effect() helper does not set sourceInstanceId
    executeEffect(state, effect("draw", 0, { amount: 1 }));
    expect(state.players[0].hand).toHaveLength(1);
  });

  it("executes normally when source card is face-up in a line", () => {
    const state = makeState();
    state.decks[0].push(card("d1"));
    state.players[0].lines[0].cards.push(card("src", CardFace.FaceUp));
    const eff: PendingEffect = { ...effect("draw", 0, { amount: 1 }), sourceInstanceId: "src" };

    executeEffect(state, eff);

    expect(state.players[0].hand).toHaveLength(1);
  });

  it("cancels and logs when source card has been deleted (not in any line)", () => {
    const state = makeState();
    state.decks[0].push(card("d1"));
    // source card is NOT placed in any line — simulates deleted/returned
    const eff: PendingEffect = { ...effect("draw", 0, { amount: 1 }), sourceInstanceId: "src" };

    executeEffect(state, eff);

    expect(state.players[0].hand).toHaveLength(0);
    expect(state.pendingLogs.some((l) => l.includes("cancelled"))).toBe(true);
  });

  it("cancels when source card has been flipped face-down", () => {
    const state = makeState();
    state.decks[0].push(card("d1"));
    state.players[0].lines[0].cards.push(card("src", CardFace.FaceDown)); // face-down = not active
    const eff: PendingEffect = { ...effect("draw", 0, { amount: 1 }), sourceInstanceId: "src" };

    executeEffect(state, eff);

    expect(state.players[0].hand).toHaveLength(0);
    expect(state.pendingLogs.some((l) => l.includes("cancelled"))).toBe(true);
  });

  it("cancels when source card is in opponent's line (wrong owner) but still face-up", () => {
    // A card can only belong to one player. If it somehow ends up in the opponent's
    // line, the ownerIndex mismatch doesn't matter here — the check is purely
    // "is this instanceId face-up in ANY line". This test validates it still works.
    const state = makeState();
    state.decks[0].push(card("d1"));
    // source card in opponent's line face-up (e.g. shifted there): effect still executes
    state.players[1].lines[0].cards.push(card("src", CardFace.FaceUp));
    const eff: PendingEffect = { ...effect("draw", 0, { amount: 1 }), sourceInstanceId: "src" };

    executeEffect(state, eff);

    expect(state.players[0].hand).toHaveLength(1); // still fires
  });
});

// ─── enqueue functions set sourceInstanceId ──────────────────────────────────

describe("enqueue functions — sourceInstanceId propagation", () => {
  it("enqueueEffectsFromCard sets sourceInstanceId when provided", () => {
    const state = makeState();

    enqueueEffectsFromCard(state, 0, "drk_0", "immediate", "inst-abc");

    for (const e of state.effectQueue) {
      expect(e.sourceInstanceId).toBe("inst-abc");
    }
  });

  it("enqueueEffectsFromCard leaves sourceInstanceId undefined when not provided", () => {
    const state = makeState();

    enqueueEffectsFromCard(state, 0, "drk_0", "immediate");

    for (const e of state.effectQueue) {
      expect(e.sourceInstanceId).toBeUndefined();
    }
  });

  it("enqueueEffectsOnFlipFaceUp sets sourceInstanceId to the flipped card's instanceId", () => {
    const state = makeState();
    const flipped: CardInstance = { instanceId: "flip-inst", defId: "drk_0", face: CardFace.FaceUp };

    enqueueEffectsOnFlipFaceUp(state, 0, flipped);

    for (const e of state.effectQueue) {
      expect(e.sourceInstanceId).toBe("flip-inst");
    }
  });

  it("enqueueEffectsOnUncover sets sourceInstanceId to the uncovered card's instanceId", () => {
    const state = makeState();
    const uncovered: CardInstance = { instanceId: "uncover-inst", defId: "drk_0", face: CardFace.FaceUp };

    enqueueEffectsOnUncover(state, 0, uncovered);

    for (const e of state.effectQueue) {
      expect(e.sourceInstanceId).toBe("uncover-inst");
    }
  });
});

describe("enqueueEffectsOnFlipFaceUp", () => {
  // drk_0: two immediate effects — draw (top) + shift (mid)
  // grv_1: two immediate effects — draw (top) + shift (mid)
  // mtl_0: one passive + one immediate (flip) — passive must never be queued
  // hat_3: one passive only — nothing should queue

  it("queues ALL immediate effects when the card is uncovered", () => {
    const state = makeState();
    const flipped: CardInstance = { instanceId: "c1", defId: "drk_0", face: CardFace.FaceUp };
    // coveredBy is absent → uncovered

    enqueueEffectsOnFlipFaceUp(state, 0, flipped);

    expect(state.effectQueue).toHaveLength(2);
    expect(state.effectQueue[0].type).toBe("draw");
    expect(state.effectQueue[1].type).toBe("shift");
  });

  it("queues ONLY the top (first) immediate effect when the card is covered", () => {
    const state = makeState();
    const flipped: CardInstance = {
      instanceId: "c1", defId: "drk_0", face: CardFace.FaceUp,
    };
    const covering = card("c2", CardFace.FaceDown);
    // Place flipped below covering so it is covered (index 0 < length-1)
    state.players[0].lines[0].cards.push(flipped, covering);

    enqueueEffectsOnFlipFaceUp(state, 0, flipped);

    expect(state.effectQueue).toHaveLength(1);
    expect(state.effectQueue[0].type).toBe("draw"); // top only
  });

  it("queues the top effect for a covered card with draw+shift (grv_1)", () => {
    const state = makeState();
    const flipped: CardInstance = {
      instanceId: "c1", defId: "grv_1", face: CardFace.FaceUp,
    };
    const covering = card("c2", CardFace.FaceDown);
    state.players[0].lines[0].cards.push(flipped, covering);

    enqueueEffectsOnFlipFaceUp(state, 0, flipped);

    expect(state.effectQueue).toHaveLength(1);
    expect(state.effectQueue[0].type).toBe("draw");
  });

  it("skips passive effects — only immediates are queued (mtl_0: passive + immediate:flip)", () => {
    const state = makeState();
    const flipped: CardInstance = { instanceId: "c1", defId: "mtl_0", face: CardFace.FaceUp };

    enqueueEffectsOnFlipFaceUp(state, 0, flipped);

    // mtl_0 has one passive (reduce_opponent_value) and one immediate (flip)
    expect(state.effectQueue).toHaveLength(1);
    expect(state.effectQueue[0].type).toBe("flip");
  });

  it("covered card with only one immediate (the passive doesn't shift the index) — mtl_0", () => {
    const state = makeState();
    const flipped: CardInstance = {
      instanceId: "c1", defId: "mtl_0", face: CardFace.FaceUp,
    };
    const covering = card("c2", CardFace.FaceDown);
    state.players[0].lines[0].cards.push(flipped, covering);

    enqueueEffectsOnFlipFaceUp(state, 0, flipped);

    // flip IS the first (and only) immediate, so it fires even when covered
    expect(state.effectQueue).toHaveLength(1);
    expect(state.effectQueue[0].type).toBe("flip");
  });

  it("queues nothing when the card has no immediate effects (hat_3: passive only)", () => {
    const state = makeState();
    const flipped: CardInstance = { instanceId: "c1", defId: "hat_3", face: CardFace.FaceUp };

    enqueueEffectsOnFlipFaceUp(state, 0, flipped);

    expect(state.effectQueue).toHaveLength(0);
  });

  it("is a no-op for an unknown card defId", () => {
    const state = makeState();
    const flipped: CardInstance = { instanceId: "c1", defId: "not_real", face: CardFace.FaceUp };

    enqueueEffectsOnFlipFaceUp(state, 0, flipped);

    expect(state.effectQueue).toHaveLength(0);
  });

  it("records the correct ownerIndex on queued effects", () => {
    const state = makeState();
    const flipped: CardInstance = { instanceId: "c1", defId: "drk_0", face: CardFace.FaceUp };

    enqueueEffectsOnFlipFaceUp(state, 1, flipped);

    for (const e of state.effectQueue) {
      expect(e.ownerIndex).toBe(1);
    }
  });

  it("assigns unique ids to all queued effects", () => {
    const state = makeState();
    const flipped: CardInstance = { instanceId: "c1", defId: "drk_0", face: CardFace.FaceUp };

    enqueueEffectsOnFlipFaceUp(state, 0, flipped);

    const ids = state.effectQueue.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── enqueueEffectsOnUncover ──────────────────────────────────────────────────

describe("enqueueEffectsOnUncover", () => {
  // drk_0: draw (top, index 0) + shift (mid, index 1)
  // grv_1: draw (top) + shift (mid)
  // mtl_0: passive + flip(immediate) — only 1 immediate, nothing extra
  // hat_3: passive only — nothing queues
  // lif_1: flip + flip — two immediates, only second queues on uncover

  it("queues only mid/bot (immediates 1+) when uncovered — drk_0", () => {
    const state = makeState();
    const uncovered: CardInstance = { instanceId: "c1", defId: "drk_0", face: CardFace.FaceUp };

    enqueueEffectsOnUncover(state, 0, uncovered);

    expect(state.effectQueue).toHaveLength(1);
    expect(state.effectQueue[0].type).toBe("shift"); // mid — top (draw) is skipped
  });

  it("queues shift (mid) but not draw (top) for grv_1", () => {
    const state = makeState();
    const uncovered: CardInstance = { instanceId: "c1", defId: "grv_1", face: CardFace.FaceUp };

    enqueueEffectsOnUncover(state, 0, uncovered);

    expect(state.effectQueue).toHaveLength(1);
    expect(state.effectQueue[0].type).toBe("shift");
  });

  it("queues nothing when there is only one immediate effect (mtl_0)", () => {
    const state = makeState();
    // mtl_0 has 1 passive + 1 immediate — nothing beyond index 0
    const uncovered: CardInstance = { instanceId: "c1", defId: "mtl_0", face: CardFace.FaceUp };

    enqueueEffectsOnUncover(state, 0, uncovered);

    expect(state.effectQueue).toHaveLength(0);
  });

  it("queues nothing for a card with passives only (hat_3)", () => {
    const state = makeState();
    const uncovered: CardInstance = { instanceId: "c1", defId: "hat_3", face: CardFace.FaceUp };

    enqueueEffectsOnUncover(state, 0, uncovered);

    expect(state.effectQueue).toHaveLength(0);
  });

  it("queues reveal_shift_or_flip (mid) but not draw (top) for lgt_2", () => {
    // lgt_2 has draw (top, index 0) + reveal_shift_or_flip (mid, index 1)
    const state = makeState();
    const uncovered: CardInstance = { instanceId: "c1", defId: "lgt_2", face: CardFace.FaceUp };

    enqueueEffectsOnUncover(state, 0, uncovered);

    expect(state.effectQueue).toHaveLength(1);
    expect(state.effectQueue[0].type).toBe("reveal_shift_or_flip");
  });

  it("is a no-op for an unknown card defId", () => {
    const state = makeState();
    const uncovered: CardInstance = { instanceId: "c1", defId: "not_real", face: CardFace.FaceUp };

    enqueueEffectsOnUncover(state, 0, uncovered);

    expect(state.effectQueue).toHaveLength(0);
  });

  it("records the correct ownerIndex on queued effects", () => {
    const state = makeState();
    const uncovered: CardInstance = { instanceId: "c1", defId: "drk_0", face: CardFace.FaceUp };

    enqueueEffectsOnUncover(state, 1, uncovered);

    expect(state.effectQueue[0].ownerIndex).toBe(1);
  });

  it("assigns unique ids to all queued effects", () => {
    const state = makeState();
    // lgt_2: draw + reveal_shift_or_flip — two immediates
    const uncovered: CardInstance = { instanceId: "c1", defId: "lgt_2", face: CardFace.FaceUp };

    enqueueEffectsOnUncover(state, 0, uncovered);

    const ids = state.effectQueue.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── executeEffect: deck_to_other_lines ──────────────────────────────────────

describe("executeEffect — deck_to_other_lines (wtr_1)", () => {
  function deckToOtherLinesEffect(sourceInstanceId?: string): PendingEffect {
    return { ...effect("deck_to_other_lines", 0, {}), sourceInstanceId };
  }

  it("plays deck card face-down in the two lines that are NOT the source line", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "wtr_1", face: CardFace.FaceUp };
    state.players[0].lines[1].cards.push(src);
    state.decks[0].push(card("d1"), card("d2"), card("d3"));
    state.players[0].deckSize = 3;

    executeEffect(state, deckToOtherLinesEffect("src"));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
    expect(state.players[0].lines[0].cards[0].face).toBe(CardFace.FaceDown);
    expect(state.players[0].lines[1].cards).toHaveLength(1); // source line unchanged
    expect(state.players[0].lines[2].cards).toHaveLength(1);
    expect(state.players[0].lines[2].cards[0].face).toBe(CardFace.FaceDown);
  });

  it("reduces deckSize by two", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "wtr_1", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);
    state.decks[0].push(card("d1"), card("d2"), card("d3"));
    state.players[0].deckSize = 3;

    executeEffect(state, deckToOtherLinesEffect("src"));

    expect(state.players[0].deckSize).toBe(1);
  });

  it("plays into all three lines if no sourceInstanceId (srcLineIndex = -1 → nothing skipped)", () => {
    const state = makeState();
    state.decks[0].push(card("d1"), card("d2"), card("d3"));
    state.players[0].deckSize = 3;

    executeEffect(state, deckToOtherLinesEffect()); // no source

    const placed = state.players[0].lines.filter((l) => l.cards.length > 0).length;
    expect(placed).toBe(3);
  });

  it("stops if deck and trash are empty", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "wtr_1", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);
    // decks[0] is empty, trashes[0] is also empty

    executeEffect(state, deckToOtherLinesEffect("src"));

    expect(state.players[0].lines[1].cards).toHaveLength(0);
    expect(state.players[0].lines[2].cards).toHaveLength(0);
  });
});

// ─── executeEffect: deck_to_each_line ────────────────────────────────────────

describe("executeEffect — deck_to_each_line (lif_0)", () => {
  it("plays deck card face-down in every line that has at least one card", () => {
    const state = makeState();
    state.players[0].lines[0].cards.push(card("c0"));
    state.players[0].lines[2].cards.push(card("c2")); // line 1 is empty
    state.decks[0].push(card("d1"), card("d2"), card("d3"));
    state.players[0].deckSize = 3;

    executeEffect(state, effect("deck_to_each_line", 0));

    expect(state.players[0].lines[0].cards).toHaveLength(2);
    expect(state.players[0].lines[0].cards[1].face).toBe(CardFace.FaceDown);
    expect(state.players[0].lines[1].cards).toHaveLength(0); // still empty
    expect(state.players[0].lines[2].cards).toHaveLength(2);
    expect(state.players[0].lines[2].cards[1].face).toBe(CardFace.FaceDown);
  });

  it("does nothing to empty lines", () => {
    const state = makeState();
    state.decks[0].push(card("d1"));
    state.players[0].deckSize = 1;

    executeEffect(state, effect("deck_to_each_line", 0));

    expect(state.players[0].lines[0].cards).toHaveLength(0);
    expect(state.players[0].lines[1].cards).toHaveLength(0);
    expect(state.players[0].lines[2].cards).toHaveLength(0);
    expect(state.players[0].deckSize).toBe(1); // deck untouched
  });

  it("reduces deckSize by the number of occupied lines", () => {
    const state = makeState();
    state.players[0].lines[0].cards.push(card("c0"));
    state.players[0].lines[1].cards.push(card("c1"));
    state.players[0].lines[2].cards.push(card("c2"));
    state.decks[0].push(card("d1"), card("d2"), card("d3"));
    state.players[0].deckSize = 3;

    executeEffect(state, effect("deck_to_each_line", 0));

    expect(state.players[0].deckSize).toBe(0);
  });
});

// ─── executeEffect: opponent_deck_to_line ────────────────────────────────────

describe("executeEffect — opponent_deck_to_line (grv_6)", () => {
  function oppDeckEffect(sourceInstanceId?: string): PendingEffect {
    return { ...effect("opponent_deck_to_line", 0, {}), sourceInstanceId };
  }

  it("places top of opponent deck face-down in opponent's matching line", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "grv_6", face: CardFace.FaceUp };
    state.players[0].lines[2].cards.push(src);
    state.decks[1].push(card("opp1"), card("opp2"));
    state.players[1].deckSize = 2;

    executeEffect(state, oppDeckEffect("src"));

    expect(state.players[1].lines[2].cards).toHaveLength(1);
    expect(state.players[1].lines[2].cards[0].face).toBe(CardFace.FaceDown);
    expect(state.players[1].deckSize).toBe(1);
  });

  it("does not touch owner's deck or lines", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "grv_6", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);
    state.decks[0].push(card("own1"));
    state.decks[1].push(card("opp1"));
    state.players[0].deckSize = 1;
    state.players[1].deckSize = 1;

    executeEffect(state, oppDeckEffect("src"));

    expect(state.players[0].deckSize).toBe(1); // own deck untouched
    expect(state.players[0].lines[1].cards).toHaveLength(0);
    expect(state.players[1].lines[0].cards).toHaveLength(1);
  });

  it("logs an error if source line is not found (no sourceInstanceId)", () => {
    const state = makeState();
    // No sourceInstanceId → lineIndex = -1 → "source line not found"
    executeEffect(state, oppDeckEffect());

    expect(state.pendingLogs.some((l) => l.includes("source line not found"))).toBe(true);
  });

  it("does not reshuffle opponent trash when opponent deck is empty", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "grv_6", face: CardFace.FaceUp };
    state.players[0].lines[1].cards.push(src);
    state.trashes[1].push(card("t1"), card("t2"));
    state.players[1].trashSize = 2;

    executeEffect(state, oppDeckEffect("src"));

    expect(state.players[1].lines[1].cards).toHaveLength(0);
    expect(state.trashes[1]).toHaveLength(2);
    expect(state.players[1].trashSize).toBe(2);
  });
});

// ─── executeEffect: deck_to_under ────────────────────────────────────────────

describe("executeEffect — deck_to_under (grv_0)", () => {
  function deckToUnderEffect(sourceInstanceId?: string): PendingEffect {
    return { ...effect("deck_to_under", 0, {}), sourceInstanceId };
  }

  it("inserts floor(N/2) deck cards below the source card", () => {
    const state = makeState();
    const bottom: CardInstance = { instanceId: "bot", defId: "dummy", face: CardFace.FaceDown };
    const src: CardInstance = { instanceId: "src", defId: "grv_0", face: CardFace.FaceUp };
    // line has 2 cards → floor(2/2) = 1 insertion
    state.players[0].lines[0].cards.push(bottom, src);
    state.decks[0].push(card("d1"), card("d2"), card("d3"));
    state.players[0].deckSize = 3;

    executeEffect(state, deckToUnderEffect("src"));

    // Resulting layout (bottom to top): bottom, d1-face-down, src
    expect(state.players[0].lines[0].cards).toHaveLength(3);
    expect(state.players[0].lines[0].cards[2].instanceId).toBe("src"); // src still on top
    expect(state.players[0].lines[0].cards[1].face).toBe(CardFace.FaceDown); // inserted below src
    expect(state.players[0].deckSize).toBe(2);
  });

  it("inserts two cards when line has 4 cards", () => {
    const state = makeState();
    const c1: CardInstance = { instanceId: "c1", defId: "dummy", face: CardFace.FaceDown };
    const c2: CardInstance = { instanceId: "c2", defId: "dummy", face: CardFace.FaceDown };
    const c3: CardInstance = { instanceId: "c3", defId: "dummy", face: CardFace.FaceDown };
    const src: CardInstance = { instanceId: "src", defId: "grv_0", face: CardFace.FaceUp };
    // 4 cards → floor(4/2) = 2 insertions
    state.players[0].lines[0].cards.push(c1, c2, c3, src);
    state.decks[0].push(card("d1"), card("d2"), card("d3"));
    state.players[0].deckSize = 3;

    executeEffect(state, deckToUnderEffect("src"));

    expect(state.players[0].lines[0].cards).toHaveLength(6);
    expect(state.players[0].lines[0].cards[5].instanceId).toBe("src");
    expect(state.players[0].deckSize).toBe(1);
  });

  it("does nothing when source card is alone in line (floor(1/2) = 0)", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "grv_0", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);
    state.decks[0].push(card("d1"));
    state.players[0].deckSize = 1;

    executeEffect(state, deckToUnderEffect("src"));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
    expect(state.players[0].deckSize).toBe(1); // deck untouched
  });

  it("logs error if sourceInstanceId is absent", () => {
    const state = makeState();
    executeEffect(state, deckToUnderEffect());

    expect(state.pendingLogs.some((l) => l.includes("no sourceInstanceId"))).toBe(true);
  });

  it("does not reshuffle own trash when deck is empty", () => {
    const state = makeState();
    const bottom: CardInstance = { instanceId: "bot", defId: "dummy", face: CardFace.FaceDown };
    const src: CardInstance = { instanceId: "src", defId: "grv_0", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(bottom, src);
    state.trashes[0].push(card("t1"), card("t2"));
    state.players[0].trashSize = 2;

    executeEffect(state, deckToUnderEffect("src"));

    expect(state.players[0].lines[0].cards.map((c) => c.instanceId)).toEqual(["bot", "src"]);
    expect(state.trashes[0]).toHaveLength(2);
    expect(state.players[0].trashSize).toBe(2);
  });
});

// ─── executeEffect: skip_check_cache ─────────────────────────────────────────

describe("executeEffect — skip_check_cache (spr_0)", () => {
  it("sets state.skipCheckCache to true", () => {
    const state = makeState();
    expect(state.skipCheckCache).toBe(false);

    executeEffect(state, effect("skip_check_cache", 0));

    expect(state.skipCheckCache).toBe(true);
  });

  it("logs the skip message", () => {
    const state = makeState();

    executeEffect(state, effect("skip_check_cache", 0));

    expect(state.pendingLogs.some((l) => l.includes("skip_check_cache"))).toBe(true);
  });
});

// ─── executeEffect — refresh ───────────────────────────────────────────────────

describe("executeEffect — refresh (spr_0, lov_2)", () => {
  it("draws cards up to a hand size of 5", () => {
    const state = makeState();
    state.players[0].hand.push(card("h1"), card("h2"));
    state.decks[0].push(card("d1"), card("d2"), card("d3"), card("d4"));
    state.players[0].deckSize = 4;

    executeEffect(state, effect("refresh", 0));

    expect(state.players[0].hand).toHaveLength(5);
    expect(state.players[0].deckSize).toBe(1);
  });

  it("does nothing when hand already has 5 or more cards", () => {
    const state = makeState();
    for (let i = 0; i < 5; i++) state.players[0].hand.push(card(`h${i}`));
    state.decks[0].push(card("d1"));
    state.players[0].deckSize = 1;

    executeEffect(state, effect("refresh", 0));

    expect(state.players[0].hand).toHaveLength(5);
    expect(state.players[0].deckSize).toBe(1); // deck untouched
  });

  it("only draws for the owner, not the opponent", () => {
    const state = makeState();
    state.players[0].hand.push(card("h1"));
    state.decks[0].push(card("d1"), card("d2"), card("d3"), card("d4"));
    state.players[0].deckSize = 4;

    executeEffect(state, effect("refresh", 0));

    expect(state.players[1].hand).toHaveLength(0);
  });
});

// ─── executeEffect: play_facedown ────────────────────────────────────────────

describe("executeEffect — play_facedown (drk_3)", () => {
  function playFacedownEffect(targetInstanceId?: string, targetLineIndex?: number, sourceInstanceId?: string): PendingEffect {
    const payload: Record<string, unknown> = {};
    if (targetInstanceId !== undefined) payload.targetInstanceId = targetInstanceId;
    if (targetLineIndex !== undefined) payload.targetLineIndex = targetLineIndex;
    return { ...effect("play_facedown", 0, payload), sourceInstanceId };
  }

  it("moves a hand card face-down into the target line", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "drk_3", face: CardFace.FaceUp };
    const handCard: CardInstance = { instanceId: "h1", defId: "dummy", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);
    state.players[0].hand.push(handCard);

    executeEffect(state, playFacedownEffect("h1", 1, "src"));

    expect(state.players[0].hand).toHaveLength(0);
    expect(state.players[0].lines[1].cards).toHaveLength(1);
    expect(state.players[0].lines[1].cards[0].instanceId).toBe("h1");
    expect(state.players[0].lines[1].cards[0].face).toBe(CardFace.FaceDown);
  });

  it("card is always placed face-down regardless of its original face", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "drk_3", face: CardFace.FaceUp };
    const handCard: CardInstance = { instanceId: "h1", defId: "dummy", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);
    state.players[0].hand.push(handCard);

    executeEffect(state, playFacedownEffect("h1", 2, "src"));

    expect(state.players[0].lines[2].cards[0].face).toBe(CardFace.FaceDown);
  });

  it("logs and skips when no target card or line is provided", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "drk_3", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, playFacedownEffect(undefined, undefined, "src"));

    expect(state.pendingLogs.some((l) => l.includes("no target"))).toBe(true);
  });

  it("logs and skips when card is not in hand", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "drk_3", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, playFacedownEffect("missing", 1, "src"));

    expect(state.players[0].lines[1].cards).toHaveLength(0);
    expect(state.pendingLogs.some((l) => l.includes("not found in hand"))).toBe(true);
  });
});

// ─── executeEffect: flip_self ─────────────────────────────────────────────────

describe("executeEffect — flip_self (wtr_0, psy_1)", () => {
  function flipSelfEffect(sourceInstanceId?: string): PendingEffect {
    return { ...effect("flip_self", 0, {}), sourceInstanceId };
  }

  it("flips a face-up source card to face-down", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "wtr_0", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, flipSelfEffect("src"));

    expect(state.players[0].lines[0].cards[0].face).toBe(CardFace.FaceDown);
  });

  it("logs and skips when sourceInstanceId is absent", () => {
    const state = makeState();

    executeEffect(state, flipSelfEffect());

    expect(state.pendingLogs.some((l) => l.includes("no sourceInstanceId"))).toBe(true);
  });

  it("is cancelled by source-card guard when card is not in any line", () => {
    const state = makeState();
    // source card not placed in any line → isSourceCardActive returns false → early bail
    executeEffect(state, flipSelfEffect("missing"));

    expect(state.pendingLogs.some((l) => l.includes("no longer active"))).toBe(true);
  });
});

// ─── executeEffect: return_opp_flip_self ─────────────────────────────────────

describe("executeEffect — return_opp_flip_self (psy_4)", () => {
  function returnOppFlipSelfEffect(targetInstanceId?: string, sourceInstanceId?: string): PendingEffect {
    return {
      ...effect("return_opp_flip_self", 0, targetInstanceId ? { targetInstanceId } : {}),
      sourceInstanceId,
    };
  }

  it("returns opponent card to their hand and flips the source card", () => {
    const state = makeState();
    const oppCard: CardInstance = { instanceId: "opp1", defId: "dummy", face: CardFace.FaceUp };
    const src: CardInstance = { instanceId: "src", defId: "psy_4", face: CardFace.FaceUp };
    state.players[1].lines[0].cards.push(oppCard);
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, returnOppFlipSelfEffect("opp1", "src"));

    expect(state.players[1].lines[0].cards).toHaveLength(0);
    expect(state.players[1].hand).toHaveLength(1);
    expect(state.players[1].hand[0].instanceId).toBe("opp1");
    expect(src.face).toBe(CardFace.FaceDown); // source card flipped
  });

  it("does not flip self when no target is provided (skipped)", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "psy_4", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, returnOppFlipSelfEffect(undefined, "src"));

    expect(src.face).toBe(CardFace.FaceUp); // unchanged
    expect(state.pendingLogs.some((l) => l.includes("skipped"))).toBe(true);
  });

  it("logs and does not flip when target not found in opponent lines", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "psy_4", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, returnOppFlipSelfEffect("missing", "src"));

    expect(src.face).toBe(CardFace.FaceUp); // not flipped
    expect(state.pendingLogs.some((l) => l.includes("not found"))).toBe(true);
  });
});

// ─── executeEffect: delete (opponent_facedown target) ───────────────────────

describe("executeEffect — delete (targets=opponent_facedown, plg_4)", () => {
  it("deletes an uncovered opponent face-down card", () => {
    const state = makeState();
    state.players[1].lines[0].cards.push({ instanceId: "opp1", defId: "dummy", face: CardFace.FaceDown });

    executeEffect(state, effect("delete", 0, { targets: "opponent_facedown", targetInstanceId: "opp1" }));

    expect(state.players[1].lines[0].cards).toHaveLength(0);
    expect(state.trashes[1]).toHaveLength(1);
  });

  it("rejects deleting an own face-down card", () => {
    const state = makeState();
    state.players[0].lines[0].cards.push({ instanceId: "own1", defId: "dummy", face: CardFace.FaceDown });

    executeEffect(state, effect("delete", 0, { targets: "opponent_facedown", targetInstanceId: "own1" }));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
    expect(state.pendingLogs.some((l) => l.includes("must target opponent"))).toBe(true);
  });
});

// ─── executeEffect: flip (targets=self, optional=true) ──────────────────────

describe("executeEffect — flip (targets=self, optional=true, plg_4)", () => {
  it("skips when optional self flip has no target selected", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "plg_4", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, { ...effect("flip", 0, { targets: "self", optional: true }), sourceInstanceId: "src" });

    expect(src.face).toBe(CardFace.FaceUp);
    expect(state.pendingLogs.some((l) => l.includes("optional, skipped"))).toBe(true);
  });

  it("flips the source card when selected", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "plg_4", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, { ...effect("flip", 0, { targets: "self", optional: true, targetInstanceId: "src" }), sourceInstanceId: "src" });

    expect(src.face).toBe(CardFace.FaceDown);
  });
});

// ─── executeEffect: deny_compile ─────────────────────────────────────────────

describe("executeEffect — deny_compile (mtl_1)", () => {
  it("sets state.denyCompile to true", () => {
    const state = makeState();
    expect(state.denyCompile).toBe(false);

    executeEffect(state, effect("deny_compile", 0));

    expect(state.denyCompile).toBe(true);
  });

  it("logs the deny message", () => {
    const state = makeState();
    executeEffect(state, effect("deny_compile", 0));
    expect(state.pendingLogs.some((l) => l.includes("deny_compile"))).toBe(true);
  });
});

// ─── executeEffect: opponent_draw ────────────────────────────────────────────

describe("executeEffect — opponent_draw (lov_2, lov_6)", () => {
  it("makes the opponent draw N cards", () => {
    const state = makeState();
    state.decks[1].push(card("d1"), card("d2"));
    state.players[1].deckSize = 2;

    executeEffect(state, effect("opponent_draw", 0, { amount: 2 }));

    expect(state.players[1].hand).toHaveLength(2);
    expect(state.players[1].deckSize).toBe(0);
  });

  it("does not touch the owner's hand", () => {
    const state = makeState();
    state.decks[1].push(card("d1"));
    state.players[1].deckSize = 1;

    executeEffect(state, effect("opponent_draw", 0, { amount: 1 }));

    expect(state.players[0].hand).toHaveLength(0);
  });
});

// ─── executeEffect: draw_from_opponent_deck ──────────────────────────────────

describe("executeEffect — draw_from_opponent_deck (lov_1)", () => {
  it("moves top card of opponent deck into owner's hand face-up", () => {
    const state = makeState();
    const oppCard: CardInstance = { instanceId: "opp1", defId: "dummy", face: CardFace.FaceDown };
    state.decks[1].push(oppCard);
    state.players[1].deckSize = 1;

    executeEffect(state, effect("draw_from_opponent_deck", 0));

    expect(state.players[0].hand).toHaveLength(1);
    expect(state.players[0].hand[0].instanceId).toBe("opp1");
    expect(state.players[0].hand[0].face).toBe(CardFace.FaceUp);
    expect(state.players[1].deckSize).toBe(0);
  });

  it("logs when opponent deck and trash are empty", () => {
    const state = makeState();
    executeEffect(state, effect("draw_from_opponent_deck", 0));
    expect(state.pendingLogs.some((l) => l.includes("empty"))).toBe(true);
    expect(state.players[0].hand).toHaveLength(0);
  });
});

// ─── executeEffect: exchange_hand ────────────────────────────────────────────

describe("executeEffect — exchange_hand (lov_3)", () => {
  it("first takes a random opponent card and queues a follow-up give choice", () => {
    const state = makeState();
    const oppCard: CardInstance = { instanceId: "theirs", defId: "dummy2", face: CardFace.FaceUp };
    state.players[1].hand.push(oppCard);

    executeEffect(state, effect("exchange_hand", 0, {}));

    expect(state.players[0].hand.some((c) => c.instanceId === "theirs")).toBe(true);
    expect(state.players[1].hand.some((c) => c.instanceId === "theirs")).toBe(false);
    expect(state.effectQueue[0]?.type).toBe("exchange_hand");
    expect(state.effectQueue[0]?.payload.awaitGive).toBe(true);
  });

  it("second step gives the chosen card to the opponent", () => {
    const state = makeState();
    const myCard: CardInstance = { instanceId: "mine", defId: "dummy", face: CardFace.FaceUp };
    state.players[0].hand.push(myCard);

    executeEffect(state, effect("exchange_hand", 0, { awaitGive: true, targetInstanceId: "mine" }));

    expect(state.players[0].hand.some((c) => c.instanceId === "mine")).toBe(false);
    expect(state.players[1].hand.some((c) => c.instanceId === "mine")).toBe(true);
  });

  it("logs and skips when opponent hand is empty", () => {
    const state = makeState();
    executeEffect(state, effect("exchange_hand", 0, {}));
    expect(state.pendingLogs.some((l) => l.includes("no cards to take"))).toBe(true);
  });

  it("logs and skips on the give step when no card is chosen", () => {
    const state = makeState();
    state.players[0].hand.push(card("mine"));

    executeEffect(state, effect("exchange_hand", 0, { awaitGive: true }));

    expect(state.pendingLogs.some((l) => l.includes("no card chosen"))).toBe(true);
  });
});

// ─── executeEffect: give_to_draw ─────────────────────────────────────────────

describe("executeEffect — give_to_draw (lov_1 end)", () => {
  it("gives chosen card to opponent and draws 2", () => {
    const state = makeState();
    const myCard: CardInstance = { instanceId: "mine", defId: "dummy", face: CardFace.FaceUp };
    state.players[0].hand.push(myCard);
    state.decks[0].push(card("d1"), card("d2"), card("d3"));
    state.players[0].deckSize = 3;

    executeEffect(state, effect("give_to_draw", 0, { targetInstanceId: "mine" }));

    expect(state.players[0].hand).toHaveLength(2); // gave 1, drew 2
    expect(state.players[1].hand.some((c) => c.instanceId === "mine")).toBe(true);
    expect(state.players[0].deckSize).toBe(1);
  });

  it("skips when no target is provided", () => {
    const state = makeState();
    state.players[0].hand.push(card("mine"));
    state.decks[0].push(card("d1"));
    state.players[0].deckSize = 1;

    executeEffect(state, effect("give_to_draw", 0, {}));

    expect(state.players[0].hand).toHaveLength(1); // no change
    expect(state.pendingLogs.some((l) => l.includes("skipped"))).toBe(true);
  });
});

// ─── executeEffect: discard_or_flip_self ─────────────────────────────────────

describe("executeEffect — discard_or_flip_self (spr_1 start)", () => {
  it("discards the chosen card when targetInstanceId is provided", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "spr_1", face: CardFace.FaceUp };
    const handCard: CardInstance = { instanceId: "h1", defId: "dummy", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);
    state.players[0].hand.push(handCard);

    executeEffect(state, { ...effect("discard_or_flip_self", 0, { targetInstanceId: "h1" }), sourceInstanceId: "src" });

    expect(state.players[0].hand).toHaveLength(0);
    expect(state.trashes[0]).toHaveLength(1);
    expect(src.face).toBe(CardFace.FaceUp); // not flipped
  });

  it("flips self when no targetInstanceId is provided", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "spr_1", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, { ...effect("discard_or_flip_self", 0, {}), sourceInstanceId: "src" });

    expect(src.face).toBe(CardFace.FaceDown); // flipped
  });
});

// ─── executeEffect: new conditional helpers ──────────────────────────────────

describe("executeEffect — Main Unit 2 helper effects", () => {
  it("draw_if_hand_empty draws only when the owner's hand is empty", () => {
    const state = makeState();
    state.decks[0].push(card("d1"), card("d2"));
    state.players[0].deckSize = 2;

    executeEffect(state, effect("draw_if_hand_empty", 0, { amount: 1 }));
    expect(state.players[0].hand).toHaveLength(1);

    executeEffect(state, effect("draw_if_hand_empty", 0, { amount: 1 }));
    expect(state.players[0].hand).toHaveLength(1);
  });

  it("draw_if_opponent_higher_in_line draws when the opponent is winning the source line", () => {
    const state = makeState();
    const source: CardInstance = { instanceId: "src", defId: "dummy", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(source);
    state.players[1].lines[0].cards.push({ instanceId: "opp", defId: "spd_3", face: CardFace.FaceUp });
    state.decks[0].push(card("d1"));
    state.players[0].deckSize = 1;

    executeEffect(state, effect("draw_if_opponent_higher_in_line", 0, { amount: 1 }, "src"));

    expect(state.players[0].hand).toHaveLength(1);
  });

  it("flip_self_if_hand_gt flips the source card only when the threshold is exceeded", () => {
    const state = makeState();
    const source: CardInstance = { instanceId: "src", defId: "pea_6", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(source);
    state.players[0].hand.push(card("h1"), card("h2"));

    executeEffect(state, effect("flip_self_if_hand_gt", 0, { threshold: 1 }, "src"));
    expect(source.face).toBe(CardFace.FaceDown);

    source.face = CardFace.FaceUp;
    state.players[0].hand.splice(1, 1);
    executeEffect(state, effect("flip_self_if_hand_gt", 0, { threshold: 1 }, "src"));
    expect(source.face).toBe(CardFace.FaceUp);
  });
});

// ─── executeEffect: flip ──────────────────────────────────────────────────────

describe("executeEffect — flip", () => {
  // Helper: build a flip PendingEffect with optional sourceInstanceId
  function flipEffect(
    targets: string | undefined,
    opts: { targetInstanceId?: string; optional?: boolean; draw?: number; count?: number } = {},
    sourceInstanceId?: string
  ): PendingEffect {
    const payload: Record<string, unknown> = {};
    if (targets !== undefined) payload.targets = targets;
    if (opts.targetInstanceId !== undefined) payload.targetInstanceId = opts.targetInstanceId;
    if (opts.optional) payload.optional = true;
    if (opts.draw) payload.draw = opts.draw;
    if (opts.count !== undefined) payload.count = opts.count;
    return { ...effect("flip", 0, payload), sourceInstanceId };
  }

  // ─── any_card ──────────────────────────────────────────────────────────────

  it("any_card: flips a face-up card to face-down", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(target);

    executeEffect(state, flipEffect("any_card", { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceDown);
  });

  it("any_card: flips a face-down card to face-up", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceDown);
    state.players[0].lines[0].cards.push(target);

    executeEffect(state, flipEffect("any_card", { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceUp);
  });

  it("any_card: queues face-up effects when flipping a card from face-down (mtl_0 has immediate flip)", () => {
    const state = makeState();
    const target: CardInstance = { instanceId: "t1", defId: "mtl_0", face: CardFace.FaceDown };
    state.players[0].lines[0].cards.push(target);

    executeEffect(state, flipEffect("any_card", { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceUp);
    expect(state.effectQueue.some((e) => e.type === "flip")).toBe(true);
  });

  it("any_card optional: skips without flipping when no targetId provided", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(target);

    executeEffect(state, flipEffect("any_card", { optional: true }));

    expect(target.face).toBe(CardFace.FaceUp);
    expect(state.pendingLogs.some((l) => l.includes("skipped"))).toBe(true);
  });

  it("any_card with draw bonus: draws after flipping (fir_0 style)", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(target);
    state.decks[0].push(card("d1"), card("d2"));
    state.players[0].deckSize = 2;

    executeEffect(state, flipEffect("any_card", { targetInstanceId: "t1", draw: 2 }));

    expect(target.face).toBe(CardFace.FaceDown);
    expect(state.players[0].hand).toHaveLength(2);
  });

  it("any_card: rejects covered targets", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceUp);
    const cover = card("cover", CardFace.FaceDown);
    state.players[0].lines[0].cards.push(target, cover);

    executeEffect(state, flipEffect("any_card", { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceUp);
  });

  it("any_card: does not flip cards with cannot_be_flipped", () => {
    const state = makeState();
    const target: CardInstance = { instanceId: "ice", defId: "ice_4", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(target);

    executeEffect(state, flipEffect("any_card", { targetInstanceId: "ice" }));

    expect(target.face).toBe(CardFace.FaceUp);
    expect(state.pendingLogs.some((l) => l.includes("cannot be flipped"))).toBe(true);
  });

  // ─── any_other ─────────────────────────────────────────────────────────────

  it("any_other: flips a card that is not the source card", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "dummy", face: CardFace.FaceUp };
    const target = card("t1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src, target);

    executeEffect(state, flipEffect("any_other", { targetInstanceId: "t1" }, "src"));

    expect(target.face).toBe(CardFace.FaceDown);
  });

  it("any_other: logs and skips when targeting the source card itself", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "dummy", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, flipEffect("any_other", { targetInstanceId: "src" }, "src"));

    expect(src.face).toBe(CardFace.FaceUp);
    expect(state.pendingLogs.some((l) => l.includes("cannot flip the source"))).toBe(true);
  });

  // ─── opponent_faceup ───────────────────────────────────────────────────────

  it("opponent_faceup: flips an opponent face-up card", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceUp);
    state.players[1].lines[0].cards.push(target);

    executeEffect(state, flipEffect("opponent_faceup", { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceDown);
  });

  it("opponent_faceup: rejects own card", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(target);

    executeEffect(state, flipEffect("opponent_faceup", { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceUp);
    expect(state.pendingLogs.some((l) => l.includes("opponent face-up card"))).toBe(true);
  });

  it("opponent_faceup: rejects opponent face-down card", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceDown);
    state.players[1].lines[0].cards.push(target);

    executeEffect(state, flipEffect("opponent_faceup", { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceDown);
    expect(state.pendingLogs.some((l) => l.includes("opponent face-up card"))).toBe(true);
  });

  // ─── opponent_any ──────────────────────────────────────────────────────────

  it("opponent_any: flips opponent face-up card to face-down", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceUp);
    state.players[1].lines[0].cards.push(target);

    executeEffect(state, flipEffect("opponent_any", { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceDown);
  });

  it("opponent_any: flips opponent face-down card to face-up", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceDown);
    state.players[1].lines[0].cards.push(target);

    executeEffect(state, flipEffect("opponent_any", { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceUp);
  });

  it("opponent_any: rejects own card", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(target);

    executeEffect(state, flipEffect("opponent_any", { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceUp);
  });

  it("opponent_any: rejects covered opponent card", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceUp);
    const cover = card("cover", CardFace.FaceDown);
    state.players[1].lines[0].cards.push(target, cover);

    executeEffect(state, flipEffect("opponent_any", { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceUp);
  });

  // ─── own_faceup_covered ────────────────────────────────────────────────────

  it("own_faceup_covered: flips own face-up covered card", () => {
    const state = makeState();
    const target: CardInstance = { instanceId: "t1", defId: "dummy", face: CardFace.FaceUp };
    const cover = card("cover", CardFace.FaceDown);
    state.players[0].lines[0].cards.push(target, cover);

    executeEffect(state, flipEffect("own_faceup_covered", { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceDown);
  });

  it("own_faceup_covered: rejects face-up uncovered own card (no coveredBy)", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceUp); // coveredBy absent
    state.players[0].lines[0].cards.push(target);

    executeEffect(state, flipEffect("own_faceup_covered", { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceUp);
    expect(state.pendingLogs.some((l) => l.includes("own face-up covered card"))).toBe(true);
  });

  // ─── any_facedown (optional) ───────────────────────────────────────────────

  it("any_facedown: flips a face-down card to face-up", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceDown);
    state.players[0].lines[0].cards.push(target);

    executeEffect(state, flipEffect("any_facedown", { targetInstanceId: "t1", optional: true }));

    expect(target.face).toBe(CardFace.FaceUp);
  });

  it("any_facedown: rejects a face-up card", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(target);

    executeEffect(state, flipEffect("any_facedown", { targetInstanceId: "t1", optional: true }));

    expect(target.face).toBe(CardFace.FaceUp);
    expect(state.pendingLogs.some((l) => l.includes("face-down card"))).toBe(true);
  });

  it("any_facedown: rejects covered face-down card", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceDown);
    const cover = card("cover", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(target, cover);

    executeEffect(state, flipEffect("any_facedown", { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceDown);
  });

  it("any_facedown optional: skips when no targetId provided", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceDown);
    state.players[0].lines[0].cards.push(target);

    executeEffect(state, flipEffect("any_facedown", { optional: true }));

    expect(target.face).toBe(CardFace.FaceDown);
    expect(state.pendingLogs.some((l) => l.includes("skipped"))).toBe(true);
  });

  // ─── own_covered_in_line ───────────────────────────────────────────────────

  it("own_covered_in_line: flips own covered card in same line as source", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "dummy", face: CardFace.FaceUp };
    const target: CardInstance = { instanceId: "t1", defId: "dummy", face: CardFace.FaceDown };
    // target at index 0, src at index 1 — target is covered by src
    state.players[0].lines[0].cards.push(target, src);

    executeEffect(state, flipEffect("own_covered_in_line", { targetInstanceId: "t1" }, "src"));

    expect(target.face).toBe(CardFace.FaceUp);
  });

  it("own_covered_in_line: rejects covered card in a different line", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "dummy", face: CardFace.FaceUp };
    const cover = card("cover", CardFace.FaceDown);
    const target: CardInstance = { instanceId: "t1", defId: "dummy", face: CardFace.FaceDown };
    state.players[0].lines[0].cards.push(src);            // source in line 0 (uncovered)
    state.players[0].lines[1].cards.push(target, cover);  // target in line 1 (covered)

    executeEffect(state, flipEffect("own_covered_in_line", { targetInstanceId: "t1" }, "src"));

    expect(target.face).toBe(CardFace.FaceDown);
    expect(state.pendingLogs.some((l) => l.includes("same line"))).toBe(true);
  });

  // ─── own_faceup_others (auto) ──────────────────────────────────────────────

  it("own_faceup_others: auto-flips all own face-up cards in source line except source", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "dummy", face: CardFace.FaceUp };
    const peer1 = card("p1", CardFace.FaceUp);
    const peer2 = card("p2", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src, peer1, peer2);

    executeEffect(state, flipEffect("own_faceup_others", {}, "src"));

    expect(src.face).toBe(CardFace.FaceUp); // source untouched
    expect(peer1.face).toBe(CardFace.FaceDown);
    expect(peer2.face).toBe(CardFace.FaceDown);
  });

  it("own_faceup_others: does not touch cards in other lines", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "dummy", face: CardFace.FaceUp };
    const otherLine = card("ol1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src);
    state.players[0].lines[1].cards.push(otherLine);

    executeEffect(state, flipEffect("own_faceup_others", {}, "src"));

    expect(otherLine.face).toBe(CardFace.FaceUp);
  });

  it("own_faceup_others: does not flip face-down cards in the source line", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "dummy", face: CardFace.FaceUp };
    const faceDown = card("p1", CardFace.FaceDown);
    state.players[0].lines[0].cards.push(src, faceDown);

    executeEffect(state, flipEffect("own_faceup_others", {}, "src"));

    expect(faceDown.face).toBe(CardFace.FaceDown);
  });

  // ─── all_other_faceup (auto) ───────────────────────────────────────────────

  it("all_other_faceup: flips all face-up cards from both players except the source", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "dummy", face: CardFace.FaceUp };
    const ownCard = card("o1", CardFace.FaceUp);
    const oppCard = card("a1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src, ownCard);
    state.players[1].lines[0].cards.push(oppCard);

    executeEffect(state, flipEffect("all_other_faceup", {}, "src"));

    expect(src.face).toBe(CardFace.FaceUp); // source untouched
    expect(ownCard.face).toBe(CardFace.FaceDown);
    expect(oppCard.face).toBe(CardFace.FaceDown);
  });

  it("all_other_faceup: does not flip face-down cards", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "src", defId: "dummy", face: CardFace.FaceUp };
    const faceDown = card("fd1", CardFace.FaceDown);
    state.players[0].lines[0].cards.push(src);
    state.players[1].lines[0].cards.push(faceDown);

    executeEffect(state, flipEffect("all_other_faceup", {}, "src"));

    expect(faceDown.face).toBe(CardFace.FaceDown);
  });

  // ─── error cases ───────────────────────────────────────────────────────────

  it("logs and skips when no targetId is provided (non-optional)", () => {
    const state = makeState();

    executeEffect(state, flipEffect("any_card", {}));

    expect(state.pendingLogs.some((l) => l.includes("no targetInstanceId"))).toBe(true);
  });

  it("logs and skips when target instanceId is not found in any line", () => {
    const state = makeState();

    executeEffect(state, flipEffect("any_card", { targetInstanceId: "ghost" }));

    expect(state.pendingLogs.some((l) => l.includes("not found"))).toBe(true);
  });

  // ─── count > 1 re-enqueue ─────────────────────────────────────────────────

  it("count 2: enqueues a second flip effect after the first successful flip", () => {
    const state = makeState();
    // uncovered card (no coveredBy) — valid target for any_uncovered
    state.players[1].lines[0].cards.push(card("t1", CardFace.FaceDown));

    executeEffect(state, flipEffect("any_uncovered", { targetInstanceId: "t1", count: 2 }));

    // The original flip went through
    expect(state.players[1].lines[0].cards[0].face).toBe(CardFace.FaceUp);
    // A new pending flip was pushed to the front of the queue
    expect(state.effectQueue).toHaveLength(1);
    expect(state.effectQueue[0].type).toBe("flip");
    // The re-queued effect has count 1 and no targetInstanceId
    expect(state.effectQueue[0].payload.count).toBe(1);
    expect(state.effectQueue[0].payload.targetInstanceId).toBeUndefined();
  });

  it("count 1: does not re-enqueue after flip (default behaviour)", () => {
    const state = makeState();
    state.players[1].lines[0].cards.push(card("t1", CardFace.FaceDown));

    executeEffect(state, flipEffect("opponent_any", { targetInstanceId: "t1", count: 1 }));

    expect(state.effectQueue).toHaveLength(0);
  });

  it("no count field: does not re-enqueue (backward compat)", () => {
    const state = makeState();
    state.players[1].lines[0].cards.push(card("t1", CardFace.FaceDown));

    executeEffect(state, flipEffect("opponent_any", { targetInstanceId: "t1" }));

    expect(state.effectQueue).toHaveLength(0);
  });

  // ─── any_uncovered ─────────────────────────────────────────────────────────

  it("any_uncovered: flips a top-of-stack card (no coveredBy)", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceDown);
    state.players[0].lines[0].cards.push(target);

    executeEffect(state, flipEffect("any_uncovered", { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceUp);
  });

  it("any_uncovered: allows flipping the source card itself", () => {
    const state = makeState();
    const src = card("src", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, flipEffect("any_uncovered", { targetInstanceId: "src" }, "src"));

    expect(src.face).toBe(CardFace.FaceDown);
  });

  it("any_uncovered: rejects a covered card", () => {
    const state = makeState();
    const bottom: CardInstance = { instanceId: "bot", defId: "dummy", face: CardFace.FaceDown };
    const top = card("top", CardFace.FaceDown);
    // bottom is at index 0 with top above it — so bottom is covered
    state.players[0].lines[0].cards.push(bottom, top);

    executeEffect(state, flipEffect("any_uncovered", { targetInstanceId: "bot" }));

    expect(bottom.face).toBe(CardFace.FaceDown);
    expect(state.pendingLogs.some((l) => l.includes("uncovered"))).toBe(true);
  });
});

// ─── executeEffect: opponent_discard_reveal ───────────────────────────────────

describe("executeEffect — opponent_discard_reveal", () => {
  it("queues discard sub-effects for the opponent to choose", () => {
    const state = makeState();
    state.players[1].hand.push(card("c1"), card("c2"), card("c3"));

    executeEffect(state, effect("opponent_discard_reveal", 0, { amount: 2 }));

    const discardEffects = state.effectQueue.filter(e => e.type === "discard" && e.ownerIndex === 1);
    expect(discardEffects).toHaveLength(2);
    // Cards are not removed yet — opponent must choose
    expect(state.players[1].hand).toHaveLength(3);
  });

  it("sets revealOpponentHandFor to the effect owner when opponent resolves discard", () => {
    const state = makeState();
    state.players[1].hand.push(card("c1"));

    executeEffect(state, effect("opponent_discard_reveal", 0, { amount: 1 }));

    // Simulate opponent choosing c1 to discard
    const queued = state.effectQueue.find(e => e.type === "discard" && e.ownerIndex === 1)!;
    executeEffect(state, { ...queued, payload: { ...queued.payload, targetInstanceId: "c1" } });

    expect(state.revealOpponentHandFor).toBe(0);
  });

  it("does not touch the owner's hand", () => {
    const state = makeState();
    state.players[0].hand.push(card("c1"));
    state.players[1].hand.push(card("c2"));

    executeEffect(state, effect("opponent_discard_reveal", 0, { amount: 1 }));

    expect(state.players[0].hand).toHaveLength(1);
  });
});

// ─── executeEffect: shift_flip_self ──────────────────────────────────────────

describe("executeEffect — shift_flip_self", () => {
  it("moves a card to the target line and flips the source card", () => {
    const state = makeState();
    const src = card("src", CardFace.FaceUp);
    const target = card("t1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src, target);

    executeEffect(state, effect("shift_flip_self", 0, { targetInstanceId: "t1", targetLineIndex: 1 }, "src"));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
    expect(state.players[0].lines[1].cards).toHaveLength(1);
    expect(state.players[0].lines[1].cards[0].instanceId).toBe("t1");
    expect(src.face).toBe(CardFace.FaceDown);
  });

  it("skips entirely when no targetInstanceId provided (optional)", () => {
    const state = makeState();
    const src = card("src", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, effect("shift_flip_self", 0, {}, "src"));

    expect(src.face).toBe(CardFace.FaceUp);
    expect(state.players[0].lines[0].cards).toHaveLength(1);
  });

  it("does not flip source if card is already in the target line", () => {
    const state = makeState();
    const src = card("src", CardFace.FaceUp);
    const target = card("t1", CardFace.FaceUp);
    state.players[0].lines[1].cards.push(src, target);

    executeEffect(state, effect("shift_flip_self", 0, { targetInstanceId: "t1", targetLineIndex: 1 }, "src"));

    expect(src.face).toBe(CardFace.FaceUp);
    expect(state.players[0].lines[1].cards).toHaveLength(2);
  });

  it("logs and skips when target card not found in own lines", () => {
    const state = makeState();
    const src = card("src", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, effect("shift_flip_self", 0, { targetInstanceId: "ghost", targetLineIndex: 1 }, "src"));

    expect(src.face).toBe(CardFace.FaceUp);
    expect(state.pendingLogs.some((l) => l.includes("not found"))).toBe(true);
  });

  it("rejects an invalid targetLineIndex", () => {
    const state = makeState();
    const src = card("src", CardFace.FaceUp);
    const target = card("t1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src, target);

    executeEffect(state, effect("shift_flip_self", 0, { targetInstanceId: "t1", targetLineIndex: 5 }, "src"));

    expect(src.face).toBe(CardFace.FaceUp);
    expect(state.players[0].lines[0].cards).toHaveLength(2);
  });
});

// ─── executeEffect: delete ────────────────────────────────────────────────────

describe("executeEffect — delete", () => {
  it("any_card: removes the target card and puts it in trash", () => {
    const state = makeState();
    const c1 = card("c1", CardFace.FaceUp);
    state.players[1].lines[0].cards.push(c1);

    executeEffect(state, effect("delete", 0, { targets: "any_card", targetInstanceId: "c1" }));

    expect(state.players[1].lines[0].cards).toHaveLength(0);
    expect(state.trashes[1]).toHaveLength(1);
    expect(state.players[1].trashSize).toBe(1);
  });

  it("any_card: rejects covered targets", () => {
    const state = makeState();
    const c1 = card("c1", CardFace.FaceUp);
    const cover = card("cover", CardFace.FaceDown);
    state.players[1].lines[0].cards.push(c1, cover);

    executeEffect(state, effect("delete", 0, { targets: "any_card", targetInstanceId: "c1" }));

    expect(state.players[1].lines[0].cards).toHaveLength(2);
    expect(state.trashes[1]).toHaveLength(0);
    expect(state.pendingLogs.some((l) => l.includes("must be uncovered"))).toBe(true);
  });

  it("any_facedown: deletes a face-down card", () => {
    const state = makeState();
    const c1 = card("c1", CardFace.FaceDown);
    state.players[0].lines[0].cards.push(c1);

    executeEffect(state, effect("delete", 0, { targets: "any_facedown", targetInstanceId: "c1" }));

    expect(state.players[0].lines[0].cards).toHaveLength(0);
  });

  it("any_facedown: rejects a face-up card", () => {
    const state = makeState();
    state.players[0].lines[0].cards.push(card("c1", CardFace.FaceUp));

    executeEffect(state, effect("delete", 0, { targets: "any_facedown", targetInstanceId: "c1" }));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
  });

  it("any_facedown: rejects covered face-down card", () => {
    const state = makeState();
    const target = card("c1", CardFace.FaceDown);
    const cover = card("cover", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(target, cover);

    executeEffect(state, effect("delete", 0, { targets: "any_facedown", targetInstanceId: "c1" }));

    expect(state.players[0].lines[0].cards).toHaveLength(2);
    expect(state.trashes[0]).toHaveLength(0);
    expect(state.pendingLogs.some((l) => l.includes("must be uncovered"))).toBe(true);
  });

  it("value_0_or_1: deletes a value-0 card", () => {
    const state = makeState();
    const c1: CardInstance = { instanceId: "c1", defId: "hat_0", face: CardFace.FaceUp }; // value 0
    state.players[0].lines[0].cards.push(c1);

    executeEffect(state, effect("delete", 0, { targets: "value_0_or_1", targetInstanceId: "c1" }));

    expect(state.players[0].lines[0].cards).toHaveLength(0);
  });

  it("value_0_or_1: rejects covered value-0 card", () => {
    const state = makeState();
    const c1: CardInstance = { instanceId: "c1", defId: "hat_0", face: CardFace.FaceUp };
    const cover = card("cover", CardFace.FaceDown);
    state.players[0].lines[0].cards.push(c1, cover);

    executeEffect(state, effect("delete", 0, { targets: "value_0_or_1", targetInstanceId: "c1" }));

    expect(state.players[0].lines[0].cards).toHaveLength(2);
    expect(state.trashes[0]).toHaveLength(0);
    expect(state.pendingLogs.some((l) => l.includes("must be uncovered"))).toBe(true);
  });

  it("value_0_or_1: rejects a value-3 card", () => {
    const state = makeState();
    const c1: CardInstance = { instanceId: "c1", defId: "dth_3", face: CardFace.FaceUp }; // value 3
    state.players[0].lines[0].cards.push(c1);

    executeEffect(state, effect("delete", 0, { targets: "value_0_or_1", targetInstanceId: "c1" }));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
  });

  it("each_other_line: deletes top card from each non-source line", () => {
    const state = makeState();
    const src = card("src", CardFace.FaceUp);
    const a = card("a", CardFace.FaceUp);
    const b = card("b", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src);
    state.players[0].lines[1].cards.push(a);
    state.players[0].lines[2].cards.push(b);

    executeEffect(state, effect("delete", 0, { targets: "each_other_line" }, "src"));

    expect(state.players[0].lines[0].cards).toHaveLength(1); // src untouched
    expect(state.players[0].lines[1].cards).toHaveLength(0);
    expect(state.players[0].lines[2].cards).toHaveLength(0);
    expect(state.trashes[0]).toHaveLength(2);
  });

  it("line_values_1_2: deletes all value-1/2 cards in the chosen line", () => {
    const state = makeState();
    // plg_1 value=1, lif_1 value=1, lif_2 value=2, spd_1 value=2
    state.players[0].lines[0].cards.push(
      { instanceId: "a", defId: "plg_1", face: CardFace.FaceUp }, // value 1
      { instanceId: "b", defId: "spd_1", face: CardFace.FaceUp }, // value 2 (wait spd_1 is draw 2 — we just need any val 1 or 2)
      { instanceId: "c", defId: "drk_3", face: CardFace.FaceUp }, // value 3 — kept
    );

    executeEffect(state, effect("delete", 0, { targets: "line_values_1_2", targetLineIndex: 0 }));

    expect(state.players[0].lines[0].cards.some((c) => c.instanceId === "c")).toBe(true);
    expect(state.players[0].lines[0].cards.some((c) => c.instanceId === "a")).toBe(false);
    expect(state.players[0].lines[0].cards.some((c) => c.instanceId === "b")).toBe(false);
  });

  it("line_8plus_cards: clears a line that has 8+ cards", () => {
    const state = makeState();
    for (let i = 0; i < 8; i++) state.players[0].lines[0].cards.push(card(`c${i}`, CardFace.FaceDown));

    executeEffect(state, effect("delete", 0, { targets: "line_8plus_cards", targetLineIndex: 0 }));

    expect(state.players[0].lines[0].cards).toHaveLength(0);
    expect(state.trashes[0]).toHaveLength(8);
  });

  it("line_8plus_cards: does nothing if line has fewer than 8 cards", () => {
    const state = makeState();
    for (let i = 0; i < 5; i++) state.players[0].lines[0].cards.push(card(`c${i}`, CardFace.FaceDown));

    executeEffect(state, effect("delete", 0, { targets: "line_8plus_cards", targetLineIndex: 0 }));

    expect(state.players[0].lines[0].cards).toHaveLength(5);
  });

  it("logs and skips when no targetInstanceId provided for single-pick", () => {
    const state = makeState();

    executeEffect(state, effect("delete", 0, { targets: "any_card" }));

    expect(state.pendingLogs.some((l) => l.includes("no targetInstanceId"))).toBe(true);
  });
});

// ─── executeEffect: delete_highest_both ──────────────────────────────────────

describe("executeEffect — delete_highest_both", () => {
  it("deletes the highest-value face-up card from each player", () => {
    const state = makeState();
    // drk_3 value=3, spd_1 value=2 (wait, need to look at actual card values)
    // Use hat_2 (value=2), spd_3 (value=3) for p0 and lgt_2 (value=2) for p1
    state.players[0].lines[0].cards.push(
      { instanceId: "a", defId: "plg_0", face: CardFace.FaceUp }, // value 0
      { instanceId: "b", defId: "drk_3", face: CardFace.FaceUp }, // value 3
    );
    state.players[1].lines[0].cards.push(
      { instanceId: "c", defId: "lgt_4", face: CardFace.FaceUp }, // value 4
    );

    executeEffect(state, effect("delete_highest_both", 0));

    expect(state.players[0].lines[0].cards.some((c) => c.instanceId === "b")).toBe(false);
    expect(state.players[0].lines[0].cards.some((c) => c.instanceId === "a")).toBe(true);
    expect(state.players[1].lines[0].cards).toHaveLength(0);
  });

  it("skips a player with no face-up cards", () => {
    const state = makeState();
    state.players[0].lines[0].cards.push(card("a", CardFace.FaceDown));

    executeEffect(state, effect("delete_highest_both", 0));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
  });
});

// ─── executeEffect: draw_then_delete_self ────────────────────────────────────

describe("executeEffect — draw_then_delete_self", () => {
  it("draws 1, deletes the target, then deletes self", () => {
    const state = makeState();
    state.decks[0].push(card("d1"));
    state.players[0].deckSize = 1;
    const src = card("src", CardFace.FaceUp);
    const target = card("t1", CardFace.FaceUp);
    state.players[1].lines[0].cards.push(target);
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, effect("draw_then_delete_self", 0, { targetInstanceId: "t1" }, "src"));

    expect(state.players[0].hand).toHaveLength(1);
    expect(state.players[1].lines[0].cards).toHaveLength(0);
    expect(state.players[0].lines[0].cards).toHaveLength(0); // src deleted
  });

  it("skips entirely when no targetInstanceId (opted out)", () => {
    const state = makeState();
    const src = card("src", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, effect("draw_then_delete_self", 0, {}, "src"));

    expect(state.players[0].hand).toHaveLength(0);
    expect(state.players[0].lines[0].cards).toHaveLength(1);
  });
});

// ─── executeEffect: discard_to_delete ────────────────────────────────────────

describe("executeEffect — discard_to_delete", () => {
  it("discards one hand card and deletes the target", () => {
    const state = makeState();
    state.players[0].hand.push(card("h1"));
    state.players[1].lines[0].cards.push(card("t1", CardFace.FaceUp));

    executeEffect(state, effect("discard_to_delete", 0, { discardInstanceId: "h1", targetInstanceId: "t1" }));

    expect(state.players[0].hand).toHaveLength(0);
    expect(state.trashes[0]).toHaveLength(1);
    expect(state.players[1].lines[0].cards).toHaveLength(0);
    expect(state.trashes[1]).toHaveLength(1);
  });

  it("skips when no discardInstanceId provided", () => {
    const state = makeState();
    state.players[1].lines[0].cards.push(card("t1", CardFace.FaceUp));

    executeEffect(state, effect("discard_to_delete", 0, { targetInstanceId: "t1" }));

    expect(state.players[1].lines[0].cards).toHaveLength(1);
  });
});

// ─── executeEffect: discard_to_return ────────────────────────────────────────

describe("executeEffect — discard_to_return", () => {
  it("discards one hand card and returns the target to owner's hand", () => {
    const state = makeState();
    state.players[0].hand.push(card("h1"));
    state.players[1].lines[0].cards.push(card("t1", CardFace.FaceUp));

    executeEffect(state, effect("discard_to_return", 0, { discardInstanceId: "h1", targetInstanceId: "t1" }));

    expect(state.players[0].hand).toHaveLength(1);
    expect(state.players[0].hand[0].instanceId).toBe("t1");
    expect(state.players[1].lines[0].cards).toHaveLength(0);
    expect(state.trashes[0]).toHaveLength(1);
  });

  it("skips when no discardInstanceId provided", () => {
    const state = makeState();
    state.players[1].lines[0].cards.push(card("t1", CardFace.FaceUp));

    executeEffect(state, effect("discard_to_return", 0, { targetInstanceId: "t1" }));

    expect(state.players[1].lines[0].cards).toHaveLength(1);
  });
});

// ─── executeEffect: discard_to_draw ──────────────────────────────────────────

describe("executeEffect — discard_to_draw", () => {
  it("discards N cards and draws N+1", () => {
    const state = makeState();
    state.players[0].hand.push(card("h1"), card("h2"));
    for (let i = 0; i < 5; i++) state.decks[0].push(card(`d${i}`));
    state.players[0].deckSize = 5;

    executeEffect(state, effect("discard_to_draw", 0, { discardIds: ["h1", "h2"] }));

    expect(state.trashes[0]).toHaveLength(2);
    expect(state.players[0].hand).toHaveLength(3); // drew 2+1
  });

  it("skips when no discardIds provided", () => {
    const state = makeState();
    state.players[0].hand.push(card("h1"));

    executeEffect(state, effect("discard_to_draw", 0, {}));

    expect(state.players[0].hand).toHaveLength(1);
  });
});

// ─── executeEffect: discard_to_flip ──────────────────────────────────────────

describe("executeEffect — discard_to_flip", () => {
  it("discards one card and flips the target", () => {
    const state = makeState();
    state.players[0].hand.push(card("h1"));
    const target = card("t1", CardFace.FaceDown);
    state.players[1].lines[0].cards.push(target);

    executeEffect(state, effect("discard_to_flip", 0, { discardInstanceId: "h1", targetInstanceId: "t1" }));

    expect(state.trashes[0]).toHaveLength(1);
    expect(target.face).toBe(CardFace.FaceUp);
  });

  it("skips when no discardInstanceId provided", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceDown);
    state.players[1].lines[0].cards.push(target);

    executeEffect(state, effect("discard_to_flip", 0, { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceDown);
  });
});

// ─── executeEffect: discard_to_opp_discard_more ──────────────────────────────

describe("executeEffect — discard_to_opp_discard_more", () => {
  it("discards N own cards; opponent discards N+1", () => {
    const state = makeState();
    state.players[0].hand.push(card("h1"), card("h2"));
    state.players[1].hand.push(card("o1"), card("o2"), card("o3"), card("o4"));

    executeEffect(state, effect("discard_to_opp_discard_more", 0, { discardIds: ["h1", "h2"] }));

    expect(state.trashes[0]).toHaveLength(2);
    expect(state.players[1].hand).toHaveLength(1); // 4 - 3
  });

  it("skips when no discardIds", () => {
    const state = makeState();
    state.players[1].hand.push(card("o1"));

    executeEffect(state, effect("discard_to_opp_discard_more", 0, {}));

    expect(state.players[1].hand).toHaveLength(1);
  });
});

// ─── executeEffect: reveal_hand ──────────────────────────────────────────────

describe("executeEffect — reveal_hand", () => {
  it("sets revealOpponentHandFor to the owner", () => {
    const state = makeState();

    executeEffect(state, effect("reveal_hand", 0));

    expect(state.revealOpponentHandFor).toBe(0);
  });
});

// ─── executeEffect: swap_protocols ───────────────────────────────────────────

describe("executeEffect — swap_protocols", () => {
  it("swaps the lineIndex of two protocols", () => {
    const state = makeState();
    state.players[0].protocols = [
      { protocolId: "proto_apy", status: ProtocolStatus.Loading, lineIndex: 0 },
      { protocolId: "proto_drk", status: ProtocolStatus.Loading, lineIndex: 1 },
      { protocolId: "proto_fir", status: ProtocolStatus.Loading, lineIndex: 2 },
    ];

    executeEffect(state, effect("swap_protocols", 0, { swapProtocolIds: ["proto_apy", "proto_drk"] }));

    expect(state.players[0].protocols.find((p) => p.protocolId === "proto_apy")!.lineIndex).toBe(1);
    expect(state.players[0].protocols.find((p) => p.protocolId === "proto_drk")!.lineIndex).toBe(0);
  });

  it("logs and skips when fewer than 2 IDs provided", () => {
    const state = makeState();

    executeEffect(state, effect("swap_protocols", 0, { swapProtocolIds: ["proto_apy"] }));

    expect(state.pendingLogs.some((l) => l.includes("exactly 2"))).toBe(true);
  });

  it("logs and skips when a protocol ID is not found", () => {
    const state = makeState();

    executeEffect(state, effect("swap_protocols", 0, { swapProtocolIds: ["proto_apy", "proto_ghost"] }));

    expect(state.pendingLogs.some((l) => l.includes("not found"))).toBe(true);
  });
});

// ─── executeEffect: discard_to_delete2 ───────────────────────────────────────

describe("executeEffect — discard_to_delete2", () => {
  it("queues 3 discard sub-effects + 2 delete sub-effects when hand has 3+ cards", () => {
    const state = makeState();
    state.players[0].hand.push(card("h1"), card("h2"), card("h3"));

    executeEffect(state, effect("discard_to_delete2", 0, { discard: 3 }));

    const discardEffects = state.effectQueue.filter(e => e.type === "discard" && e.ownerIndex === 0);
    const deleteEffects  = state.effectQueue.filter(e => e.type === "delete" && e.ownerIndex === 0);
    expect(discardEffects).toHaveLength(3);
    expect(deleteEffects).toHaveLength(2);
    expect(deleteEffects[0].payload.targets).toBe("any_card");
    // Cards not yet removed
    expect(state.players[0].hand).toHaveLength(3);
  });

  it("queues only as many discards as cards in hand when hand has fewer than 3", () => {
    const state = makeState();
    state.players[0].hand.push(card("h1"));

    executeEffect(state, effect("discard_to_delete2", 0, { discard: 3 }));

    const discardEffects = state.effectQueue.filter(e => e.type === "discard" && e.ownerIndex === 0);
    const deleteEffects  = state.effectQueue.filter(e => e.type === "delete" && e.ownerIndex === 0);
    expect(discardEffects).toHaveLength(1);
    expect(deleteEffects).toHaveLength(2);
  });

  it("still queues 2 delete sub-effects even when hand is empty", () => {
    const state = makeState();
    // hand is empty

    executeEffect(state, effect("discard_to_delete2", 0, { discard: 3 }));

    const discardEffects = state.effectQueue.filter(e => e.type === "discard" && e.ownerIndex === 0);
    const deleteEffects  = state.effectQueue.filter(e => e.type === "delete" && e.ownerIndex === 0);
    expect(discardEffects).toHaveLength(0);
    expect(deleteEffects).toHaveLength(2);
  });
});

// ─── executeEffect: flip_draw_equal ──────────────────────────────────────────

describe("executeEffect — flip_draw_equal", () => {
  it("flips a face-down card and draws equal to its value", () => {
    const state = makeState();
    // lgt_1 has value 1
    const target: CardInstance = { instanceId: "t1", defId: "lgt_1", face: CardFace.FaceDown };
    state.players[0].lines[0].cards.push(target);
    for (let i = 0; i < 3; i++) state.decks[0].push(card(`d${i}`));
    state.players[0].deckSize = 3;

    executeEffect(state, effect("flip_draw_equal", 0, { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceUp);
    expect(state.players[0].hand).toHaveLength(1); // value 1 → draw 1
  });

  it("flips a face-up card face-down and draws 2 (the face-down displayed value)", () => {
    const state = makeState();
    // drk_3 has value 3, but after flipping face-down the displayed value is 2
    const target: CardInstance = { instanceId: "t1", defId: "drk_3", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(target);
    for (let i = 0; i < 5; i++) state.decks[0].push(card(`d${i}`));
    state.players[0].deckSize = 5;

    executeEffect(state, effect("flip_draw_equal", 0, { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceDown);
    expect(state.players[0].hand).toHaveLength(2); // face-down value = 2
  });

  it("logs and skips when no targetInstanceId", () => {
    const state = makeState();

    executeEffect(state, effect("flip_draw_equal", 0, {}));

    expect(state.pendingLogs.some((l) => l.includes("no targetInstanceId"))).toBe(true);
  });

  it("uses facedown_value_override (drk_2) when flipping face-up to face-down", () => {
    const state = makeState();
    // drk_2 face-up in the same line overrides face-down value to 4
    const overrider: CardInstance = { instanceId: "drk2", defId: "drk_2", face: CardFace.FaceUp };
    const target: CardInstance = { instanceId: "t1", defId: "lgt_1", face: CardFace.FaceUp };
    state.players[0].lines[0].cards.push(overrider, target);
    for (let i = 0; i < 5; i++) state.decks[0].push(card(`d${i}`));
    state.players[0].deckSize = 5;

    executeEffect(state, effect("flip_draw_equal", 0, { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceDown);
    expect(state.players[0].hand).toHaveLength(4); // facedown override = 4
  });
});

// ─── executeEffect: reveal_own_hand ──────────────────────────────────────────

describe("executeEffect — reveal_own_hand", () => {
  it("sets revealHandCardFor so the opponent can see the card", () => {
    const state = makeState();
    state.players[0].hand.push(card("h1"));

    executeEffect(state, effect("reveal_own_hand", 0, { targetInstanceId: "h1" }));

    expect(state.revealHandCardFor).toEqual({ viewerIndex: 1, cardId: "h1" });
  });

  it("logs and skips when no card chosen", () => {
    const state = makeState();

    executeEffect(state, effect("reveal_own_hand", 0, {}));

    expect(state.revealHandCardFor).toBeNull();
    expect(state.pendingLogs.some((l) => l.includes("no card chosen"))).toBe(true);
  });

  it("logs and skips when card not in hand", () => {
    const state = makeState();

    executeEffect(state, effect("reveal_own_hand", 0, { targetInstanceId: "ghost" }));

    expect(state.revealHandCardFor).toBeNull();
  });
});

// ─── executeEffect: reveal_shift_or_flip ─────────────────────────────────────

describe("executeEffect — reveal_shift_or_flip", () => {
  it("flips a face-down card face-up when action=flip", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceDown);
    state.players[1].lines[0].cards.push(target);

    executeEffect(state, effect("reveal_shift_or_flip", 0, { targetInstanceId: "t1", action: "flip" }));

    expect(target.face).toBe(CardFace.FaceUp);
    expect(state.pendingLogs.some((l) => l.includes("flipped"))).toBe(true);
  });

  it("shifts a face-down card to the chosen line when action=shift", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceDown);
    state.players[1].lines[0].cards.push(target);

    executeEffect(state, effect("reveal_shift_or_flip", 0, { targetInstanceId: "t1", action: "shift", targetLineIndex: 2 }));

    expect(state.players[1].lines[0].cards).toHaveLength(0);
    expect(state.players[1].lines[2].cards[0].instanceId).toBe("t1");
    expect(state.pendingLogs.some((l) => l.includes("shifted"))).toBe(true);
  });

  it("skips when no action provided", () => {
    const state = makeState();
    const target = card("t1", CardFace.FaceDown);
    state.players[1].lines[0].cards.push(target);

    executeEffect(state, effect("reveal_shift_or_flip", 0, { targetInstanceId: "t1" }));

    expect(target.face).toBe(CardFace.FaceDown);
  });

  it("rejects a face-up card", () => {
    const state = makeState();
    state.players[1].lines[0].cards.push(card("t1", CardFace.FaceUp));

    executeEffect(state, effect("reveal_shift_or_flip", 0, { targetInstanceId: "t1", action: "flip" }));

    expect(state.pendingLogs.some((l) => l.includes("not face-down"))).toBe(true);
  });
});

// ─── executeEffect: play_card ─────────────────────────────────────────────────

describe("executeEffect — play_card", () => {
  it("sets pendingBonusPlay with anyLine=false", () => {
    const state = makeState();

    executeEffect(state, effect("play_card", 0));

    expect(state.pendingBonusPlay).toEqual({ anyLine: false });
  });
});

// ─── executeEffect: play_any_line ─────────────────────────────────────────────

describe("executeEffect — play_any_line", () => {
  it("draws 2 and sets pendingBonusPlay with anyLine=true", () => {
    const state = makeState();
    for (let i = 0; i < 3; i++) state.decks[0].push(card(`d${i}`));
    state.players[0].deckSize = 3;

    executeEffect(state, effect("play_any_line", 0, { draw: 2 }));

    expect(state.players[0].hand).toHaveLength(2);
    expect(state.pendingBonusPlay).toEqual({ anyLine: true });
  });
});

// ─── executeEffect: shift ─────────────────────────────────────────────────────

describe("executeEffect — shift (opponent_covered)", () => {
  it("moves an opponent's covered card to a different opponent line", () => {
    const state = makeState();
    const bottom: CardInstance = { instanceId: "b1", defId: "dummy", face: CardFace.FaceDown };
    const top: CardInstance = { instanceId: "t1", defId: "dummy", face: CardFace.FaceDown };
    // bottom at index 0 is covered by top at index 1
    state.players[1].lines[0].cards.push(bottom, top);

    executeEffect(state, effect("shift", 0, { targets: "opponent_covered", targetInstanceId: "b1", targetLineIndex: 2 }));

    expect(state.players[1].lines[0].cards.map((c) => c.instanceId)).not.toContain("b1");
    expect(state.players[1].lines[2].cards[0].instanceId).toBe("b1");
  });

  it("rejects if target is own card", () => {
    const state = makeState();
    const c: CardInstance = { instanceId: "c1", defId: "dummy", face: CardFace.FaceDown };
    const covering = card("x", CardFace.FaceDown);
    state.players[0].lines[0].cards.push(c, covering);

    executeEffect(state, effect("shift", 0, { targets: "opponent_covered", targetInstanceId: "c1", targetLineIndex: 1 }));

    expect(state.players[0].lines[0].cards).toHaveLength(2); // nothing moved
    expect(state.pendingLogs.some((l) => l.includes("must target opponent"))).toBe(true);
  });

  it("rejects if target is not covered", () => {
    const state = makeState();
    state.players[1].lines[0].cards.push(card("c1", CardFace.FaceDown));

    executeEffect(state, effect("shift", 0, { targets: "opponent_covered", targetInstanceId: "c1", targetLineIndex: 2 }));

    expect(state.players[1].lines[0].cards).toHaveLength(1);
    expect(state.pendingLogs.some((l) => l.includes("must be covered"))).toBe(true);
  });
});

describe("executeEffect — shift (last_targeted, player-chosen dest)", () => {
  it("shifts the last targeted card to the player-chosen destination line (drk_1 style)", () => {
    const state = makeState();
    const target = card("opp1", CardFace.FaceDown);
    state.players[1].lines[0].cards.push(target);
    state.lastTargetedInstanceId = "opp1";

    executeEffect(state, effect("shift", 0, { targets: "last_targeted", targetLineIndex: 2 }));

    expect(state.players[1].lines[0].cards).toHaveLength(0);
    expect(state.players[1].lines[2].cards[0].instanceId).toBe("opp1");
  });

  it("logs and skips when lastTargetedInstanceId is null", () => {
    const state = makeState();
    state.players[1].lines[0].cards.push(card("opp1"));
    state.lastTargetedInstanceId = null;

    executeEffect(state, effect("shift", 0, { targets: "last_targeted", targetLineIndex: 1 }));

    expect(state.players[1].lines[0].cards).toHaveLength(1);
    expect(state.pendingLogs.some((l) => l.includes("no last targeted"))).toBe(true);
  });
});

describe("executeEffect — shift (last_targeted, auto source-line dest)", () => {
  it("shifts last targeted card to the source card's line (grv_2 style)", () => {
    const state = makeState();
    const src = card("grv2", CardFace.FaceUp);
    state.players[0].lines[1].cards.push(src); // source in line 1
    const target = card("opp1", CardFace.FaceDown);
    state.players[1].lines[2].cards.push(target);
    state.lastTargetedInstanceId = "opp1";

    executeEffect(state, effect("shift", 0, { targets: "last_targeted", toSourceLine: true }, "grv2"));

    // target should now be in line 1 (the source's line) within its owner's (P1) lines
    expect(state.players[1].lines[2].cards).toHaveLength(0);
    expect(state.players[1].lines[1].cards[0].instanceId).toBe("opp1");
  });
});

describe("executeEffect — shift (any_facedown, player-chosen dest)", () => {
  it("shifts a face-down card to player-chosen line (drk_4 style)", () => {
    const state = makeState();
    const target = card("c1", CardFace.FaceDown);
    state.players[1].lines[0].cards.push(target);

    executeEffect(state, effect("shift", 0, { targets: "any_facedown", targetInstanceId: "c1", targetLineIndex: 2 }));

    expect(state.players[1].lines[0].cards).toHaveLength(0);
    expect(state.players[1].lines[2].cards[0].instanceId).toBe("c1");
  });

  it("rejects a face-up card", () => {
    const state = makeState();
    state.players[1].lines[0].cards.push(card("c1", CardFace.FaceUp));

    executeEffect(state, effect("shift", 0, { targets: "any_facedown", targetInstanceId: "c1", targetLineIndex: 2 }));

    expect(state.players[1].lines[0].cards).toHaveLength(1);
  });
});

describe("executeEffect — shift (any_facedown, toSourceLine)", () => {
  it("shifts a face-down card to the source card's line (grv_4 style)", () => {
    const state = makeState();
    const src = card("grv4", CardFace.FaceUp);
    state.players[0].lines[1].cards.push(src); // source in line 1
    const target = card("fd1", CardFace.FaceDown);
    state.players[1].lines[2].cards.push(target);

    executeEffect(state, effect("shift", 0, { targets: "any_facedown", targetInstanceId: "fd1", toSourceLine: true }, "grv4"));

    expect(state.players[1].lines[2].cards).toHaveLength(0);
    expect(state.players[1].lines[1].cards[0].instanceId).toBe("fd1");
  });
});

describe("executeEffect — shift (own_facedown_in_line)", () => {
  it("moves all face-down cards in source line (both players) to target line (lgt_3 style)", () => {
    const state = makeState();
    const src = card("lgt3", CardFace.FaceUp);
    const fd1 = card("fd1", CardFace.FaceDown);
    const fd2 = card("fd2", CardFace.FaceDown);
    const fu = card("fu1", CardFace.FaceUp);
    const oppFdCovered = card("oppfd1", CardFace.FaceDown);
    const oppTop = card("opptop", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src, fd1, fd2, fu);
    state.players[1].lines[0].cards.push(oppFdCovered, oppTop);

    executeEffect(state, effect("shift", 0, { targets: "own_facedown_in_line", targetLineIndex: 2 }, "lgt3"));

    // Face-down cards from both players in source line move to same-index target line.
    expect(state.players[0].lines[0].cards.map((c) => c.instanceId)).toContain("lgt3");
    expect(state.players[0].lines[0].cards.map((c) => c.instanceId)).toContain("fu1");
    expect(state.players[0].lines[0].cards.map((c) => c.instanceId)).not.toContain("fd1");
    expect(state.players[0].lines[0].cards.map((c) => c.instanceId)).not.toContain("fd2");
    expect(state.players[0].lines[2].cards.map((c) => c.instanceId)).toContain("fd1");
    expect(state.players[0].lines[2].cards.map((c) => c.instanceId)).toContain("fd2");

    expect(state.players[1].lines[0].cards.map((c) => c.instanceId)).toContain("opptop");
    expect(state.players[1].lines[0].cards.map((c) => c.instanceId)).not.toContain("oppfd1");
    expect(state.players[1].lines[2].cards.map((c) => c.instanceId)).toContain("oppfd1");
  });

  it("logs when no targetLineIndex provided", () => {
    const state = makeState();
    state.players[0].lines[0].cards.push(card("src", CardFace.FaceUp), card("fd1", CardFace.FaceDown));

    executeEffect(state, effect("shift", 0, { targets: "own_facedown_in_line" }, "src"));

    expect(state.pendingLogs.some((l) => l.includes("no valid targetLineIndex"))).toBe(true);
  });

  it("moves an opponent uncovered face-down card in the same line", () => {
    const state = makeState();
    const src = card("lgt3", CardFace.FaceUp);
    const oppFdTop = card("oppfdtop", CardFace.FaceDown);
    state.players[0].lines[1].cards.push(src);
    state.players[1].lines[1].cards.push(oppFdTop);

    executeEffect(state, effect("shift", 0, { targets: "own_facedown_in_line", targetLineIndex: 0 }, "lgt3"));

    expect(state.players[1].lines[1].cards.map((c) => c.instanceId)).not.toContain("oppfdtop");
    expect(state.players[1].lines[0].cards.map((c) => c.instanceId)).toContain("oppfdtop");
  });
});

describe("executeEffect — shift (no targets / grv_1 style)", () => {
  it("moves an own card from source line to another line", () => {
    const state = makeState();
    const src = card("grv1", CardFace.FaceUp);
    const mov = card("mov1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src, mov);

    executeEffect(state, effect("shift", 0, { targetInstanceId: "mov1", targetLineIndex: 2 }, "grv1"));

    expect(state.players[0].lines[0].cards.map((c) => c.instanceId)).not.toContain("mov1");
    expect(state.players[0].lines[2].cards[0].instanceId).toBe("mov1");
  });

  it("moves a card FROM another line TO source line", () => {
    const state = makeState();
    const src = card("grv1", CardFace.FaceUp);
    const mov = card("mov1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src);
    state.players[0].lines[2].cards.push(mov);

    // destination = source line = 0
    executeEffect(state, effect("shift", 0, { targetInstanceId: "mov1", targetLineIndex: 0 }, "grv1"));

    expect(state.players[0].lines[2].cards).toHaveLength(0);
    expect(state.players[0].lines[0].cards.map((c) => c.instanceId)).toContain("mov1");
  });

  it("rejects moves that don't involve source line", () => {
    const state = makeState();
    const src = card("grv1", CardFace.FaceUp);
    const mov = card("mov1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src); // source in line 0
    state.players[0].lines[1].cards.push(mov);  // card in line 1

    // Moving from line 1 to line 2 — doesn't involve line 0 (source line)
    executeEffect(state, effect("shift", 0, { targetInstanceId: "mov1", targetLineIndex: 2 }, "grv1"));

    expect(state.players[0].lines[1].cards).toHaveLength(1);
  });

  it("rejects opponent's card", () => {
    const state = makeState();
    const src = card("grv1", CardFace.FaceUp);
    const mov = card("mov1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src);
    state.players[1].lines[0].cards.push(mov);

    executeEffect(state, effect("shift", 0, { targetInstanceId: "mov1", targetLineIndex: 2 }, "grv1"));

    expect(state.players[1].lines[0].cards).toHaveLength(1);
  });
});

describe("executeEffect — shift (opponent_any)", () => {
  it("moves any opponent card to a different opponent line (psy_3 style)", () => {
    const state = makeState();
    const target = card("opp1", CardFace.FaceUp);
    state.players[1].lines[1].cards.push(target);

    executeEffect(state, effect("shift", 0, { targets: "opponent_any", targetInstanceId: "opp1", targetLineIndex: 0 }));

    expect(state.players[1].lines[1].cards).toHaveLength(0);
    expect(state.players[1].lines[0].cards[0].instanceId).toBe("opp1");
  });

  it("rejects own card", () => {
    const state = makeState();
    state.players[0].lines[0].cards.push(card("own1", CardFace.FaceUp));

    executeEffect(state, effect("shift", 0, { targets: "opponent_any", targetInstanceId: "own1", targetLineIndex: 1 }));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
    expect(state.pendingLogs.some((l) => l.includes("must target opponent"))).toBe(true);
  });

  it("rejects covered opponent card", () => {
    const state = makeState();
    const target = card("opp1", CardFace.FaceDown);
    const cover = card("cover", CardFace.FaceUp);
    state.players[1].lines[0].cards.push(target, cover);

    executeEffect(state, effect("shift", 0, { targets: "opponent_any", targetInstanceId: "opp1", targetLineIndex: 2 }));

    expect(state.players[1].lines[0].cards.map((c) => c.instanceId)).toEqual(["opp1", "cover"]);
    expect(state.players[1].lines[2].cards).toHaveLength(0);
    expect(state.pendingLogs.some((l) => l.includes("must be uncovered"))).toBe(true);
  });
});

describe("executeEffect — shift (own_others)", () => {
  it("moves an own non-source card to another line (spd_3 style)", () => {
    const state = makeState();
    const src = card("spd3", CardFace.FaceUp);
    const other = card("other1", CardFace.FaceDown);
    state.players[0].lines[0].cards.push(src);
    state.players[0].lines[1].cards.push(other);

    executeEffect(state, effect("shift", 0, { targets: "own_others", targetInstanceId: "other1", targetLineIndex: 2 }, "spd3"));

    expect(state.players[0].lines[1].cards).toHaveLength(0);
    expect(state.players[0].lines[2].cards[0].instanceId).toBe("other1");
  });

  it("rejects the source card itself", () => {
    const state = makeState();
    const src = card("spd3", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src);

    executeEffect(state, effect("shift", 0, { targets: "own_others", targetInstanceId: "spd3", targetLineIndex: 1 }, "spd3"));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
    expect(state.pendingLogs.some((l) => l.includes("cannot shift source card"))).toBe(true);
  });
});

describe("executeEffect — shift (opponent_facedown)", () => {
  it("moves an opponent's face-down card to another opponent line (spd_4 style)", () => {
    const state = makeState();
    const target = card("ofd1", CardFace.FaceDown);
    state.players[1].lines[0].cards.push(target);

    executeEffect(state, effect("shift", 0, { targets: "opponent_facedown", targetInstanceId: "ofd1", targetLineIndex: 2 }));

    expect(state.players[1].lines[0].cards).toHaveLength(0);
    expect(state.players[1].lines[2].cards[0].instanceId).toBe("ofd1");
  });

  it("rejects own card", () => {
    const state = makeState();
    state.players[0].lines[0].cards.push(card("own1", CardFace.FaceDown));

    executeEffect(state, effect("shift", 0, { targets: "opponent_facedown", targetInstanceId: "own1", targetLineIndex: 1 }));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
    expect(state.pendingLogs.some((l) => l.includes("must target opponent"))).toBe(true);
  });

  it("rejects opponent face-up card", () => {
    const state = makeState();
    state.players[1].lines[0].cards.push(card("ofu1", CardFace.FaceUp));

    executeEffect(state, effect("shift", 0, { targets: "opponent_facedown", targetInstanceId: "ofu1", targetLineIndex: 2 }));

    expect(state.players[1].lines[0].cards).toHaveLength(1);
  });
});

describe("executeEffect — flip sets lastTargetedInstanceId", () => {
  it("stores the flipped card's instanceId in state.lastTargetedInstanceId", () => {
    const state = makeState();
    state.players[1].lines[0].cards.push(card("opp1", CardFace.FaceDown));

    executeEffect(state, effect("flip", 0, { targets: "opponent_any", targetInstanceId: "opp1" }));

    expect(state.lastTargetedInstanceId).toBe("opp1");
  });

  it("does not set lastTargetedInstanceId for auto-flip variants (no targetId pick)", () => {
    const state = makeState();
    const src = card("src1", CardFace.FaceUp);
    const other = card("other1", CardFace.FaceUp);
    state.players[0].lines[0].cards.push(src, other);

    // own_faceup_others is auto — no player-chosen target
    executeEffect(state, effect("flip", 0, { targets: "own_faceup_others" }, "src1"));

    // lastTargetedInstanceId should remain null (no explicit target)
    expect(state.lastTargetedInstanceId).toBeNull();
  });
});

// ─── lineValue — passive modifiers ───────────────────────────────────────────

describe("lineValue — passive modifiers", () => {
  it("returns base value with no passive effects", () => {
    const state = makeState();
    // spd_1 (value 1, face-up) + face-down card (value 2)
    state.players[0].lines[0].cards = [
      { instanceId: "a", defId: "spd_1", face: CardFace.FaceUp },
      { instanceId: "b", defId: "spd_5", face: CardFace.FaceDown },
    ];
    expect(lineValue(state, 0, 0)).toBe(3); // 1 + 2
  });

  it("value_bonus_per_facedown (apy_0) adds 1 per face-down card", () => {
    const state = makeState();
    // apy_0 is face-up in line 0; two other face-down cards
    state.players[0].lines[0].cards = [
      { instanceId: "apy", defId: "apy_0", face: CardFace.FaceUp  }, // value 0, passive
      { instanceId: "fd1", defId: "spd_5", face: CardFace.FaceDown }, // 2
      { instanceId: "fd2", defId: "spd_5", face: CardFace.FaceDown }, // 2
    ];
    // base = 0 + 2 + 2 = 4; 2 face-down cards → +2 bonus = 6
    expect(lineValue(state, 0, 0)).toBe(6);
  });

  it("facedown_value_override (drk_2) overrides face-down value to 4", () => {
    const state = makeState();
    state.players[0].lines[0].cards = [
      { instanceId: "drk", defId: "drk_2", face: CardFace.FaceUp  }, // value 2
      { instanceId: "fd1", defId: "spd_5", face: CardFace.FaceDown }, // normally 2, now 4
      { instanceId: "fd2", defId: "spd_5", face: CardFace.FaceDown }, // normally 2, now 4
    ];
    // base = 2 + 4 + 4 = 10 (override applies, no facedown bonus for this card)
    expect(lineValue(state, 0, 0)).toBe(10);
  });

  it("reduce_opponent_value (mtl_0) reduces opponent value for that line", () => {
    const state = makeState();
    // player 0 line 0 has plain cards
    state.players[0].lines[0].cards = [
      { instanceId: "a", defId: "spd_3", face: CardFace.FaceUp }, // value 3
    ];
    // player 1 line 0 has mtl_0 (reduce_opponent_value by 2) face-up
    state.players[1].lines[0].cards = [
      { instanceId: "mtl", defId: "mtl_0", face: CardFace.FaceUp }, // value: 0 face-up
    ];
    // player 0's value should be reduced by 2 because opponent has mtl_0
    expect(lineValue(state, 0, 0)).toBe(1); // 3 - 2
    // player 1's own value is unaffected
    expect(lineValue(state, 1, 0)).toBe(0);
  });

  it("reduce_opponent_value only applies from face-up opponent cards", () => {
    const state = makeState();
    state.players[0].lines[0].cards = [
      { instanceId: "a", defId: "spd_3", face: CardFace.FaceUp }, // value 3
    ];
    state.players[1].lines[0].cards = [
      { instanceId: "mtl", defId: "mtl_0", face: CardFace.FaceDown }, // face-down — passive inactive
    ];
    expect(lineValue(state, 0, 0)).toBe(3); // no reduction
  });

  it("value_bonus_per_hand_card adds 1 per card in hand", () => {
    const state = makeState();
    state.players[0].lines[0].cards = [
      { instanceId: "clr", defId: "clr_0", face: CardFace.FaceUp },
      { instanceId: "base", defId: "spd_3", face: CardFace.FaceUp },
    ];
    state.players[0].hand = [card("h1"), card("h2"), card("h3")];

    expect(lineValue(state, 0, 0)).toBe(6);
  });

  it("value_bonus_per_opponent_card_in_line adds per opposing card in that line", () => {
    const state = makeState();
    state.players[0].lines[0].cards = [
      { instanceId: "mir", defId: "mir_0", face: CardFace.FaceUp },
      { instanceId: "base", defId: "spd_3", face: CardFace.FaceUp },
    ];
    state.players[1].lines[0].cards = [
      { instanceId: "opp1", defId: "spd_1", face: CardFace.FaceUp },
      { instanceId: "opp2", defId: "spd_5", face: CardFace.FaceDown },
    ];

    expect(lineValue(state, 0, 0)).toBe(5);
  });

  it("value_bonus_if_other_faceup_not_protocol_in_stack only applies with another face-up protocol", () => {
    const state = makeState();
    state.players[0].lines[0].cards = [
      { instanceId: "div", defId: "div_2", face: CardFace.FaceUp },
      { instanceId: "same-proto", defId: "div_4", face: CardFace.FaceUp },
    ];
    expect(lineValue(state, 0, 0)).toBe(6);

    state.players[0].lines[0].cards.push({ instanceId: "other-proto", defId: "spd_1", face: CardFace.FaceUp });
    expect(lineValue(state, 0, 0)).toBe(9);
  });
});

// ─── playCard — deny passive mechanics ───────────────────────────────────────

/** Build a minimal state where p0 is active in Action phase, each player has
 *  one card in hand, and the protocols are set up so p0 can play face-up in line 0. */
function makeDenyState() {
  const state = makeState();
  state.activePlayerIndex = 0;
  state.turnPhase = "Action" as any;

  // Give p0 a matching protocol for line 0 (proto_spd) and a card in hand
  state.players[0].protocols = [{ protocolId: "proto_spd", status: "Loading" as any, lineIndex: 0 }];
  state.players[0].hand = [{ instanceId: "hand0", defId: "spd_3", face: CardFace.FaceUp }];

  return state;
}

describe("playCard — deny_play_in_line (plg_0)", () => {
  it("rejects any play into a line where opponent has plg_0 face-up", () => {
    const state = makeDenyState();
    // Opponent places plg_0 face-up in their own line 0
    state.players[1].lines[0].cards = [
      { instanceId: "plg", defId: "plg_0", face: CardFace.FaceUp },
    ];
    const result = playCard(state, 0, "hand0", CardFace.FaceDown, 0);
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/prevents playing in this line/);
  });

  it("still rejects face-up plays in the denied line", () => {
    const state = makeDenyState();
    state.players[1].lines[0].cards = [
      { instanceId: "plg", defId: "plg_0", face: CardFace.FaceUp },
    ];
    const result = playCard(state, 0, "hand0", CardFace.FaceUp, 0);
    expect(result.success).toBe(false);
  });

  it("does NOT block plays in a different line", () => {
    const state = makeDenyState();
    // deny only in line 0; play into line 1
    state.players[1].lines[0].cards = [
      { instanceId: "plg", defId: "plg_0", face: CardFace.FaceUp },
    ];
    // Give p0 a protocol for line 1 too
    state.players[0].protocols.push({ protocolId: "proto_spd", status: "Loading" as any, lineIndex: 1 });
    const result = playCard(state, 0, "hand0", CardFace.FaceDown, 1);
    expect(result.success).toBe(true);
  });

  it("does not deny when plg_0 is face-down", () => {
    const state = makeDenyState();
    state.players[1].lines[0].cards = [
      { instanceId: "plg", defId: "plg_0", face: CardFace.FaceDown },
    ];
    const result = playCard(state, 0, "hand0", CardFace.FaceDown, 0);
    expect(result.success).toBe(true);
  });

  it("does not consume a bonus play when the play is denied", () => {
    const state = makeDenyState();
    state.pendingBonusPlay = { anyLine: false };
    state.players[1].lines[0].cards = [
      { instanceId: "plg", defId: "plg_0", face: CardFace.FaceUp },
    ];
    playCard(state, 0, "hand0", CardFace.FaceDown, 0);
    // Bonus play must still be available since the play was rejected
    expect(state.pendingBonusPlay).not.toBeNull();
  });
});

describe("playCard — deny_facedown (mtl_2)", () => {
  it("rejects a face-down play in the line where opponent has mtl_2 face-up", () => {
    const state = makeDenyState();
    state.players[1].lines[0].cards = [
      { instanceId: "mtl", defId: "mtl_2", face: CardFace.FaceUp },
    ];
    const result = playCard(state, 0, "hand0", CardFace.FaceDown, 0);
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/prevents playing face-down in this line/);
  });

  it("still allows face-up plays in the deny_facedown line", () => {
    const state = makeDenyState();
    state.players[1].lines[0].cards = [
      { instanceId: "mtl", defId: "mtl_2", face: CardFace.FaceUp },
    ];
    // face-up play should succeed (protocol matches)
    const result = playCard(state, 0, "hand0", CardFace.FaceUp, 0);
    expect(result.success).toBe(true);
  });

  it("does not deny face-down plays in other lines", () => {
    const state = makeDenyState();
    state.players[1].lines[0].cards = [
      { instanceId: "mtl", defId: "mtl_2", face: CardFace.FaceUp },
    ];
    // face-down into line 1 — unaffected
    const result = playCard(state, 0, "hand0", CardFace.FaceDown, 1);
    expect(result.success).toBe(true);
  });

  it("does not deny when mtl_2 is face-down", () => {
    const state = makeDenyState();
    state.players[1].lines[0].cards = [
      { instanceId: "mtl", defId: "mtl_2", face: CardFace.FaceDown },
    ];
    const result = playCard(state, 0, "hand0", CardFace.FaceDown, 0);
    expect(result.success).toBe(true);
  });
});

describe("playCard — deny_faceup (psy_1)", () => {
  it("rejects a face-up play anywhere when opponent has psy_1 face-up", () => {
    const state = makeDenyState();
    // psy_1 can be in any of opponent's lines
    state.players[1].lines[2].cards = [
      { instanceId: "psy", defId: "psy_1", face: CardFace.FaceUp },
    ];
    const result = playCard(state, 0, "hand0", CardFace.FaceUp, 0);
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/forces you to play face-down/);
  });

  it("still allows face-down plays while psy_1 is face-up", () => {
    const state = makeDenyState();
    state.players[1].lines[1].cards = [
      { instanceId: "psy", defId: "psy_1", face: CardFace.FaceUp },
    ];
    const result = playCard(state, 0, "hand0", CardFace.FaceDown, 0);
    expect(result.success).toBe(true);
  });

  it("does not deny when psy_1 is face-down", () => {
    const state = makeDenyState();
    state.players[1].lines[0].cards = [
      { instanceId: "psy", defId: "psy_1", face: CardFace.FaceDown },
    ];
    const result = playCard(state, 0, "hand0", CardFace.FaceUp, 0);
    expect(result.success).toBe(true);
  });
});

describe("playCard — face-up protocol match uses both line protocols", () => {
  it("allows face-up play when the card matches the opponent protocol in that line", () => {
    const state = makeState();
    state.activePlayerIndex = 0;
    state.turnPhase = "Action" as any;

    state.players[0].protocols = [
      { protocolId: "proto_spd", status: "Loading" as any, lineIndex: 0 },
      { protocolId: "proto_spd", status: "Loading" as any, lineIndex: 1 },
      { protocolId: "proto_spd", status: "Loading" as any, lineIndex: 2 },
    ];
    state.players[1].protocols = [
      { protocolId: "proto_drk", status: "Loading" as any, lineIndex: 0 },
      { protocolId: "proto_hat", status: "Loading" as any, lineIndex: 1 },
      { protocolId: "proto_lgt", status: "Loading" as any, lineIndex: 2 },
    ];

    state.players[0].hand = [{ instanceId: "hand0", defId: "drk_3", face: CardFace.FaceUp }];

    const result = playCard(state, 0, "hand0", CardFace.FaceUp, 0);
    expect(result.success).toBe(true);
    expect(state.players[0].lines[0].cards.some((c) => c.instanceId === "hand0")).toBe(true);
    expect(state.players[1].lines[0].cards.some((c) => c.instanceId === "hand0")).toBe(false);
  });

  it("rejects face-up play when the card matches neither protocol in that line", () => {
    const state = makeState();
    state.activePlayerIndex = 0;
    state.turnPhase = "Action" as any;

    state.players[0].protocols = [
      { protocolId: "proto_spd", status: "Loading" as any, lineIndex: 0 },
      { protocolId: "proto_spd", status: "Loading" as any, lineIndex: 1 },
      { protocolId: "proto_spd", status: "Loading" as any, lineIndex: 2 },
    ];
    state.players[1].protocols = [
      { protocolId: "proto_drk", status: "Loading" as any, lineIndex: 0 },
      { protocolId: "proto_hat", status: "Loading" as any, lineIndex: 1 },
      { protocolId: "proto_lgt", status: "Loading" as any, lineIndex: 2 },
    ];

    state.players[0].hand = [{ instanceId: "hand0", defId: "lif_3", face: CardFace.FaceUp }];

    const result = playCard(state, 0, "hand0", CardFace.FaceUp, 0);
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/protocol does not match this line/i);
    expect(state.players[0].lines[0].cards).toHaveLength(0);
  });
});

// ─── On-cover hooks ───────────────────────────────────────────────────────────

import { enqueueEffectsOnCover } from "../CardEffects";

describe("enqueueEffectsOnCover — on_covered (fir_0)", () => {
  it("enqueues draw 1 + flip any_card when fir_0 is covered", () => {
    const state = makeState();
    const fir0: CardInstance = { instanceId: "fir0", defId: "fir_0", face: CardFace.FaceUp };
    enqueueEffectsOnCover(state, fir0, 0);
    expect(state.effectQueue).toHaveLength(2);
    expect(state.effectQueue[0].type).toBe("draw");
    expect(state.effectQueue[0].payload.amount).toBe(1);
    expect(state.effectQueue[1].type).toBe("flip");
    expect(state.effectQueue[1].payload.targets).toBe("any_card");
  });

  it("does not enqueue when fir_0 is face-down", () => {
    const state = makeState();
    const fir0: CardInstance = { instanceId: "fir0", defId: "fir_0", face: CardFace.FaceDown };
    enqueueEffectsOnCover(state, fir0, 0);
    expect(state.effectQueue).toHaveLength(0);
  });
});

describe("enqueueEffectsOnCover — on_covered_flip_self (apy_2)", () => {
  it("enqueues flip_self when apy_2 is covered", () => {
    const state = makeState();
    const apy2: CardInstance = { instanceId: "apy2", defId: "apy_2", face: CardFace.FaceUp };
    enqueueEffectsOnCover(state, apy2, 0);
    // apy_2 also has ignore_mid_commands (not an on_cover), so only flip_self
    const coverEffects = state.effectQueue.filter((e) => e.sourceInstanceId === "apy2");
    expect(coverEffects).toHaveLength(1);
    expect(coverEffects[0].type).toBe("flip_self");
  });
});

describe("enqueueEffectsOnCover — on_covered_draw (clr_1)", () => {
  it("enqueues a draw effect with the configured amount", () => {
    const state = makeState();
    const clr1: CardInstance = { instanceId: "clr1", defId: "clr_1", face: CardFace.FaceUp };

    enqueueEffectsOnCover(state, clr1, 0);

    const drawEffects = state.effectQueue.filter((e) => e.sourceInstanceId === "clr1");
    expect(drawEffects).toHaveLength(1);
    expect(drawEffects[0].type).toBe("draw");
    expect(drawEffects[0].payload.amount).toBe(3);
  });
});

describe("executeEffect — delete_self_if_covered (lif_0)", () => {
  it("removes lif_0 from its line and adds to trash when covered", () => {
    const state = makeState();
    const lif0: CardInstance = { instanceId: "lif0", defId: "lif_0", face: CardFace.FaceUp };
    const cover: CardInstance = { instanceId: "cover", defId: "spd_1", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [lif0, cover];
    executeEffect(state, effect("delete_self_if_covered", 0, {}, "lif0"));
    expect(state.players[0].lines[0].cards.map((c) => c.instanceId)).not.toContain("lif0");
    expect(state.trashes[0]).toHaveLength(1);
    expect(state.trashes[0][0].instanceId).toBe("lif0");
  });

  it("skips when lif_0 is not covered", () => {
    const state = makeState();
    const lif0: CardInstance = { instanceId: "lif0", defId: "lif_0", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [lif0];

    executeEffect(state, effect("delete_self_if_covered", 0, {}, "lif0"));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
    expect(state.players[0].lines[0].cards[0].instanceId).toBe("lif0");
    expect(state.trashes[0]).toHaveLength(0);
  });
});

describe("executeEffect — on_covered_delete_lowest (hat_4)", () => {
  it("deletes the lowest-value covered card in hat_4's line", () => {
    const state = makeState();
    const cardLow: CardInstance  = { instanceId: "low",  defId: "lgt_1", face: CardFace.FaceUp }; // value 1
    const hat4: CardInstance     = { instanceId: "hat4", defId: "hat_4", face: CardFace.FaceUp }; // value 4
    const topCard: CardInstance  = { instanceId: "top",  defId: "lgt_5", face: CardFace.FaceUp }; // value 5 (top)
    // bottom→top: cardLow, hat4, topCard
    state.players[0].lines[0].cards = [cardLow, hat4, topCard];
    executeEffect(state, effect("on_covered_delete_lowest", 0, {}, "hat4"));
    // cardLow (value 1) is lowest among covered cards (cardLow and hat4)
    expect(state.players[0].lines[0].cards.map((c) => c.instanceId)).not.toContain("low");
    expect(state.trashes[0].some((c) => c.instanceId === "low")).toBe(true);
  });

  it("does nothing when no covered cards exist (only 1 card in line)", () => {
    const state = makeState();
    const hat4: CardInstance = { instanceId: "hat4", defId: "hat_4", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [hat4];
    executeEffect(state, effect("on_covered_delete_lowest", 0, {}, "hat4"));
    expect(state.players[0].lines[0].cards).toHaveLength(1);
  });

  it("treats face-down cards as value 2 when comparing", () => {
    const state = makeState();
    const fd: CardInstance   = { instanceId: "fd",   defId: "lgt_5", face: CardFace.FaceDown }; // face-down = 2
    const hat4: CardInstance = { instanceId: "hat4", defId: "hat_4", face: CardFace.FaceUp };   // 4
    const top: CardInstance  = { instanceId: "top",  defId: "lgt_5", face: CardFace.FaceUp };   // 5 (top)
    state.players[0].lines[0].cards = [fd, hat4, top];
    executeEffect(state, effect("on_covered_delete_lowest", 0, {}, "hat4"));
    // fd (value 2) < hat4 (value 4) → fd deleted
    expect(state.players[0].lines[0].cards.map((c) => c.instanceId)).not.toContain("fd");
  });
});

describe("executeEffect — on_covered_deck_to_other_line (lif_3)", () => {
  it("plays top deck card face-down into targetLineIndex", () => {
    const state = makeState();
    const lif3: CardInstance = { instanceId: "lif3", defId: "lif_3", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [lif3];
    // Put a deck card
    const deckCard: CardInstance = { instanceId: "dk1", defId: "spd_5", face: CardFace.FaceDown };
    state.decks[0] = [deckCard];
    state.players[0].deckSize = 1;
    executeEffect(state, effect("on_covered_deck_to_other_line", 0, { targetLineIndex: 1 }, "lif3"));
    expect(state.players[0].lines[1].cards).toHaveLength(1);
    expect(state.players[0].lines[1].cards[0].face).toBe(CardFace.FaceDown);
    expect(state.players[0].deckSize).toBe(0);
  });

  it("rejects if no targetLineIndex provided", () => {
    const state = makeState();
    const lif3: CardInstance = { instanceId: "lif3", defId: "lif_3", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [lif3];
    state.decks[0] = [{ instanceId: "dk1", defId: "spd_5", face: CardFace.FaceDown }];
    state.players[0].deckSize = 1;
    executeEffect(state, effect("on_covered_deck_to_other_line", 0, {}, "lif3"));
    // Nothing played
    expect(state.players[0].lines[1].cards).toHaveLength(0);
    expect(state.players[0].deckSize).toBe(1);
  });

  it("rejects if targetLineIndex is same as source card's line", () => {
    const state = makeState();
    const lif3: CardInstance = { instanceId: "lif3", defId: "lif_3", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [lif3];
    state.decks[0] = [{ instanceId: "dk1", defId: "spd_5", face: CardFace.FaceDown }];
    state.players[0].deckSize = 1;
    executeEffect(state, effect("on_covered_deck_to_other_line", 0, { targetLineIndex: 0 }, "lif3"));
    expect(state.players[0].lines[0].cards).toHaveLength(1); // only lif3
  });
});

describe("playCard — on-cover hooks fire when a card is covered", () => {
  it("enqueues on_covered effects when playCard covers mtl_6", () => {
    const state = makeDenyState();
    // Place mtl_6 face-up in player 0's line 0
    const mtl6: CardInstance = { instanceId: "mtl6", defId: "mtl_6", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [mtl6];
    // Play a face-down card on top
    playCard(state, 0, "hand0", CardFace.FaceDown, 0);
    // on_covered_delete_self should be in the queue
    expect(state.effectQueue.some((e) => e.type === "on_covered_delete_self")).toBe(true);
  });

  it("does not enqueue on_covered when the line was empty (nothing gets covered)", () => {
    const state = makeDenyState();
    // Line is empty — no card gets covered
    playCard(state, 0, "hand0", CardFace.FaceDown, 0);
    const coverTypes = ["on_covered", "on_covered_delete_self", "on_covered_flip_self",
                        "on_covered_delete_lowest", "on_covered_deck_to_other_line"];
    expect(state.effectQueue.some((e) => coverTypes.includes(e.type))).toBe(false);
  });

  it("on_covered_flip_self (apy_2) fires and flips apy_2 when covered", () => {
    const state = makeDenyState();
    const apy2: CardInstance = { instanceId: "apy2", defId: "apy_2", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [apy2];
    playCard(state, 0, "hand0", CardFace.FaceDown, 0);
    // flip_self should be first in queue (on-cover fires before played card's effects)
    expect(state.effectQueue[0].type).toBe("flip_self");
    expect(state.effectQueue[0].sourceInstanceId).toBe("apy2");
    // Execute it and confirm apy_2 flips
    executeEffect(state, state.effectQueue.shift()!);
    expect(apy2.face).toBe(CardFace.FaceDown);
  });
});

// ─── executeEffect — after_draw_shift_self (spr_3) ───────────────────────────

describe("executeEffect — after_draw_shift_self (spr_3)", () => {
  it("shifts spr_3 to the specified line", () => {
    const state = makeState();
    const spr3: CardInstance = { instanceId: "spr3", defId: "spr_3", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [spr3];
    executeEffect(state, effect("after_draw_shift_self", 0, { targetLineIndex: 2 }, "spr3"));
    expect(state.players[0].lines[0].cards).toHaveLength(0);
    expect(state.players[0].lines[2].cards[0].instanceId).toBe("spr3");
  });

  it("skips (no-op) when targetLineIndex is not provided", () => {
    const state = makeState();
    const spr3: CardInstance = { instanceId: "spr3", defId: "spr_3", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [spr3];
    executeEffect(state, effect("after_draw_shift_self", 0, {}, "spr3"));
    // Card stays put
    expect(state.players[0].lines[0].cards[0].instanceId).toBe("spr3");
  });

  it("does nothing when the card is already in the target line", () => {
    const state = makeState();
    const spr3: CardInstance = { instanceId: "spr3", defId: "spr_3", face: CardFace.FaceUp };
    state.players[0].lines[1].cards = [spr3];
    executeEffect(state, effect("after_draw_shift_self", 0, { targetLineIndex: 1 }, "spr3"));
    expect(state.players[0].lines[1].cards).toHaveLength(1);
  });

  it("enqueues cover effects on the previous top card of the destination line", () => {
    const state = makeState();
    const spr3: CardInstance = { instanceId: "spr3", defId: "spr_3", face: CardFace.FaceUp };
    // Place an mtl_6 (on_covered_delete_self) face-up in line 1 as existing top
    const mtl6: CardInstance = { instanceId: "bot", defId: "mtl_6", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [spr3];
    state.players[0].lines[1].cards = [mtl6];
    executeEffect(state, effect("after_draw_shift_self", 0, { targetLineIndex: 1 }, "spr3"));
    // spr3 is now on top of line 1, covering mtl6 → on_covered_delete_self queued
    expect(state.effectQueue.some((e) => e.type === "on_covered_delete_self")).toBe(true);
  });

  it("does nothing if sourceInstanceId card is not found in own lines", () => {
    const state = makeState();
    // No crash expected
    executeEffect(state, effect("after_draw_shift_self", 0, { targetLineIndex: 2 }, "ghost_id"));
    expect(state.players[0].lines[2].cards).toHaveLength(0);
  });
});

// ─── after_draw_shift_self passive hook — triggered by draw effect ────────────

describe("after_draw_shift_self passive hook — draw effect enqueues it", () => {
  it("enqueues after_draw_shift_self when spr_3 is face-up and draw effect fires", () => {
    const state = makeState();
    const spr3: CardInstance = { instanceId: "spr3", defId: "spr_3", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [spr3];
    state.decks[0].push({ instanceId: "d1", defId: "spd_5", face: CardFace.FaceDown });
    state.players[0].deckSize = 1;
    executeEffect(state, effect("draw", 0, { amount: 1 }));
    expect(state.effectQueue.some((e) => e.type === "after_draw_shift_self")).toBe(true);
    const queued = state.effectQueue.find((e) => e.type === "after_draw_shift_self")!;
    expect(queued.sourceInstanceId).toBe("spr3");
  });

  it("does not enqueue after_draw_shift_self when spr_3 is face-down", () => {
    const state = makeState();
    const spr3: CardInstance = { instanceId: "spr3", defId: "spr_3", face: CardFace.FaceDown };
    state.players[0].lines[0].cards = [spr3];
    state.decks[0].push({ instanceId: "d1", defId: "spd_5", face: CardFace.FaceDown });
    state.players[0].deckSize = 1;
    executeEffect(state, effect("draw", 0, { amount: 1 }));
    expect(state.effectQueue.some((e) => e.type === "after_draw_shift_self")).toBe(false);
  });
});

// ─── executeEffect — on_compile_delete_shift_self (spd_2) ────────────────────

describe("executeEffect — on_compile_delete_shift_self (spd_2)", () => {
  it("moves the saved card from compileSavedCards to the target line", () => {
    const state = makeState();
    const spd2: CardInstance = { instanceId: "spd2", defId: "spd_2", face: CardFace.FaceUp };
    state.compileSavedCards = [{ card: spd2, ownerIndex: 0 }];
    executeEffect(
      state,
      effect("on_compile_delete_shift_self", 0, { savedInstanceId: "spd2", targetLineIndex: 1 })
    );
    expect(state.compileSavedCards).toHaveLength(0);
    expect(state.players[0].lines[1].cards[0].instanceId).toBe("spd2");
  });

  it("card is lost (not placed) when no targetLineIndex provided", () => {
    const state = makeState();
    const spd2: CardInstance = { instanceId: "spd2", defId: "spd_2", face: CardFace.FaceUp };
    state.compileSavedCards = [{ card: spd2, ownerIndex: 0 }];
    executeEffect(
      state,
      effect("on_compile_delete_shift_self", 0, { savedInstanceId: "spd2" })
    );
    // Removed from buffer but not in any line
    expect(state.compileSavedCards).toHaveLength(0);
    expect(state.players[0].lines.flatMap((l) => l.cards)).toHaveLength(0);
  });

  it("does nothing when savedInstanceId is not in compileSavedCards", () => {
    const state = makeState();
    executeEffect(
      state,
      effect("on_compile_delete_shift_self", 0, { savedInstanceId: "ghost", targetLineIndex: 0 })
    );
    expect(state.players[0].lines.flatMap((l) => l.cards)).toHaveLength(0);
  });

  it("enqueues cover effects on the previous top card when placed in occupied line", () => {
    const state = makeState();
    const spd2: CardInstance = { instanceId: "spd2", defId: "spd_2", face: CardFace.FaceUp };
    const mtl6: CardInstance = { instanceId: "bot", defId: "mtl_6", face: CardFace.FaceUp };
    state.compileSavedCards = [{ card: spd2, ownerIndex: 0 }];
    state.players[0].lines[0].cards = [mtl6];
    executeEffect(
      state,
      effect("on_compile_delete_shift_self", 0, { savedInstanceId: "spd2", targetLineIndex: 0 })
    );
    expect(state.effectQueue.some((e) => e.type === "on_covered_delete_self")).toBe(true);
  });
});

// ─── after_delete_draw passive hook ──────────────────────────────────────────

describe("after_delete_draw passive hook — hat_3 triggers draw on delete", () => {
  it("face-up hat_3 causes owner to draw 1 after a delete effect", () => {
    const state = makeState();
    const hat3: CardInstance = { instanceId: "hat3", defId: "hat_3", face: CardFace.FaceUp };
    const target: CardInstance = { instanceId: "tgt", defId: "spd_5", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [hat3];
    state.players[1].lines[0].cards = [target]; // will be deleted
    state.decks[0] = [{ instanceId: "dk1", defId: "spd_5", face: CardFace.FaceDown }];
    state.players[0].deckSize = 1;
    executeEffect(state, effect("delete", 0, { targets: "any_card", targetInstanceId: "tgt" }));
    // hat_3's passive fires → draw 1
    expect(state.players[0].hand).toHaveLength(1);
  });

  it("face-down hat_3 does NOT trigger draw", () => {
    const state = makeState();
    const hat3: CardInstance = { instanceId: "hat3", defId: "hat_3", face: CardFace.FaceDown };
    const target: CardInstance = { instanceId: "tgt", defId: "spd_5", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [hat3];
    state.players[1].lines[0].cards = [target];
    state.decks[0] = [{ instanceId: "dk1", defId: "spd_5", face: CardFace.FaceDown }];
    state.players[0].deckSize = 1;
    executeEffect(state, effect("delete", 0, { targets: "any_card", targetInstanceId: "tgt" }));
    expect(state.players[0].hand).toHaveLength(0);
  });
});

// ─── after_opp_discard_draw passive hook (plg_1) ─────────────────────────────

describe("after_opp_discard_draw passive hook — plg_1 triggers draw after opponent discards", () => {
  it("face-up plg_1 causes owner to draw 1 after opponent_discard", () => {
    const state = makeState();
    const plg1: CardInstance = { instanceId: "plg1", defId: "plg_1", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [plg1];
    state.players[1].hand = [{ instanceId: "oppcard", defId: "spd_5", face: CardFace.FaceUp }];
    state.decks[0] = [{ instanceId: "dk1", defId: "spd_5", face: CardFace.FaceDown }];
    state.players[0].deckSize = 1;
    executeEffect(state, effect("opponent_discard", 0, { amount: 1 }));
    // Opponent resolves their queued discard by choosing "oppcard"
    const queued = state.effectQueue.find(e => e.type === "discard" && e.ownerIndex === 1)!;
    executeEffect(state, { ...queued, payload: { ...queued.payload, targetInstanceId: "oppcard" } });
    expect(state.players[0].hand).toHaveLength(1);
  });

  it("does not trigger when plg_1 is face-down", () => {
    const state = makeState();
    const plg1: CardInstance = { instanceId: "plg1", defId: "plg_1", face: CardFace.FaceDown };
    state.players[0].lines[0].cards = [plg1];
    state.players[1].hand = [{ instanceId: "oppcard", defId: "spd_5", face: CardFace.FaceUp }];
    state.decks[0] = [{ instanceId: "dk1", defId: "spd_5", face: CardFace.FaceDown }];
    state.players[0].deckSize = 1;
    executeEffect(state, effect("opponent_discard", 0, { amount: 1 }));
    expect(state.players[0].hand).toHaveLength(0);
  });
});

// ─── on_covered_or_flip_delete_self passive hook (mtl_6) ─────────────────────

describe("on_covered_or_flip_delete_self passive hook (mtl_6)", () => {
  it("enqueues on_covered_delete_self when mtl_6 is covered", () => {
    const state = makeDenyState();
    const mtl6: CardInstance = { instanceId: "mtl6", defId: "mtl_6", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [mtl6];
    playCard(state, 0, "hand0", CardFace.FaceDown, 0);
    expect(state.effectQueue.some((e) => e.type === "on_covered_delete_self")).toBe(true);
    const queued = state.effectQueue.find((e) => e.type === "on_covered_delete_self")!;
    expect(queued.sourceInstanceId).toBe("mtl6");
  });

  it("deletes mtl_6 instead of flipping when a flip effect targets it", () => {
    const state = makeState();
    const mtl6: CardInstance = { instanceId: "mtl6", defId: "mtl_6", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [mtl6];
    executeEffect(
      state,
      effect("flip", 0, { targets: "any_card", targetInstanceId: "mtl6" })
    );
    // Not flipped — deleted
    expect(mtl6.face).toBe(CardFace.FaceUp); // face unchanged (card gone from line)
    expect(state.players[0].lines[0].cards).toHaveLength(0);
    expect(state.trashes[0].some((c) => c.instanceId === "mtl6")).toBe(true);
  });

  it("normal flip still works for cards without the passive", () => {
    const state = makeState();
    const spd5: CardInstance = { instanceId: "spd5", defId: "spd_5", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [spd5];
    executeEffect(state, effect("flip", 0, { targets: "any_card", targetInstanceId: "spd5" }));
    expect(spd5.face).toBe(CardFace.FaceDown);
    expect(state.players[0].lines[0].cards).toHaveLength(1);
  });
});

// ─── Control reorder (chooseCompile / refresh + resolveControlReorder) ────────

describe("control reorder — triggered by compile/refresh with control", () => {
  function stateWithProtocols(): ServerGameState {
    const s = makeState();
    s.players[0].protocols = [
      { protocolId: "proto_a", status: ProtocolStatus.Loading, lineIndex: 0 },
      { protocolId: "proto_b", status: ProtocolStatus.Loading, lineIndex: 1 },
      { protocolId: "proto_c", status: ProtocolStatus.Loading, lineIndex: 2 },
    ];
    s.players[1].protocols = [
      { protocolId: "proto_x", status: ProtocolStatus.Loading, lineIndex: 0 },
      { protocolId: "proto_y", status: ProtocolStatus.Loading, lineIndex: 1 },
      { protocolId: "proto_z", status: ProtocolStatus.Loading, lineIndex: 2 },
    ];
    return s;
  }

  // ── chooseCompile ──────────────────────────────────────────────────────────

  it("chooseCompile when player has control: sets pendingControlReorder and EffectResolution", () => {
    const state = stateWithProtocols();
    // Put a card in the compile line so compileLine has something
    state.players[0].lines[1].cards = [{ instanceId: "c1", defId: "spd_1", face: CardFace.FaceUp }];
    state.players[0].protocols[1] = { protocolId: "proto_b", status: ProtocolStatus.Loading, lineIndex: 1 };
    state.compilableLines = [1];
    state.players[0].hasControl = true;
    processAutoPhases(state); // advance to CompileChoice phase
    // Manually set phase since processAutoPhases may advance past it
    state.turnPhase = "CompileChoice" as any;
    state.compilableLines = [1];

    const result = chooseCompile(state, 0, 1);
    expect(result.success).toBe(true);
    expect(state.pendingControlReorder).toBe(0);
    expect(state.players[0].hasControl).toBe(false);
    expect(state.players[1].hasControl).toBe(false);
    expect(state.turnPhase).toBe("EffectResolution");
  });

  it("chooseCompile without control proceeds normally (no pendingControlReorder)", () => {
    const state = stateWithProtocols();
    state.players[0].lines[0].cards = [{ instanceId: "c1", defId: "spd_1", face: CardFace.FaceUp }];
    state.compilableLines = [0];
    state.players[0].hasControl = false;
    state.turnPhase = "CompileChoice" as any;

    const result = chooseCompile(state, 0, 0);
    expect(result.success).toBe(true);
    expect(state.pendingControlReorder).toBeNull();
  });

  // ── refresh ────────────────────────────────────────────────────────────────

  it("refresh when player has control: sets pendingControlReorder and EffectResolution", () => {
    const state = stateWithProtocols();
    state.turnPhase = "Action" as any;
    state.players[0].hasControl = true;

    const result = refresh(state, 0);
    expect(result.success).toBe(true);
    expect(state.pendingControlReorder).toBe(0);
    expect(state.players[0].hasControl).toBe(false);
    expect(state.players[1].hasControl).toBe(false);
    expect(state.turnPhase).toBe("EffectResolution");
  });

  it("refresh without control proceeds normally", () => {
    const state = stateWithProtocols();
    state.turnPhase = "Action" as any;
    state.players[0].hasControl = false;

    const result = refresh(state, 0);
    expect(result.success).toBe(true);
    expect(state.pendingControlReorder).toBeNull();
  });

  it("refresh rejects when hand has 5 cards", () => {
    const state = stateWithProtocols();
    state.turnPhase = "Action" as any;
    for (let i = 0; i < 5; i++) state.players[0].hand.push(card(`h${i}`));

    const result = refresh(state, 0);
    expect(result.success).toBe(false);
    expect(result.reason).toContain("Cannot refresh with 5 or more cards in hand.");
    expect(state.pendingControlReorder).toBeNull();
  });

  // ── resolveControlReorder ──────────────────────────────────────────────────

  it("resolveControlReorder reorders own protocols", () => {
    const state = stateWithProtocols();
    state.pendingControlReorder = 0;
    state.turnPhase = "EffectResolution" as any;

    const result = resolveControlReorder(state, 0, "self", ["proto_c", "proto_a", "proto_b"]);
    expect(result.success).toBe(true);
    expect(state.pendingControlReorder).toBeNull();
    const protos = state.players[0].protocols;
    expect(protos.find(p => p.protocolId === "proto_c")!.lineIndex).toBe(0);
    expect(protos.find(p => p.protocolId === "proto_a")!.lineIndex).toBe(1);
    expect(protos.find(p => p.protocolId === "proto_b")!.lineIndex).toBe(2);
  });

  it("resolveControlReorder reorders opponent protocols", () => {
    const state = stateWithProtocols();
    state.pendingControlReorder = 0;
    state.turnPhase = "EffectResolution" as any;

    const result = resolveControlReorder(state, 0, "opponent", ["proto_z", "proto_x", "proto_y"]);
    expect(result.success).toBe(true);
    const protos = state.players[1].protocols;
    expect(protos.find(p => p.protocolId === "proto_z")!.lineIndex).toBe(0);
    expect(protos.find(p => p.protocolId === "proto_x")!.lineIndex).toBe(1);
    expect(protos.find(p => p.protocolId === "proto_y")!.lineIndex).toBe(2);
  });

  it("resolveControlReorder skip (no whose) ends turn without reordering", () => {
    const state = stateWithProtocols();
    state.pendingControlReorder = 0;
    state.turnPhase = "EffectResolution" as any;

    const result = resolveControlReorder(state, 0);
    expect(result.success).toBe(true);
    expect(state.pendingControlReorder).toBeNull();
    // Protocols unchanged
    expect(state.players[0].protocols.find(p => p.protocolId === "proto_a")!.lineIndex).toBe(0);
    expect(state.players[0].protocols.find(p => p.protocolId === "proto_b")!.lineIndex).toBe(1);
    expect(state.players[0].protocols.find(p => p.protocolId === "proto_c")!.lineIndex).toBe(2);
  });

  it("resolveControlReorder rejects if wrong player", () => {
    const state = stateWithProtocols();
    state.pendingControlReorder = 0;
    state.turnPhase = "EffectResolution" as any;

    const result = resolveControlReorder(state, 1, "self", ["proto_x", "proto_y", "proto_z"]);
    expect(result.success).toBe(false);
    expect(state.pendingControlReorder).toBe(0); // unchanged
  });

  it("resolveControlReorder ignores invalid protocol ids", () => {
    const state = stateWithProtocols();
    state.pendingControlReorder = 0;
    state.turnPhase = "EffectResolution" as any;

    const result = resolveControlReorder(state, 0, "self", ["proto_a", "proto_b", "proto_WRONG"]);
    expect(result.success).toBe(true); // action resolved (treated as skip)
    expect(state.pendingControlReorder).toBeNull();
    // Protocols unchanged (invalid order was silently skipped)
    expect(state.players[0].protocols.find(p => p.protocolId === "proto_a")!.lineIndex).toBe(0);
  });
});

// ─── delete_self_if_field_protocols_below ────────────────────────────────────

describe("executeEffect — delete_self_if_field_protocols_below (div_5)", () => {
  it("deletes source when distinct protocols in field are below threshold", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "div5", defId: "div_5", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [src];
    // only 2 distinct protocols in field: div + spd
    state.players[1].lines[0].cards = [{ instanceId: "spd", defId: "spd_3", face: CardFace.FaceDown }];

    executeEffect(state, effect("delete_self_if_field_protocols_below", 0, { minDistinct: 4 }, "div5"));

    expect(state.players[0].lines[0].cards).toHaveLength(0);
    expect(state.trashes[0].some((c) => c.instanceId === "div5")).toBe(true);
  });

  it("does not delete source when threshold is met", () => {
    const state = makeState();
    const src: CardInstance = { instanceId: "div5", defId: "div_5", face: CardFace.FaceUp };
    state.players[0].lines[0].cards = [src];
    // 4 distinct protocols in field: div, spd, drk, lif
    state.players[0].lines[1].cards = [{ instanceId: "a", defId: "spd_1", face: CardFace.FaceUp }];
    state.players[1].lines[0].cards = [{ instanceId: "b", defId: "drk_1", face: CardFace.FaceUp }];
    state.players[1].lines[1].cards = [{ instanceId: "c", defId: "lif_1", face: CardFace.FaceDown }];

    executeEffect(state, effect("delete_self_if_field_protocols_below", 0, { minDistinct: 4 }, "div5"));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
    expect(state.trashes[0].some((c) => c.instanceId === "div5")).toBe(false);
  });
});

describe("executeEffect — draw_per_protocol_cards_in_field (uni_2)", () => {
  it("draws one card per matching protocol card in the field", () => {
    const state = makeState();
    state.decks[0] = [
      { instanceId: "d1", defId: "spd_1", face: CardFace.FaceDown },
      { instanceId: "d2", defId: "spd_3", face: CardFace.FaceDown },
      { instanceId: "d3", defId: "spd_5", face: CardFace.FaceDown },
    ];
    state.players[0].deckSize = 3;
    state.players[0].lines[0].cards = [{ instanceId: "u1", defId: "uni_2", face: CardFace.FaceUp }];
    state.players[1].lines[1].cards = [{ instanceId: "u2", defId: "uni_3", face: CardFace.FaceDown }];

    executeEffect(state, effect("draw_per_protocol_cards_in_field", 0, { protocolId: "proto_uni" }));

    expect(state.players[0].hand).toHaveLength(2);
    expect(state.players[0].deckSize).toBe(1);
  });

  it("does nothing when there are no matching protocol cards", () => {
    const state = makeState();
    state.decks[0] = [{ instanceId: "d1", defId: "spd_1", face: CardFace.FaceDown }];
    state.players[0].deckSize = 1;

    executeEffect(state, effect("draw_per_protocol_cards_in_field", 0, { protocolId: "proto_uni" }));

    expect(state.players[0].hand).toHaveLength(0);
    expect(state.players[0].deckSize).toBe(1);
  });
});

describe("executeEffect — draw_per_distinct_protocols_in_source_line (div_1)", () => {
  it("draws one card per distinct protocol across both sides of the source line", () => {
    const state = makeState();
    state.decks[0] = [
      { instanceId: "d1", defId: "spd_1", face: CardFace.FaceDown },
      { instanceId: "d2", defId: "spd_3", face: CardFace.FaceDown },
      { instanceId: "d3", defId: "spd_5", face: CardFace.FaceDown },
    ];
    state.players[0].deckSize = 3;
    state.players[0].lines[0].cards = [
      { instanceId: "div1", defId: "div_1", face: CardFace.FaceUp },
      { instanceId: "spd", defId: "spd_2", face: CardFace.FaceUp },
    ];
    state.players[1].lines[0].cards = [
      { instanceId: "drk", defId: "drk_1", face: CardFace.FaceUp },
    ];

    executeEffect(state, effect("draw_per_distinct_protocols_in_source_line", 0, {}, "div1"));

    expect(state.players[0].hand).toHaveLength(3);
    expect(state.players[0].deckSize).toBe(0);
  });
});

describe("executeEffect — draw_all_protocol_from_deck_if_hand_empty (uni_4)", () => {
  it("draws all matching protocol cards from deck when hand is empty and shuffles the rest", () => {
    const state = makeState();
    state.decks[0] = [
      { instanceId: "u1", defId: "uni_1", face: CardFace.FaceDown },
      { instanceId: "s1", defId: "spd_1", face: CardFace.FaceDown },
      { instanceId: "u5", defId: "uni_5", face: CardFace.FaceDown },
    ];
    state.players[0].deckSize = 3;

    executeEffect(state, effect("draw_all_protocol_from_deck_if_hand_empty", 0, { protocolId: "proto_uni" }));

    expect(state.players[0].hand.map((c) => c.defId).sort()).toEqual(["uni_1", "uni_5"]);
    expect(state.players[0].hand.every((c) => c.face === CardFace.FaceUp)).toBe(true);
    expect(state.decks[0]).toHaveLength(1);
    expect(state.decks[0][0].defId).toBe("spd_1");
    expect(state.players[0].deckSize).toBe(1);
  });

  it("skips when hand is not empty", () => {
    const state = makeState();
    state.players[0].hand.push({ instanceId: "h1", defId: "spd_1", face: CardFace.FaceUp });
    state.decks[0] = [{ instanceId: "u1", defId: "uni_1", face: CardFace.FaceDown }];
    state.players[0].deckSize = 1;

    executeEffect(state, effect("draw_all_protocol_from_deck_if_hand_empty", 0, { protocolId: "proto_uni" }));

    expect(state.players[0].hand).toHaveLength(1);
    expect(state.decks[0]).toHaveLength(1);
  });
});

describe("executeEffect — draw_value_from_deck_then_shuffle (clr_3)", () => {
  it("draws one matching value card from deck and shuffles the rest", () => {
    const state = makeState();
    state.decks[0] = [
      { instanceId: "a", defId: "spd_1", face: CardFace.FaceDown },
      { instanceId: "b", defId: "spd_5", face: CardFace.FaceDown },
      { instanceId: "c", defId: "drk_2", face: CardFace.FaceDown },
    ];
    state.players[0].deckSize = 3;

    executeEffect(state, effect("draw_value_from_deck_then_shuffle", 0, { value: 5 }));

    expect(state.players[0].hand).toHaveLength(1);
    expect(state.players[0].hand[0].defId).toBe("spd_5");
    expect(state.players[0].hand[0].face).toBe(CardFace.FaceUp);
    expect(state.decks[0]).toHaveLength(2);
    expect(state.players[0].deckSize).toBe(2);
  });

  it("just shuffles when no matching value exists", () => {
    const state = makeState();
    state.decks[0] = [
      { instanceId: "a", defId: "spd_1", face: CardFace.FaceDown },
      { instanceId: "b", defId: "drk_2", face: CardFace.FaceDown },
    ];
    state.players[0].deckSize = 2;

    executeEffect(state, effect("draw_value_from_deck_then_shuffle", 0, { value: 5 }));

    expect(state.players[0].hand).toHaveLength(0);
    expect(state.decks[0]).toHaveLength(2);
    expect(state.pendingLogs.some((l) => l.includes("no value-5 card found"))).toBe(true);
  });
});

describe("executeEffect — flip (div_3 field-distinct threshold)", () => {
  it("flips an uncovered card whose value is below the distinct protocol count", () => {
    const state = makeState();
    state.players[0].lines[0].cards = [
      { instanceId: "src", defId: "div_3", face: CardFace.FaceUp },
      { instanceId: "own2", defId: "spd_2", face: CardFace.FaceUp },
    ];
    state.players[1].lines[0].cards = [
      { instanceId: "opp3", defId: "drk_3", face: CardFace.FaceUp },
    ];

    executeEffect(state, effect("flip", 0, { targets: "any_uncovered", maxValueSource: "distinct_protocols_in_field", valueComparison: "lt", targetInstanceId: "own2" }, "src"));

    expect(state.players[0].lines[0].cards[1].face).toBe(CardFace.FaceDown);
  });

  it("skips when the chosen card value is not below the distinct protocol count", () => {
    const state = makeState();
    state.players[0].lines[0].cards = [
      { instanceId: "src", defId: "div_3", face: CardFace.FaceUp },
      { instanceId: "own5", defId: "spd_5", face: CardFace.FaceUp },
    ];
    state.players[1].lines[0].cards = [
      { instanceId: "opp3", defId: "drk_3", face: CardFace.FaceUp },
    ];

    executeEffect(state, effect("flip", 0, { targets: "any_uncovered", maxValueSource: "distinct_protocols_in_field", valueComparison: "lt", targetInstanceId: "own5" }, "src"));

    expect(state.players[0].lines[0].cards[1].face).toBe(CardFace.FaceUp);
  });
});

describe("executeEffect — flip (uni_3 conditional face-up flip)", () => {
  it("flips a face-up uncovered target when another Unity card is in the field", () => {
    const state = makeState();
    state.players[0].lines[0].cards = [
      { instanceId: "src", defId: "uni_3", face: CardFace.FaceUp },
    ];
    state.players[1].lines[1].cards = [
      { instanceId: "otherUnity", defId: "uni_2", face: CardFace.FaceDown },
    ];
    state.players[1].lines[0].cards = [
      { instanceId: "target", defId: "spd_1", face: CardFace.FaceUp },
    ];

    executeEffect(state, effect("flip", 0, { targets: "any_faceup_uncovered", optional: true, protocolId: "proto_uni", minCountInField: 2, targetInstanceId: "target" }, "src"));

    expect(state.players[1].lines[0].cards[0].face).toBe(CardFace.FaceDown);
  });

  it("skips when there is no other Unity card in the field", () => {
    const state = makeState();
    state.players[0].lines[0].cards = [
      { instanceId: "src", defId: "uni_3", face: CardFace.FaceUp },
    ];
    state.players[1].lines[0].cards = [
      { instanceId: "target", defId: "spd_1", face: CardFace.FaceUp },
    ];

    executeEffect(state, effect("flip", 0, { targets: "any_faceup_uncovered", optional: true, protocolId: "proto_uni", minCountInField: 2, targetInstanceId: "target" }, "src"));

    expect(state.players[1].lines[0].cards[0].face).toBe(CardFace.FaceUp);
    expect(state.pendingLogs.some((l) => l.includes("fewer than 2"))).toBe(true);
  });
});

describe("executeEffect — flip (mir_3 follow-up same-line target)", () => {
  it("flips an opponent uncovered card in the same line as the last targeted own card", () => {
    const state = makeState();
    state.players[0].lines[1].cards = [
      { instanceId: "own", defId: "mir_3", face: CardFace.FaceDown },
    ];
    state.players[1].lines[1].cards = [
      { instanceId: "opp", defId: "spd_1", face: CardFace.FaceUp },
    ];
    state.lastTargetedInstanceId = "own";

    executeEffect(state, effect("flip", 0, { targets: "opponent_in_last_target_line", targetInstanceId: "opp" }));

    expect(state.players[1].lines[1].cards[0].face).toBe(CardFace.FaceDown);
  });

  it("skips when the opponent target is not in the same line as the last targeted own card", () => {
    const state = makeState();
    state.players[0].lines[1].cards = [
      { instanceId: "own", defId: "mir_3", face: CardFace.FaceDown },
    ];
    state.players[1].lines[0].cards = [
      { instanceId: "opp", defId: "spd_1", face: CardFace.FaceUp },
    ];
    state.lastTargetedInstanceId = "own";

    executeEffect(state, effect("flip", 0, { targets: "opponent_in_last_target_line", targetInstanceId: "opp" }));

    expect(state.players[1].lines[0].cards[0].face).toBe(CardFace.FaceUp);
    expect(state.pendingLogs.some((l) => l.includes("same line as the last targeted"))).toBe(true);
  });
});

describe("executeEffect — shift (targets=any_uncovered)", () => {
  it("shifts an uncovered card from either side to the chosen line", () => {
    const state = makeState();
    state.players[1].lines[0].cards = [
      { instanceId: "opp1", defId: "spd_1", face: CardFace.FaceUp },
    ];

    executeEffect(state, effect("shift", 0, { targets: "any_uncovered", targetInstanceId: "opp1", targetLineIndex: 2 }));

    expect(state.players[1].lines[0].cards).toHaveLength(0);
    expect(state.players[1].lines[2].cards[0].instanceId).toBe("opp1");
  });
});

// ─── reshuffle_trash ──────────────────────────────────────────────────────────

describe("executeEffect — reshuffle_trash (clr_4)", () => {
  it("moves all owner trash cards back into the deck face-down", () => {
    const state = makeState();
    state.trashes[0] = [
      { instanceId: "t1", defId: "spd_1", face: CardFace.FaceUp },
      { instanceId: "t2", defId: "spd_5", face: CardFace.FaceUp },
    ];
    state.players[0].trashSize = 2;
    executeEffect(state, effect("reshuffle_trash", 0, {}));
    expect(state.trashes[0]).toHaveLength(0);
    expect(state.players[0].trashSize).toBe(0);
    expect(state.decks[0]).toHaveLength(2);
    expect(state.players[0].deckSize).toBe(2);
    expect(state.decks[0].every((c) => c.face === CardFace.FaceDown)).toBe(true);
  });

  it("no-op when trash is already empty", () => {
    const state = makeState();
    state.trashes[0] = [];
    const deckBefore = state.decks[0].length;
    executeEffect(state, effect("reshuffle_trash", 0, {}));
    expect(state.decks[0]).toHaveLength(deckBefore);
    expect(state.pendingLogs.some((l) => l.includes("trash is already empty"))).toBe(true);
  });
});

// ─── swap_top_deck_draws ──────────────────────────────────────────────────────

describe("executeEffect — swap_top_deck_draws (cha_0 / asm_4)", () => {
  it("each player draws the top card of the other's deck face-up", () => {
    const state = makeState();
    state.decks[0] = [{ instanceId: "d0", defId: "spd_1", face: CardFace.FaceDown }];
    state.decks[1] = [{ instanceId: "d1", defId: "spd_5", face: CardFace.FaceDown }];
    state.players[0].deckSize = 1;
    state.players[1].deckSize = 1;

    executeEffect(state, effect("swap_top_deck_draws", 0, {}));

    // Owner (p0) should have drawn from opponent's (p1's) deck
    expect(state.players[0].hand.some((c) => c.instanceId === "d1")).toBe(true);
    expect(state.players[0].hand[0].face).toBe(CardFace.FaceUp);
    // Opponent (p1) should have drawn from owner's (p0's) deck
    expect(state.players[1].hand.some((c) => c.instanceId === "d0")).toBe(true);
    expect(state.players[1].hand[0].face).toBe(CardFace.FaceUp);
    expect(state.decks[0]).toHaveLength(0);
    expect(state.decks[1]).toHaveLength(0);
  });

  it("works when only one player has a deck card", () => {
    const state = makeState();
    state.decks[0] = [];
    state.decks[1] = [{ instanceId: "d1", defId: "spd_3", face: CardFace.FaceDown }];
    state.players[0].deckSize = 0;
    state.players[1].deckSize = 1;

    executeEffect(state, effect("swap_top_deck_draws", 0, {}));

    expect(state.players[0].hand.some((c) => c.instanceId === "d1")).toBe(true);
    expect(state.players[1].hand).toHaveLength(0);
  });
});

// ─── flip_covered_in_each_line ────────────────────────────────────────────────

describe("executeEffect — flip_covered_in_each_line (cha_0 immediate)", () => {
  it("flips the deepest covered card in each line for both players", () => {
    const state = makeState();
    const bot = { instanceId: "bot", defId: "spd_1", face: CardFace.FaceDown as CardFace };
    const mid = { instanceId: "mid", defId: "spd_3", face: CardFace.FaceUp  as CardFace };
    const top = { instanceId: "top", defId: "spd_5", face: CardFace.FaceUp  as CardFace };
    state.players[0].lines[0].cards = [bot, mid, top];

    executeEffect(state, effect("flip_covered_in_each_line", 0, {}));

    // bot (deepest covered, index 0) should be flipped to FaceUp
    expect(state.players[0].lines[0].cards[0].face).toBe(CardFace.FaceUp);
  });

  it("skips lines with fewer than 2 cards (no covered cards)", () => {
    const state = makeState();
    const solo = { instanceId: "solo", defId: "spd_3", face: CardFace.FaceUp as CardFace };
    state.players[0].lines[0].cards = [solo];

    executeEffect(state, effect("flip_covered_in_each_line", 0, {}));

    expect(state.players[0].lines[0].cards[0].face).toBe(CardFace.FaceUp);
  });
});

// ─── flip_self_if_opponent_higher_in_line ─────────────────────────────────────

describe("executeEffect — flip_self_if_opponent_higher_in_line (crg_6)", () => {
  it("flips source card when opponent has higher line value", () => {
    const state = makeState();
    const src = { instanceId: "src", defId: "spd_1", face: CardFace.FaceUp as CardFace };
    state.players[0].lines[0].cards = [src];
    // Opponent has value 3 in line 0 vs owner value 1
    state.players[1].lines[0].cards = [{ instanceId: "opp", defId: "spd_3", face: CardFace.FaceUp as CardFace }];

    executeEffect(state, effect("flip_self_if_opponent_higher_in_line", 0, {}, "src"));

    expect(src.face).toBe(CardFace.FaceDown);
  });

  it("does not flip when owner has equal or higher line value", () => {
    const state = makeState();
    const src = { instanceId: "src", defId: "spd_5", face: CardFace.FaceUp as CardFace };
    state.players[0].lines[0].cards = [src];
    state.players[1].lines[0].cards = [{ instanceId: "opp", defId: "spd_3", face: CardFace.FaceUp as CardFace }];

    executeEffect(state, effect("flip_self_if_opponent_higher_in_line", 0, {}, "src"));

    expect(src.face).toBe(CardFace.FaceUp);
  });
});

// ─── discard_or_delete_self ───────────────────────────────────────────────────

describe("executeEffect — discard_or_delete_self (cor_6)", () => {
  it("discards the chosen hand card when a targetInstanceId is provided", () => {
    const state = makeState();
    state.players[0].hand = [{ instanceId: "h1", defId: "spd_3", face: CardFace.FaceUp }];
    const src = { instanceId: "src", defId: "spd_1", face: CardFace.FaceUp as CardFace };
    state.players[0].lines[0].cards = [src];

    executeEffect(state, effect("discard_or_delete_self", 0, { targetInstanceId: "h1" }, "src"));

    expect(state.players[0].hand).toHaveLength(0);
    expect(state.trashes[0].some((c) => c.instanceId === "h1")).toBe(true);
    // Source card stays in line
    expect(state.players[0].lines[0].cards).toHaveLength(1);
  });

  it("deletes the source card when no targetInstanceId is provided", () => {
    const state = makeState();
    state.players[0].hand = [];
    const src = { instanceId: "src", defId: "spd_1", face: CardFace.FaceUp as CardFace };
    state.players[0].lines[0].cards = [src];

    executeEffect(state, effect("discard_or_delete_self", 0, {}, "src"));

    expect(state.players[0].lines[0].cards).toHaveLength(0);
    expect(state.trashes[0].some((c) => c.instanceId === "src")).toBe(true);
  });
});

// ─── take_opponent_facedown_to_hand ──────────────────────────────────────────

describe("executeEffect — take_opponent_facedown_to_hand (asm_0)", () => {
  it("moves a face-down opponent card to owner's hand", () => {
    const state = makeState();
    const tgt = { instanceId: "ofd1", defId: "spd_3", face: CardFace.FaceDown as CardFace };
    state.players[1].lines[0].cards = [tgt];

    executeEffect(state, effect("take_opponent_facedown_to_hand", 0, { targetInstanceId: "ofd1" }));

    expect(state.players[1].lines[0].cards).toHaveLength(0);
    expect(state.players[0].hand.some((c) => c.instanceId === "ofd1")).toBe(true);
    expect(state.players[0].hand[0].face).toBe(CardFace.FaceUp);
  });

  it("rejects a face-up opponent card", () => {
    const state = makeState();
    const tgt = { instanceId: "ofu1", defId: "spd_3", face: CardFace.FaceUp as CardFace };
    state.players[1].lines[0].cards = [tgt];

    executeEffect(state, effect("take_opponent_facedown_to_hand", 0, { targetInstanceId: "ofu1" }));

    expect(state.players[1].lines[0].cards).toHaveLength(1);
    expect(state.players[0].hand).toHaveLength(0);
  });

  it("moves even a covered face-down opponent card", () => {
    const state = makeState();
    const covered = { instanceId: "cov1", defId: "spd_1", face: CardFace.FaceDown as CardFace };
    const top     = { instanceId: "top1", defId: "spd_5", face: CardFace.FaceUp  as CardFace };
    state.players[1].lines[0].cards = [covered, top];

    executeEffect(state, effect("take_opponent_facedown_to_hand", 0, { targetInstanceId: "cov1" }));

    expect(state.players[0].hand.some((c) => c.instanceId === "cov1")).toBe(true);
    expect(state.players[1].lines[0].cards).toHaveLength(1);
  });
});

// ─── delete_in_winning_line ───────────────────────────────────────────────────

describe("executeEffect — delete_in_winning_line (crg_1)", () => {
  it("deletes uncovered opponent card when opponent has higher line value", () => {
    const state = makeState();
    const tgt = { instanceId: "opp1", defId: "spd_3", face: CardFace.FaceUp as CardFace };
    state.players[1].lines[0].cards = [tgt];
    // Owner line 0 has value 1 < opponent value 3
    state.players[0].lines[0].cards = [{ instanceId: "own1", defId: "spd_1", face: CardFace.FaceUp as CardFace }];

    executeEffect(state, effect("delete_in_winning_line", 0, { targetInstanceId: "opp1" }));

    expect(state.players[1].lines[0].cards).toHaveLength(0);
    expect(state.trashes[1].some((c) => c.instanceId === "opp1")).toBe(true);
  });

  it("rejects deletion when opponent does NOT have higher line value", () => {
    const state = makeState();
    const tgt = { instanceId: "opp1", defId: "spd_1", face: CardFace.FaceUp as CardFace };
    state.players[1].lines[0].cards = [tgt];
    state.players[0].lines[0].cards = [{ instanceId: "own1", defId: "spd_3", face: CardFace.FaceUp as CardFace }];

    executeEffect(state, effect("delete_in_winning_line", 0, { targetInstanceId: "opp1" }));

    expect(state.players[1].lines[0].cards).toHaveLength(1);
  });

  it("rejects covered opponent cards", () => {
    const state = makeState();
    const covered = { instanceId: "cov1", defId: "spd_3", face: CardFace.FaceUp as CardFace };
    const top     = { instanceId: "top1", defId: "spd_5", face: CardFace.FaceUp as CardFace };
    state.players[1].lines[0].cards = [covered, top];
    state.players[0].lines[0].cards = [];

    executeEffect(state, effect("delete_in_winning_line", 0, { targetInstanceId: "cov1" }));

    expect(state.players[1].lines[0].cards).toHaveLength(2);
  });
});

// ─── shift_self_to_best_opponent_line ────────────────────────────────────────

describe("executeEffect — shift_self_to_best_opponent_line (crg_3)", () => {
  it("moves source card to the line where opponent has highest value", () => {
    const state = makeState();
    const src = { instanceId: "src", defId: "spd_1", face: CardFace.FaceUp as CardFace };
    state.players[0].lines[0].cards = [src];
    // Line 2 has highest opponent value (5)
    state.players[1].lines[0].cards = [{ instanceId: "o0", defId: "spd_1", face: CardFace.FaceUp as CardFace }];
    state.players[1].lines[1].cards = [{ instanceId: "o1", defId: "spd_3", face: CardFace.FaceUp as CardFace }];
    state.players[1].lines[2].cards = [{ instanceId: "o2", defId: "spd_5", face: CardFace.FaceUp as CardFace }];

    executeEffect(state, effect("shift_self_to_best_opponent_line", 0, {}, "src"));

    expect(state.players[0].lines[0].cards).toHaveLength(0);
    expect(state.players[0].lines[2].cards.some((c) => c.instanceId === "src")).toBe(true);
  });

  it("stays put when already in best opponent line", () => {
    const state = makeState();
    const src = { instanceId: "src", defId: "spd_1", face: CardFace.FaceUp as CardFace };
    state.players[0].lines[0].cards = [src];
    state.players[1].lines[0].cards = [{ instanceId: "o0", defId: "spd_5", face: CardFace.FaceUp as CardFace }];

    executeEffect(state, effect("shift_self_to_best_opponent_line", 0, {}, "src"));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
    expect(state.pendingLogs.some((l) => l.includes("already in best line"))).toBe(true);
  });
});

// ─── discard_then_opponent_discard ────────────────────────────────────────────

describe("executeEffect — discard_then_opponent_discard (crg_0 end)", () => {
  it("discards chosen card and queues opponent discard", () => {
    const state = makeState();
    state.players[0].hand = [{ instanceId: "h1", defId: "spd_3", face: CardFace.FaceUp }];

    executeEffect(state, effect("discard_then_opponent_discard", 0, { targetInstanceId: "h1" }));

    expect(state.players[0].hand).toHaveLength(0);
    expect(state.trashes[0].some((c) => c.instanceId === "h1")).toBe(true);
    // Opponent discard queued
    const queued = state.effectQueue.find((e) => e.type === "discard" && e.ownerIndex === 1);
    expect(queued).toBeDefined();
  });

  it("skips entirely when no card is chosen (optional)", () => {
    const state = makeState();
    state.players[0].hand = [{ instanceId: "h1", defId: "spd_3", face: CardFace.FaceUp }];

    executeEffect(state, effect("discard_then_opponent_discard", 0, {}));

    expect(state.players[0].hand).toHaveLength(1);
    expect(state.effectQueue).toHaveLength(0);
    expect(state.pendingLogs.some((l) => l.includes("skipped"))).toBe(true);
  });
});

// ─── shift — own_covered target mode ─────────────────────────────────────────

describe("executeEffect — shift (own_covered)", () => {
  it("moves own covered card to another own line", () => {
    const state = makeState();
    const covered = card("cov1", CardFace.FaceDown);
    const top     = card("top1", CardFace.FaceUp);
    state.players[0].lines[0].cards = [covered, top];

    executeEffect(state, effect("shift", 0, { targets: "own_covered", targetInstanceId: "cov1", targetLineIndex: 2 }));

    expect(state.players[0].lines[0].cards.map((c) => c.instanceId)).not.toContain("cov1");
    expect(state.players[0].lines[2].cards.some((c) => c.instanceId === "cov1")).toBe(true);
  });

  it("rejects a top (uncovered) own card", () => {
    const state = makeState();
    const top = card("top1", CardFace.FaceUp);
    state.players[0].lines[0].cards = [top];

    executeEffect(state, effect("shift", 0, { targets: "own_covered", targetInstanceId: "top1", targetLineIndex: 2 }));

    expect(state.players[0].lines[0].cards).toHaveLength(1);
    expect(state.players[0].lines[2].cards).toHaveLength(0);
  });
});

// ─── shift — opponent_in_source_line target mode ──────────────────────────────

describe("executeEffect — shift (opponent_in_source_line)", () => {
  it("moves opponent's uncovered card from the same line as source to another opponent line", () => {
    const state = makeState();
    const src  = card("src1", CardFace.FaceUp);
    const oppCard = card("opp1", CardFace.FaceUp);
    state.players[0].lines[1].cards = [src];
    state.players[1].lines[1].cards = [oppCard];

    executeEffect(state, effect(
      "shift", 0,
      { targets: "opponent_in_source_line", targetInstanceId: "opp1", targetLineIndex: 0 },
      "src1"
    ));

    expect(state.players[1].lines[1].cards).toHaveLength(0);
    expect(state.players[1].lines[0].cards.some((c) => c.instanceId === "opp1")).toBe(true);
  });
});
