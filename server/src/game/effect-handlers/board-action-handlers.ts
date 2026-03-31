import { CardFace, CardInstance } from "@compile/shared";
import { enqueueEffectsOnCover, flipSourceCard, scanPassives } from "../CardEffects";
import { drawCards } from "../GameEngine";
import { CARD_MAP } from "../../data/cards";
import { EffectHandler, registerHandler } from "./registry";

const handleReturnOppFlipSelf: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload, sourceInstanceId } = effect;
  const oi = ownerIndex === 0 ? 1 : 0;

  const targetId = payload.targetInstanceId as string | undefined;
  if (!targetId) {
    log("return_opp_flip_self: skipped (no target chosen)");
    return;
  }

  let returned = false;
  outer: for (const line of state.players[oi].lines) {
    const idx = line.cards.findIndex((c) => c.instanceId === targetId);
    if (idx === -1) continue;

    const [card] = line.cards.splice(idx, 1);
    card.face = CardFace.FaceUp;
    state.players[oi].hand.push(card);
    log(`return_opp_flip_self: returned ${card.defId} to opponent hand`);
    returned = true;
    break outer;
  }

  if (!returned) {
    log(`return_opp_flip_self: target ${targetId} not found in opponent lines`);
    return;
  }

  if (sourceInstanceId) {
    flipSourceCard(state, sourceInstanceId, log);
  }
};

registerHandler("return_opp_flip_self", handleReturnOppFlipSelf);

const handleDeleteHighestBoth: EffectHandler = (state, effect, log) => {
  const { ownerIndex } = effect;

  for (let pi = 0; pi < 2; pi++) {
    let highest: CardInstance | null = null;
    let highestVal = -1;

    for (const line of state.players[pi as 0 | 1].lines) {
      for (const c of line.cards) {
        if (c.face !== CardFace.FaceUp) continue;
        const def = CARD_MAP.get(c.defId);
        const val = def?.value ?? 0;
        if (val > highestVal) {
          highestVal = val;
          highest = c;
        }
      }
    }

    if (!highest) {
      log(`delete_highest_both: no face-up cards for player ${pi}`);
      continue;
    }

    for (const line of state.players[pi as 0 | 1].lines) {
      const idx = line.cards.indexOf(highest);
      if (idx === -1) continue;

      const [trashed] = line.cards.splice(idx, 1);
      state.trashes[pi as 0 | 1].push(trashed);
      state.players[pi as 0 | 1].trashSize = state.trashes[pi as 0 | 1].length;
      log(`delete_highest_both: removed ${trashed.defId} (value ${highestVal}) from player ${pi}`);
      break;
    }
  }

  for (const { card, amount: drawAmt } of scanPassives(state, ownerIndex, "after_delete_draw")) {
    log(`after_delete_draw (${card.defId}): drawing ${drawAmt}`);
    drawCards(state, ownerIndex, drawAmt);
  }
};

registerHandler("delete_highest_both", handleDeleteHighestBoth);

const handleShiftFlipSelf: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload, sourceInstanceId } = effect;
  const targetId = payload.targetInstanceId as string | undefined;
  const targetLineIndex = payload.targetLineIndex as number | undefined;

  if (!targetId) {
    log("shift_flip_self: skipped (no card chosen to shift)");
    return;
  }
  if (targetLineIndex === undefined || targetLineIndex < 0 || targetLineIndex > 2) {
    log("shift_flip_self: invalid or missing targetLineIndex");
    return;
  }

  let shifted = false;
  outer: for (let li = 0; li < 3; li++) {
    const line = state.players[ownerIndex].lines[li];
    const idx = line.cards.findIndex((c) => c.instanceId === targetId);
    if (idx === -1) continue;

    if (li === targetLineIndex) {
      log("shift_flip_self: card is already in the target line");
      break outer;
    }

    const [moved] = line.cards.splice(idx, 1);
    const destLine = state.players[ownerIndex].lines[targetLineIndex];
    const prevTop = destLine.cards.length > 0 ? destLine.cards[destLine.cards.length - 1] : null;
    destLine.cards.push(moved);
    if (prevTop) enqueueEffectsOnCover(state, prevTop, ownerIndex);
    log(`shift_flip_self: moved ${moved.defId} from line ${li} to line ${targetLineIndex}`);
    shifted = true;
    break outer;
  }

  if (shifted && sourceInstanceId) {
    flipSourceCard(state, sourceInstanceId, log);
  } else if (!shifted) {
    log(`shift_flip_self: card ${targetId} not found in own lines`);
  }
};

registerHandler("shift_flip_self", handleShiftFlipSelf);
