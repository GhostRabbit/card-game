import Phaser from "phaser";
import { CardFace, CardView, PlayerView, ProtocolStatus } from "@compile/shared";
import { CARD_DEFS_CLIENT, PROTOCOL_ACCENT_COLORS, PROTOCOL_COLORS, PROTOCOL_NAMES_CLIENT } from "../../data/cardDefs";
import { CardSprite } from "../../objects/CardSprite";

export type FocusTurnState = "START" | "CONTROL" | "COMPILE" | "ACTION" | "CACHE" | "END";

const CLIENT_CARD_DEFS = CARD_DEFS_CLIENT;

export interface FocusPanelLayout {
  focusPanelCx: number;
  focusPanelW: number;
  H: number;
}

function addToFocusPanel(
  scene: Phaser.Scene,
  group: Phaser.GameObjects.Group,
  go: Phaser.GameObjects.GameObject,
): Phaser.GameObjects.GameObject {
  (go as any).setDepth?.(10);
  group.add(go, true);
  return go;
}

export function renderFocusTurnState(
  scene: Phaser.Scene,
  group: Phaser.GameObjects.Group,
  layout: FocusPanelLayout,
  state: FocusTurnState,
): void {
  const { focusPanelCx: cx, focusPanelW: pw, H } = layout;

  addToFocusPanel(scene, group,
    scene.add.rectangle(cx, H / 2, pw, H, 0x112338).setStrokeStyle(1.5, 0x426a8b));
  addToFocusPanel(scene, group, scene.add.text(cx, 30, "PHASE", {
    fontSize: "11px", fontFamily: "monospace", color: "#79b8e9", fontStyle: "bold",
  }).setOrigin(0.5, 0));

  const summaries: Record<FocusTurnState, string> = {
    START: "Start-of-turn effects resolve.",
    CONTROL: "Check whether you have control in at least two lines, if so, take the Control token.",
    COMPILE: "If any line can compile, you must choose one to compile, then pass the turn.",
    ACTION: "Play card and resolve card/effect interactions, or reset hand.",
    CACHE: "Discard down to a hand size of five.",
    END: "End-of-turn effects resolve, then turn passes.",
  };

  addToFocusPanel(scene, group, scene.add.text(cx, H / 2 - 80, state, {
    fontSize: "28px", fontFamily: "monospace", fontStyle: "bold", color: "#def5ff",
  }).setOrigin(0.5));

  addToFocusPanel(scene, group, scene.add.text(cx, H / 2 - 10, summaries[state], {
    fontSize: "13px",
    fontFamily: "monospace",
    color: "#d3e4f1",
    align: "center",
    wordWrap: { width: pw - 20 },
  }).setOrigin(0.5, 0));
}

export function renderFocusControlToken(
  scene: Phaser.Scene,
  group: Phaser.GameObjects.Group,
  layout: FocusPanelLayout,
  hasControl: boolean,
  opponentHasControl: boolean,
): void {
  const { focusPanelCx: cx, focusPanelW: pw, H } = layout;

  addToFocusPanel(scene, group,
    scene.add.rectangle(cx, H / 2, pw, H, 0x112338).setStrokeStyle(1.5, 0x426a8b));
  addToFocusPanel(scene, group, scene.add.text(cx, 10, "CONTROL TOKEN", {
    fontSize: "18px", fontFamily: "monospace", color: "#79b8e9",
  }).setOrigin(0.5, 0));

  const tokenActive = hasControl || opponentHasControl;
  const controlOwner = hasControl ? "You" : opponentHasControl ? "Opponent" : "Neutral";

  const tokenSize = 150;
  const tokenCy = H / 2 - 70;
  addToFocusPanel(scene, group, scene.add.rectangle(cx, tokenCy, tokenSize, tokenSize, tokenActive ? 0xd4a52b : 0x6f6030)
    .setStrokeStyle(3, tokenActive ? 0xf0cd68 : 0x8a7b4a));
  addToFocusPanel(scene, group, scene.add.circle(cx, tokenCy, 44, 0x101010)
    .setStrokeStyle(2, tokenActive ? 0xf0cd68 : 0x7d7047));
  addToFocusPanel(scene, group, scene.add.text(cx, tokenCy, "C", {
    fontSize: "62px", fontFamily: "monospace", fontStyle: "bold",
    color: tokenActive ? "#f5d26b" : "#9e8f61",
  }).setOrigin(0.5));

  addToFocusPanel(scene, group, scene.add.text(cx, tokenCy + tokenSize / 2 + 18, `In Control: ${controlOwner}`, {
    fontSize: "13px", fontFamily: "monospace", fontStyle: "bold",
    color: tokenActive ? "#f5d26b" : "#778899",
  }).setOrigin(0.5, 0));

  const rules = tokenActive
    ? "Compile/Reset: Return Control token to neutral. You may rearrange yours or the opponent's protocols."
    : "Control: Take control if you have most points in at least two lines.";
  addToFocusPanel(scene, group, scene.add.text(cx, tokenCy + tokenSize / 2 + 48, rules, {
    fontSize: "12px",
    fontFamily: "monospace",
    color: "#d3e4f1",
    align: "center",
    wordWrap: { width: pw - 26 },
  }).setOrigin(0.5, 0));
}

export function renderFocusProtocol(
  scene: Phaser.Scene,
  group: Phaser.GameObjects.Group,
  layout: FocusPanelLayout,
  view: PlayerView,
  lineIndex: number,
  complementaryProtoColor: (protoId: string) => string,
): void {
  const { focusPanelCx: cx, focusPanelW: pw, H } = layout;

  addToFocusPanel(scene, group,
    scene.add.rectangle(cx, H / 2, pw, H, 0x112338).setStrokeStyle(1.5, 0x426a8b));
  addToFocusPanel(scene, group, scene.add.text(cx, 10, `LINE ${lineIndex}`, {
    fontSize: "9px", fontFamily: "monospace", color: "#79b8e9", fontStyle: "bold",
  }).setOrigin(0.5, 0));

  const ownVal = view.lineValues[lineIndex];
  const oppVal = view.opponentLineValues[lineIndex];
  // Prefer lineIndex-based lookup (reorder-safe), but fall back to array slot so
  // both protocol cards still render if a transient/state view omits lineIndex.
  const myProto = view.protocols.find((p) => p.lineIndex === lineIndex) ?? view.protocols[lineIndex];
  const oppProto = view.opponentProtocols.find((p) => p.lineIndex === lineIndex) ?? view.opponentProtocols[lineIndex];
  const myProtoId = myProto?.protocolId ?? "";
  const oppProtoId = oppProto?.protocolId ?? "";
  const myCom = myProto?.status === ProtocolStatus.Compiled;
  const oppCom = oppProto?.status === ProtocolStatus.Compiled;
  const myLoad = myProto?.status === ProtocolStatus.Loading;
  const oppLoad = oppProto?.status === ProtocolStatus.Loading;

  const panelLeft = cx - pw / 2;
  const panelRight = cx + pw / 2;
  const cardW = Math.floor((pw - 8) * 0.33);
  const cardH = cardW;
  const cardCy = H / 2;
  const cardTop = cardCy - cardH / 2;
  const cardBottom = cardCy + cardH / 2;

  const leftCardCx = panelLeft + 4 + cardW / 2;
  const rightCardCx = panelRight - 4 - cardW / 2;
  const midCx = cx;

  const drawProtoCard = (
    cardCx: number,
    protoId: string,
    compiled: boolean,
    loading: boolean,
  ) => {
    const bodyColor = PROTOCOL_COLORS.get(protoId) ?? 0x1a3a5c;
    const accentColor = PROTOCOL_ACCENT_COLORS.get(protoId) ?? 0x4488cc;
    const accentText = complementaryProtoColor(protoId);
    const protoName = PROTOCOL_NAMES_CLIENT.get(protoId) ?? protoId;

    const borderColor = compiled ? 0x00ffcc : accentColor;

    addToFocusPanel(scene, group, scene.add.rectangle(cardCx, cardCy, cardW, cardH, bodyColor)
      .setStrokeStyle(2, borderColor)
      .setAlpha(1));
    addToFocusPanel(scene, group, scene.add.rectangle(cardCx, cardTop + 10, cardW, 20, accentColor)
      .setAlpha(1));

    addToFocusPanel(scene, group, scene.add.text(cardCx, cardTop + 10, protoName, {
      fontSize: "12px", fontFamily: "monospace", fontStyle: "bold",
      color: accentText,
      wordWrap: { width: cardW - 6 }, align: "center",
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5, 0.5));

    const statusLabel = compiled ? "✓ COMPILED" : loading ? "ACTIVE" : "active";
    const statusColor = compiled ? "#00ffcc" : "#4d88aa";
    addToFocusPanel(scene, group, scene.add.text(cardCx, cardBottom - 4, statusLabel, {
      fontSize: "7px", fontFamily: "monospace", fontStyle: "bold", color: statusColor,
      stroke: "#000000", strokeThickness: 1,
    }).setOrigin(0.5, 1));
  };

  drawProtoCard(leftCardCx, myProtoId, myCom, myLoad);
  drawProtoCard(rightCardCx, oppProtoId, oppCom, oppLoad);

  const indicator = ownVal > oppVal ? "▲" : ownVal < oppVal ? "▼" : "=";
  const neutralLabel = "#8fa2b6";
  const neutralValue = "#d7e2ee";
  const neutralIndicator = "#aab8c7";

  addToFocusPanel(scene, group, scene.add.text(midCx, cardTop + 2, "OPP", {
    fontSize: "8px", fontFamily: "monospace", color: neutralLabel,
  }).setOrigin(0.5, 0));
  addToFocusPanel(scene, group, scene.add.text(midCx, cardTop + 11, String(oppVal), {
    fontSize: "18px", fontFamily: "monospace", fontStyle: "bold", color: neutralValue,
  }).setOrigin(0.5, 0));

  addToFocusPanel(scene, group, scene.add.text(midCx, cardCy, indicator, {
    fontSize: "13px", fontFamily: "monospace", fontStyle: "bold", color: neutralIndicator,
  }).setOrigin(0.5, 0.5));

  addToFocusPanel(scene, group, scene.add.text(midCx, cardCy + 4, "YOU", {
    fontSize: "8px", fontFamily: "monospace", color: neutralLabel,
  }).setOrigin(0.5, 0));
  addToFocusPanel(scene, group, scene.add.text(midCx, cardCy + 13, String(ownVal), {
    fontSize: "18px", fontFamily: "monospace", fontStyle: "bold", color: neutralValue,
  }).setOrigin(0.5, 0));
}

export function renderFocusCardPanel(
  scene: Phaser.Scene,
  group: Phaser.GameObjects.Group,
  layout: FocusPanelLayout,
  view: PlayerView,
  card: CardView | null,
): void {
  const { focusPanelCx: cx, focusPanelW: pw, H } = layout;

  addToFocusPanel(scene, group,
    scene.add.rectangle(cx, H / 2, pw, H, 0x112338).setStrokeStyle(1.5, 0x426a8b));
  addToFocusPanel(scene, group, scene.add.text(cx, 10, "CARD DETAIL", {
    fontSize: "9px", fontFamily: "monospace", color: "#79b8e9",
  }).setOrigin(0.5, 0));

  if (!card) {
    const revealedCard = view?.opponentRevealedHandCard ?? null;
    if (revealedCard) {
      addToFocusPanel(scene, group, scene.add.text(cx, H / 2 - 155, "OPP REVEALED", {
        fontSize: "11px", fontFamily: "monospace", color: "#ffaa44", fontStyle: "bold",
      }).setOrigin(0.5));
      buildFocusCard(scene, group, cx, H / 2, revealedCard, 200, 280, false);
    } else {
      addToFocusPanel(scene, group, scene.add.text(cx, H / 2, "hover a card\nto inspect", {
        fontSize: "12px", fontFamily: "monospace", color: "#8fb5d3", align: "center",
      }).setOrigin(0.5));
    }
    return;
  }

  const focusedCovered = isFocusedCardCovered(view, card);
  buildFocusCard(scene, group, cx, H / 2, card, 200, 280, focusedCovered);
}

function isFocusedCardCovered(view: PlayerView, card: CardView): boolean {
  if ("hidden" in card) return false;
  const focusedId = card.instanceId;

  const lineSets = [
    ...view.lines.map((l) => l.cards),
    ...view.opponentLines.map((l) => l.cards),
  ];

  for (const cards of lineSets) {
    const idx = cards.findIndex((c) => ("hidden" in c ? false : c.instanceId === focusedId));
    if (idx >= 0) {
      return idx < cards.length - 1;
    }
  }

  return false;
}

function buildFocusCard(
  scene: Phaser.Scene,
  group: Phaser.GameObjects.Group,
  cx: number,
  cy: number,
  card: CardView,
  w: number,
  h: number,
  covered: boolean,
): void {
  const scale = Math.min(w / CardSprite.WIDTH, h / CardSprite.HEIGHT);
  const borderPad = Math.max(3, Math.round(4 * scale));
  const cardW = Math.round(CardSprite.WIDTH * scale);
  const cardH = Math.round(CardSprite.HEIGHT * scale);

  const borderGfx = scene.add.graphics();
  borderGfx.lineStyle(Math.max(2, Math.round(3 * scale)), 0xffffff, 0.9);
  borderGfx.strokeRoundedRect(
    cx - cardW / 2 - borderPad,
    cy - cardH / 2 - borderPad,
    cardW + borderPad * 2,
    cardH + borderPad * 2,
    Math.max(6, Math.round(10 * scale)),
  );
  addToFocusPanel(scene, group, borderGfx);

  const sprite = new CardSprite(scene, cx, cy, card, CLIENT_CARD_DEFS, covered, scale);
  addToFocusPanel(scene, group, sprite);
}
