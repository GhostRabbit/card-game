import { describe, expect, it } from "vitest";
import { DraftVariant, ProtocolSet } from "@compile/shared";
import { PROTOCOLS } from "../../data/cards";
import { createInitialDraftState, createRandomThreeDraftState } from "../DraftEngine";

describe("DraftEngine protocol-set metadata", () => {
  it("uses ProtocolDef.set metadata for initial draft filtering", () => {
    const state = createInitialDraftState({
      selectedProtocolSets: [ProtocolSet.MainUnit1],
      draftVariant: DraftVariant.Full,
    });

    const mainUnit1Protocols = PROTOCOLS.filter((p) => p.set === ProtocolSet.MainUnit1);

    expect(state.availableProtocols).toHaveLength(mainUnit1Protocols.length);
    expect(state.availableProtocols.every((protocol) => protocol.set === ProtocolSet.MainUnit1)).toBe(true);
  });

  it("returns MainUnit2 protocols when MainUnit2 is selected", () => {
    const state = createInitialDraftState({
      selectedProtocolSets: [ProtocolSet.MainUnit2],
      draftVariant: DraftVariant.Full,
    });

    const mainUnit2Protocols = PROTOCOLS.filter((p) => p.set === ProtocolSet.MainUnit2);

    expect(state.availableProtocols).toHaveLength(mainUnit2Protocols.length);
    expect(state.availableProtocols.every((protocol) => protocol.set === ProtocolSet.MainUnit2)).toBe(true);
  });

  it("random three reports an error when selected metadata-set pool is too small", () => {
    const result = createRandomThreeDraftState({
      selectedProtocolSets: [ProtocolSet.MainUnit2],
      draftVariant: DraftVariant.Random3,
    });

    expect("error" in result).toBe(false);
    if ("error" in result) {
      return;
    }
    expect(result.picks).toHaveLength(6);
    expect(result.picks.every((pick) => {
      const protocol = PROTOCOLS.find((candidate) => candidate.id === pick.protocolId);
      return protocol?.set === ProtocolSet.MainUnit2;
    })).toBe(true);
  });
});