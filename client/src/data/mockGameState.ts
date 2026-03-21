import { PlayerView, TurnPhase, CardFace, ProtocolStatus, PendingEffect } from "@compile/shared";
import { CARD_DEFS_CLIENT } from "./cardDefs";

/** A realistic mock PlayerView for dev/testing — bypasses server entirely */
export function createMockView(): { view: PlayerView; turnPhase: TurnPhase } {
  const view: PlayerView = {
    id: "dev-player",
    username: "DevPlayer",
    protocols: [
      { protocolId: "proto_spd", status: ProtocolStatus.Loading,  lineIndex: 0 },
      { protocolId: "proto_dth", status: ProtocolStatus.Compiled, lineIndex: 1 },
      { protocolId: "proto_lgt", status: ProtocolStatus.Loading,  lineIndex: 2 },
    ],
    hand: [
      { instanceId: "h1", defId: "spd_0",  face: CardFace.FaceUp },
      { instanceId: "h2", defId: "spd_3",  face: CardFace.FaceUp },
      { instanceId: "h3", defId: "dth_2",  face: CardFace.FaceUp },
      { instanceId: "h4", defId: "lgt_4",  face: CardFace.FaceUp },
      { instanceId: "h5", defId: "lgt_1",  face: CardFace.FaceUp },
    ],
    deckSize: 13,
    trashSize: 2,
    trash: [
      { instanceId: "t1", defId: "spd_5", face: CardFace.FaceUp },
      { instanceId: "t2", defId: "lgt_5", face: CardFace.FaceUp },
    ],
    lines: [
      { cards: [
          { instanceId: "l0a", defId: "spd_1",  face: CardFace.FaceUp },
          { instanceId: "l0b", defId: "spd_4",  face: CardFace.FaceDown },
        ]
      },
      { cards: [] },
      { cards: [
          { instanceId: "l2a", defId: "lgt_0",  face: CardFace.FaceUp },
          { instanceId: "l2b", defId: "lgt_2",  face: CardFace.FaceUp },
          { instanceId: "l2c", defId: "lgt_3",  face: CardFace.FaceDown },
        ]
      },
    ] as PlayerView["lines"],
    hasControl: true,

    isActivePlayer: true,
    compilableLines: [],
    opponentHandSize: 4,
    opponentDeckSize: 11,
    opponentLines: [
      { cards: [
          { instanceId: "o0a", defId: "drk_1",  face: CardFace.FaceUp },
          { instanceId: "o0b", hidden: true },
        ]
      },
      { cards: [
          { instanceId: "o1a", defId: "fir_3",  face: CardFace.FaceUp },
          { instanceId: "o1b", defId: "fir_4",  face: CardFace.FaceUp },
          { instanceId: "o1c", hidden: true },
        ]
      },
      { cards: [] },
    ] as PlayerView["opponentLines"],
    opponentProtocols: [
      { protocolId: "proto_drk", status: ProtocolStatus.Loading,  lineIndex: 0 },
      { protocolId: "proto_fir", status: ProtocolStatus.Loading,  lineIndex: 1 },
      { protocolId: "proto_hat", status: ProtocolStatus.Compiled, lineIndex: 2 },
    ],
    opponentTrash: [
      { instanceId: "ot1", defId: "drk_5", face: CardFace.FaceUp },
      { instanceId: "ot2", defId: "fir_3", face: CardFace.FaceUp },
      { instanceId: "ot3", defId: "hat_5", face: CardFace.FaceUp },
    ],
    opponentHasControl: false,
    pendingEffect: null,
    opponentPendingEffect: null,
    opponentHandRevealed: null,
    opponentRevealedHandCard: null,
    pendingBonusPlay: null,
    pendingControlReorder: false,
    lineValues: [3, 0, 4],
    opponentLineValues: [3, 9, 0],
  };

  return { view, turnPhase: TurnPhase.Action };
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sampleUnique<T>(arr: T[], count: number): T[] {
  return shuffleInPlace([...arr]).slice(0, count);
}

function cardValue(defId: string): number {
  return CARD_DEFS_CLIENT.get(defId)?.value ?? 0;
}

function visibleLineValue(cards: Array<{ defId: string; face: CardFace }>): number {
  return cards.reduce((sum, c) => sum + (c.face === CardFace.FaceDown ? 2 : cardValue(c.defId)), 0);
}

/** Randomized mock view preserving the same card counts/slots as createMockView. */
export function createRandomizedMockView(): { view: PlayerView; turnPhase: TurnPhase } {
  const allDefIds = [...CARD_DEFS_CLIENT.keys()];
  const prefixes = [...new Set(allDefIds.map((id) => id.split("_")[0]))];

  const ownPrefixes = sampleUnique(prefixes, 3);
  const oppPrefixes = sampleUnique(prefixes, 3);

  const ownProtocolIds = ownPrefixes.map((p) => `proto_${p}`);
  const oppProtocolIds = oppPrefixes.map((p) => `proto_${p}`);

  const ownDefPool = allDefIds.filter((id) => ownPrefixes.includes(id.split("_")[0]));
  const oppDefPool = allDefIds.filter((id) => oppPrefixes.includes(id.split("_")[0]));

  const pickOwn = (n: number) => sampleUnique(ownDefPool, n);
  const pickOpp = (n: number) => sampleUnique(oppDefPool, n);

  // Same counts as the current mock state:
  // own hand 5, own trash 2, own lines 2/0/3
  // opp lines 1 visible + 1 hidden, 2 visible + 1 hidden, 0
  // opp trash 3
  const ownHandDefs = pickOwn(5);
  const ownTrashDefs = pickOwn(2);
  const ownLine0Defs = pickOwn(2);
  const ownLine2Defs = pickOwn(3);

  const oppLine0VisDefs = pickOpp(1);
  const oppLine1VisDefs = pickOpp(2);
  const oppTrashDefs = pickOpp(3);

  const ownLine0 = [
    { instanceId: "l0a", defId: ownLine0Defs[0], face: CardFace.FaceUp },
    { instanceId: "l0b", defId: ownLine0Defs[1], face: CardFace.FaceDown },
  ];
  const ownLine2 = [
    { instanceId: "l2a", defId: ownLine2Defs[0], face: CardFace.FaceUp },
    { instanceId: "l2b", defId: ownLine2Defs[1], face: CardFace.FaceUp },
    { instanceId: "l2c", defId: ownLine2Defs[2], face: CardFace.FaceDown },
  ];

  const oppLine0Visible = [
    { instanceId: "o0a", defId: oppLine0VisDefs[0], face: CardFace.FaceUp },
  ];
  const oppLine1Visible = [
    { instanceId: "o1a", defId: oppLine1VisDefs[0], face: CardFace.FaceUp },
    { instanceId: "o1b", defId: oppLine1VisDefs[1], face: CardFace.FaceUp },
  ];

  const lineValues: [number, number, number] = [
    visibleLineValue(ownLine0),
    0,
    visibleLineValue(ownLine2),
  ];

  const opponentLineValues: [number, number, number] = [
    visibleLineValue(oppLine0Visible) + 2,
    visibleLineValue(oppLine1Visible) + 2,
    0,
  ];

  const view: PlayerView = {
    id: "dev-player",
    username: "DevPlayer",
    protocols: [
      { protocolId: ownProtocolIds[0], status: ProtocolStatus.Loading,  lineIndex: 0 },
      { protocolId: ownProtocolIds[1], status: ProtocolStatus.Compiled, lineIndex: 1 },
      { protocolId: ownProtocolIds[2], status: ProtocolStatus.Loading,  lineIndex: 2 },
    ],
    hand: ownHandDefs.map((defId, i) => ({ instanceId: `h${i + 1}`, defId, face: CardFace.FaceUp })),
    deckSize: 13,
    trashSize: 2,
    trash: ownTrashDefs.map((defId, i) => ({ instanceId: `t${i + 1}`, defId, face: CardFace.FaceUp })),
    lines: [
      { cards: ownLine0 },
      { cards: [] },
      { cards: ownLine2 },
    ] as PlayerView["lines"],
    hasControl: true,

    isActivePlayer: true,
    compilableLines: [],
    opponentHandSize: 4,
    opponentDeckSize: 11,
    opponentLines: [
      { cards: [
          oppLine0Visible[0],
          { instanceId: "o0b", hidden: true },
        ]
      },
      { cards: [
          oppLine1Visible[0],
          oppLine1Visible[1],
          { instanceId: "o1c", hidden: true },
        ]
      },
      { cards: [] },
    ] as PlayerView["opponentLines"],
    opponentProtocols: [
      { protocolId: oppProtocolIds[0], status: ProtocolStatus.Loading,  lineIndex: 0 },
      { protocolId: oppProtocolIds[1], status: ProtocolStatus.Loading,  lineIndex: 1 },
      { protocolId: oppProtocolIds[2], status: ProtocolStatus.Compiled, lineIndex: 2 },
    ],
    opponentTrash: oppTrashDefs.map((defId, i) => ({ instanceId: `ot${i + 1}`, defId, face: CardFace.FaceUp })),
    opponentHasControl: false,
    pendingEffect: null,
    opponentPendingEffect: null,
    opponentHandRevealed: null,
    opponentRevealedHandCard: null,
    pendingBonusPlay: null,
    pendingControlReorder: false,
    lineValues,
    opponentLineValues,
  };

  return { view, turnPhase: TurnPhase.Action };
}

// ── Effect-scenario mock views ────────────────────────────────────────────────

/**
 * A catalogue of representative pending effects for each interactive effect type.
 * Used by MockGameScene when `?effect=TYPE` is in the URL to put the game
 * directly into EffectResolution so Playwright tests can exercise the UI.
 */
const EFFECT_CATALOGUE: Record<string, PendingEffect> = {
  draw: {
    id: "mock-eff-1", cardDefId: "drk_0", cardName: "Darkness", type: "draw",
    description: "Draw 3 cards.", ownerIndex: 0, trigger: "immediate",
    payload: { amount: 3 }, sourceInstanceId: "l0a",
  },
  discard: {
    id: "mock-eff-1", cardDefId: "apy_5", cardName: "Apathy", type: "discard",
    description: "You discard 1 card.", ownerIndex: 0, trigger: "immediate",
    payload: { amount: 1 },
  },
  flip: {
    id: "mock-eff-1", cardDefId: "apy_3", cardName: "Apathy", type: "flip",
    description: "Flip 1 of your opponent's face-up cards.", ownerIndex: 0, trigger: "immediate",
    payload: { targets: "opponent_faceup" },
  },
  flip_optional: {
    id: "mock-eff-1", cardDefId: "spr_2", cardName: "Spirit", type: "flip",
    description: "You may flip 1 card.", ownerIndex: 0, trigger: "immediate",
    payload: { targets: "any_card", optional: true },
  },
  delete: {
    id: "mock-eff-1", cardDefId: "hat_0", cardName: "Hate", type: "delete",
    description: "Delete 1 card.", ownerIndex: 0, trigger: "immediate",
    payload: { targets: "any_card" },
  },
  shift: {
    id: "mock-eff-1", cardDefId: "spd_3", cardName: "Speed", type: "shift",
    description: "Shift 1 of your other cards.", ownerIndex: 0, trigger: "immediate",
    payload: { targets: "own_others" }, sourceInstanceId: "l0a",
  },
  return: {
    id: "mock-eff-1", cardDefId: "wtr_4", cardName: "Water", type: "return",
    description: "Return 1 of your cards.", ownerIndex: 0, trigger: "immediate",
    payload: { targets: "own_any" },
  },
  exchange_hand: {
    id: "mock-eff-1", cardDefId: "lov_3", cardName: "Love", type: "exchange_hand",
    description: "Take 1 random card from your opponent's hand. Give 1 card from your hand to your opponent.",
    ownerIndex: 0, trigger: "immediate", payload: {},
  },
  give_to_draw: {
    id: "mock-eff-1", cardDefId: "lov_1", cardName: "Love", type: "give_to_draw",
    description: "You may give 1 card from your hand to your opponent. If you do, draw 2 cards.",
    ownerIndex: 0, trigger: "end", payload: {},
  },
  reveal_own_hand: {
    id: "mock-eff-1", cardDefId: "lov_4", cardName: "Love", type: "reveal_own_hand",
    description: "Reveal 1 card from your hand.", ownerIndex: 0, trigger: "immediate", payload: {},
  },
  discard_to_flip: {
    id: "mock-eff-1", cardDefId: "fir_3", cardName: "Fire", type: "discard_to_flip",
    description: "You may discard 1 card. If you do, flip 1 card.", ownerIndex: 0, trigger: "end",
    payload: {},
  },
  play_facedown: {
    id: "mock-eff-1", cardDefId: "drk_3", cardName: "Darkness", type: "play_facedown",
    description: "Play 1 card face-down in another line.", ownerIndex: 0, trigger: "immediate",
    payload: {}, sourceInstanceId: "l0a",
  },
  opponent_discard: {
    id: "mock-eff-1", cardDefId: "plg_0", cardName: "Plague", type: "opponent_discard",
    description: "Your opponent discards 1 card.", ownerIndex: 0, trigger: "immediate",
    payload: { amount: 1 },
  },
  flip_self: {
    id: "mock-eff-1", cardDefId: "wtr_0", cardName: "Water", type: "flip_self",
    description: "Flip this card.", ownerIndex: 0, trigger: "immediate",
    payload: {}, sourceInstanceId: "l0a",
  },
  deny_compile: {
    id: "mock-eff-1", cardDefId: "mtl_1", cardName: "Metal", type: "deny_compile",
    description: "Your opponent cannot compile next turn.", ownerIndex: 0, trigger: "immediate",
    payload: {},
  },
  rearrange_protocols: {
    id: "mock-eff-1", cardDefId: "wtr_2", cardName: "Water", type: "rearrange_protocols",
    description: "Rearrange your protocols.", ownerIndex: 0, trigger: "immediate",
    payload: { whose: "self" },
  },
};

/**
 * A fixed mock view (not randomized) seeded with a specific `pendingEffect`
 * and `TurnPhase.EffectResolution`.  Used by MockGameScene when ?effect=TYPE.
 */
export function createMockViewForEffect(effectType: string): { view: PlayerView; turnPhase: TurnPhase } {
  const { view } = createMockView();

  const effect = EFFECT_CATALOGUE[effectType] ?? {
    id: "mock-eff-fallback", cardDefId: "drk_0", cardName: "Darkness", type: effectType,
    description: `${effectType} (mock)`, ownerIndex: 0 as 0 | 1, trigger: "immediate" as const,
    payload: {},
  };

  view.pendingEffect = effect;
  view.isActivePlayer = true;

  return { view, turnPhase: TurnPhase.EffectResolution };
}
