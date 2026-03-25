import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CardFace, ProtocolStatus, TurnPhase, type CardInstance, type PlayerState } from "@compile/shared";
import { createServerGameState } from "../../game/GameEngine";
import { Room } from "../Room";

function makeCard(id: string, defId = "lgt_0"): CardInstance {
  return { instanceId: id, defId, face: CardFace.FaceUp };
}

function makePlayer(id: string, username: string, handSize: number): PlayerState {
  return {
    id,
    username,
    protocols: [
      { protocolId: "proto_lgt", status: ProtocolStatus.Loading, lineIndex: 0 },
      { protocolId: "proto_wtr", status: ProtocolStatus.Loading, lineIndex: 1 },
      { protocolId: "proto_psy", status: ProtocolStatus.Loading, lineIndex: 2 },
    ],
    hand: Array.from({ length: handSize }, (_, i) => makeCard(`${id}-h${i}`)),
    deckSize: 0,
    trashSize: 0,
    lines: [{ cards: [] }, { cards: [] }, { cards: [] }],
    hasControl: false,
  };
}

describe("Room CACHE phase sequencing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows CACHE first, then enters cache discard EffectResolution after phase delay", () => {
    const room = new Room("ABCD");

    const s0 = { id: "p0", emit: vi.fn() } as any;
    const s1 = { id: "p1", emit: vi.fn() } as any;
    room.addPlayer(s0, "P0");
    room.addPlayer(s1, "P1");

    const p0 = makePlayer("p0", "P0", 7);
    const p1 = makePlayer("p1", "P1", 5);
    const state = createServerGameState([p0, p1], [[], []]);
    state.activePlayerIndex = 0;
    state.turnPhase = TurnPhase.Action;

    (room as any).gameState = state;

    (room as any).broadcastEndTurnPhases(state);

    // Immediately after starting end-turn sequence, CACHE should be visible.
    expect(state.turnPhase).toBe(TurnPhase.ClearCache);
    expect(state.effectQueue).toHaveLength(0);

    // Still in CACHE before the highlight delay elapses.
    vi.advanceTimersByTime(499);
    expect(state.turnPhase).toBe(TurnPhase.ClearCache);
    expect(state.effectQueue).toHaveLength(0);

    // After delay: enqueue cache discard(s) and switch to effect resolution.
    vi.advanceTimersByTime(1);
    expect(state.turnPhase).toBe(TurnPhase.EffectResolution);
    expect(state.effectQueue).toHaveLength(2);
    expect(state.effectQueue[0].type).toBe("discard");
    expect(state.effectQueue[0].cardDefId).toBe("cache_discard");
    expect(state.effectQueue[0].ownerIndex).toBe(0);
    expect(state.resolutionStack).toHaveLength(1);
    expect(state.resolutionStack[0].context).toBe("cache");
    expect(state.resolutionStack[0].ownerIndex).toBe(0);
  });
});
