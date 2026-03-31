import { PendingEffect } from "@compile/shared";
import { ServerGameState } from "../GameEngine";
import { EffectHandler, registerHandler } from "./registry";

const handleRearrangeProtocols: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const whose = payload.whose as "self" | "opponent";
  const targetIndex = whose === "self" ? ownerIndex : ((1 - ownerIndex) as 0 | 1);
  const newOrder = payload.newProtocolOrder as string[] | undefined;

  if (!newOrder || newOrder.length !== 3) {
    log("rearrange_protocols: no valid newProtocolOrder provided");
    return;
  }

  const protocols = state.players[targetIndex].protocols;
  const existingIds = protocols.map((p) => p.protocolId).sort();
  if (JSON.stringify([...newOrder].sort()) !== JSON.stringify(existingIds)) {
    log("rearrange_protocols: newProtocolOrder contains invalid protocol ids");
    return;
  }

  const currentOrder = [...protocols]
    .sort((a, b) => a.lineIndex - b.lineIndex)
    .map((p) => p.protocolId);
  if (JSON.stringify(currentOrder) === JSON.stringify(newOrder)) {
    log("rearrange_protocols: order unchanged — must result in a change");
    return;
  }

  for (let i = 0; i < 3; i++) {
    const proto = protocols.find((p) => p.protocolId === newOrder[i]);
    if (proto) proto.lineIndex = i as 0 | 1 | 2;
  }

  protocols.sort((a, b) => a.lineIndex - b.lineIndex);
  log(`rearrange_protocols ${whose}: [${newOrder.join(", ")}]`);
};

registerHandler("rearrange_protocols", handleRearrangeProtocols);

const handleSwapProtocols: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const swapIds = payload.swapProtocolIds as string[] | undefined;

  if (!swapIds || swapIds.length !== 2) {
    log("swap_protocols: need exactly 2 swapProtocolIds");
    return;
  }

  const protocols = state.players[ownerIndex].protocols;
  const protoA = protocols.find((p) => p.protocolId === swapIds[0]);
  const protoB = protocols.find((p) => p.protocolId === swapIds[1]);
  if (!protoA || !protoB) {
    log("swap_protocols: one or both protocol IDs not found");
    return;
  }
  if (protoA.lineIndex === protoB.lineIndex) {
    log("swap_protocols: protocols already in same line");
    return;
  }

  const tmp = protoA.lineIndex;
  protoA.lineIndex = protoB.lineIndex;
  protoB.lineIndex = tmp;

  state.players[ownerIndex].protocols.sort((a, b) => a.lineIndex - b.lineIndex);
  log(
    `swap_protocols: swapped ${protoA.protocolId} (line ${protoB.lineIndex}) and ${protoB.protocolId} (line ${protoA.lineIndex})`,
  );
};

registerHandler("swap_protocols", handleSwapProtocols);
