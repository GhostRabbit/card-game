import { PlayerView, TurnPhase, CardFace, ProtocolStatus } from "@compile/shared";
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
