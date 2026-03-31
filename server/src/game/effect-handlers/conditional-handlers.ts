import {
  CardFace,
  countCardsInFieldByProtocol,
  countDistinctProtocolsInLine,
  getOpponentIndex,
} from "@compile/shared";
import { CARD_MAP } from "../../data/cards";
import { flipSourceCard, findSourceLineIndex } from "../CardEffects";
import { lineValue, drawCards } from "../GameEngine";
import { shuffle } from "../DraftEngine";
import { EffectHandler, registerHandler } from "./registry";

const handleDrawPerDistinctProtocolsInSourceLine: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId } = effect;
  const srcLine = findSourceLineIndex(state, ownerIndex, sourceInstanceId);
  if (srcLine === -1) {
    log("draw_per_distinct_protocols_in_source_line: source line not found");
    return;
  }

  const amount = countDistinctProtocolsInLine(state, srcLine, CARD_MAP);
  log(`draw_per_distinct_protocols_in_source_line: drawing ${amount}`);
  drawCards(state, ownerIndex, amount);
};

registerHandler(
  "draw_per_distinct_protocols_in_source_line",
  handleDrawPerDistinctProtocolsInSourceLine,
);

const handleDrawAllProtocolFromDeckIfHandEmpty: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const protocolId = payload.protocolId as string | undefined;

  if (!protocolId) {
    log("draw_all_protocol_from_deck_if_hand_empty: missing protocolId");
    return;
  }
  if (state.players[ownerIndex].hand.length > 0) {
    log("draw_all_protocol_from_deck_if_hand_empty: skipped (hand not empty)");
    return;
  }

  const deck = state.decks[ownerIndex];
  const matching = [] as typeof deck;
  const remaining = [] as typeof deck;
  for (const card of deck) {
    const def = CARD_MAP.get(card.defId);
    if (def?.protocolId === protocolId) matching.push(card);
    else remaining.push(card);
  }

  state.decks[ownerIndex] = shuffle(remaining);
  state.players[ownerIndex].deckSize = state.decks[ownerIndex].length;
  for (const card of matching) {
    card.face = CardFace.FaceUp;
    state.players[ownerIndex].hand.push(card);
  }

  log(
    `draw_all_protocol_from_deck_if_hand_empty: drew ${matching.length} matching card(s) and shuffled deck`,
  );
};

registerHandler(
  "draw_all_protocol_from_deck_if_hand_empty",
  handleDrawAllProtocolFromDeckIfHandEmpty,
);

const handleFlipSelfIfHandGt: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload, sourceInstanceId } = effect;
  const threshold = (payload.threshold as number) ?? 0;

  if (state.players[ownerIndex].hand.length > threshold) {
    if (sourceInstanceId) flipSourceCard(state, sourceInstanceId, log);
    return;
  }

  log(`flip_self_if_hand_gt: skipped (hand size not greater than ${threshold})`);
};

registerHandler("flip_self_if_hand_gt", handleFlipSelfIfHandGt);

const handleFlipSelf: EffectHandler = (state, effect, log) => {
  const { sourceInstanceId } = effect;
  if (!sourceInstanceId) {
    log("flip_self: no sourceInstanceId");
    return;
  }

  flipSourceCard(state, sourceInstanceId, log);
};

registerHandler("flip_self", handleFlipSelf);

const handleFlipSelfIfOpponentHigherInLine: EffectHandler = (state, effect, log) => {
  const { ownerIndex, sourceInstanceId } = effect;
  const oi = getOpponentIndex(ownerIndex);

  if (!sourceInstanceId) {
    log("flip_self_if_opponent_higher_in_line: no sourceInstanceId");
    return;
  }

  const srcLine = findSourceLineIndex(state, ownerIndex, sourceInstanceId);
  if (srcLine === -1) {
    log("flip_self_if_opponent_higher_in_line: source line not found");
    return;
  }

  if (lineValue(state, oi, srcLine) > lineValue(state, ownerIndex, srcLine)) {
    log("flip_self_if_opponent_higher_in_line: condition met — flipping self");
    flipSourceCard(state, sourceInstanceId, log);
    return;
  }

  log("flip_self_if_opponent_higher_in_line: skipped (opponent not higher)");
};

registerHandler("flip_self_if_opponent_higher_in_line", handleFlipSelfIfOpponentHigherInLine);

const handleDrawPerProtocolCardsInField: EffectHandler = (state, effect, log) => {
  const { ownerIndex, payload } = effect;
  const protocolId = payload.protocolId as string | undefined;

  if (!protocolId) {
    log("draw_per_protocol_cards_in_field: missing protocolId");
    return;
  }

  const amount = countCardsInFieldByProtocol(state, protocolId, CARD_MAP);
  if (amount <= 0) {
    log(`draw_per_protocol_cards_in_field: no ${protocolId} cards in field`);
    return;
  }

  log(`draw_per_protocol_cards_in_field: drawing ${amount} for protocol ${protocolId}`);
  drawCards(state, ownerIndex, amount);
};

registerHandler("draw_per_protocol_cards_in_field", handleDrawPerProtocolCardsInField);
