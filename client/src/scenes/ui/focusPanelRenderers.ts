import Phaser from "phaser";
import { CardFace, CardView, PlayerView, ProtocolStatus } from "@compile/shared";
import { CARD_DEFS_CLIENT, PROTOCOL_ACCENT_COLORS, PROTOCOL_COLORS, PROTOCOL_NAMES_CLIENT } from "../../data/cardDefs";

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
    scene.add.rectangle(cx, H / 2, pw, H, 0x070b11).setStrokeStyle(1, 0x18283a));
  addToFocusPanel(scene, group, scene.add.text(cx, 30, "PHASE", {
    fontSize: "11px", fontFamily: "monospace", color: "#2a4d72", fontStyle: "bold",
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
    fontSize: "28px", fontFamily: "monospace", fontStyle: "bold", color: "#9ec7ea",
  }).setOrigin(0.5));

  addToFocusPanel(scene, group, scene.add.text(cx, H / 2 - 10, summaries[state], {
    fontSize: "13px",
    fontFamily: "monospace",
    color: "#a9bfcd",
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
    scene.add.rectangle(cx, H / 2, pw, H, 0x070b11).setStrokeStyle(1, 0x18283a));
  addToFocusPanel(scene, group, scene.add.text(cx, 10, "CONTROL TOKEN", {
    fontSize: "18px", fontFamily: "monospace", color: "#1a3355",
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
    color: "#a9bfcd",
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
    scene.add.rectangle(cx, H / 2, pw, H, 0x070b11).setStrokeStyle(1, 0x18283a));
  addToFocusPanel(scene, group, scene.add.text(cx, 10, `LINE ${lineIndex}`, {
    fontSize: "9px", fontFamily: "monospace", color: "#2a4d72", fontStyle: "bold",
  }).setOrigin(0.5, 0));

  const ownVal = view.lineValues[lineIndex];
  const oppVal = view.opponentLineValues[lineIndex];
  const myProtoId = view.protocols[lineIndex]?.protocolId ?? "";
  const oppProtoId = view.opponentProtocols[lineIndex]?.protocolId ?? "";
  const myCom = view.protocols[lineIndex]?.status === ProtocolStatus.Compiled;
  const oppCom = view.opponentProtocols[lineIndex]?.status === ProtocolStatus.Compiled;
  const myLoad = view.protocols[lineIndex]?.status === ProtocolStatus.Loading;
  const oppLoad = view.opponentProtocols[lineIndex]?.status === ProtocolStatus.Loading;

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

    const borderColor = compiled ? 0x00ffcc : loading ? 0x1e2e40 : 0x2d5a8a;

    addToFocusPanel(scene, group, scene.add.rectangle(cardCx, cardCy, cardW, cardH, loading ? 0x0e1620 : bodyColor)
      .setStrokeStyle(2, borderColor)
      .setAlpha(loading ? 0.6 : 1));
    addToFocusPanel(scene, group, scene.add.rectangle(cardCx, cardTop + 10, cardW, 20, loading ? 0x1a2a3d : accentColor)
      .setAlpha(loading ? 0.6 : 1));

    addToFocusPanel(scene, group, scene.add.text(cardCx, cardTop + 10, protoName, {
      fontSize: "12px", fontFamily: "monospace", fontStyle: "bold",
      color: loading ? "#2a3f55" : accentText,
      wordWrap: { width: cardW - 6 }, align: "center",
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5, 0.5));

    const statusLabel = compiled ? "✓ COMPILED" : loading ? "LOADING" : "active";
    const statusColor = compiled ? "#00ffcc" : loading ? "#2a4060" : "#4d88aa";
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
    scene.add.rectangle(cx, H / 2, pw, H, 0x070b11).setStrokeStyle(1, 0x18283a));
  addToFocusPanel(scene, group, scene.add.text(cx, 10, "CARD DETAIL", {
    fontSize: "9px", fontFamily: "monospace", color: "#1a3355",
  }).setOrigin(0.5, 0));

  if (!card) {
    const revealedCard = view?.opponentRevealedHandCard ?? null;
    if (revealedCard) {
      addToFocusPanel(scene, group, scene.add.text(cx, H / 2 - 155, "OPP REVEALED", {
        fontSize: "11px", fontFamily: "monospace", color: "#ffaa44", fontStyle: "bold",
      }).setOrigin(0.5));
      buildFocusCard(scene, group, cx, H / 2, revealedCard, 200, 280);
    } else {
      addToFocusPanel(scene, group, scene.add.text(cx, H / 2, "hover a card\nto inspect", {
        fontSize: "12px", fontFamily: "monospace", color: "#1a3355", align: "center",
      }).setOrigin(0.5));
    }
    return;
  }

  buildFocusCard(scene, group, cx, H / 2, card, 200, 280);
}

function buildFocusCard(
  scene: Phaser.Scene,
  group: Phaser.GameObjects.Group,
  cx: number,
  cy: number,
  card: CardView,
  w: number,
  h: number,
): void {
  const shade = (color: number, factor: number): number => {
    const r = Math.max(0, Math.min(255, Math.floor(((color >> 16) & 0xff) * factor)));
    const g = Math.max(0, Math.min(255, Math.floor(((color >> 8) & 0xff) * factor)));
    const b = Math.max(0, Math.min(255, Math.floor((color & 0xff) * factor)));
    return (r << 16) | (g << 8) | b;
  };
  const oppositeHueCss = (color: number): string => {
    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >> 8) & 0xff) / 255;
    const b = (color & 0xff) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let hDeg = 0;
    let sat = 0;
    const light = (max + min) / 2;

    if (delta !== 0) {
      sat = delta / (1 - Math.abs(2 * light - 1));
      if (max === r) hDeg = ((g - b) / delta) % 6;
      else if (max === g) hDeg = (b - r) / delta + 2;
      else hDeg = (r - g) / delta + 4;
      hDeg *= 60;
      if (hDeg < 0) hDeg += 360;
    }

    const oppositeHue = (hDeg + 180) % 360;
    const outSat = Math.max(0.45, sat);
    const outLight = light < 0.5 ? 0.86 : 0.34;

    const c = (1 - Math.abs(2 * outLight - 1)) * outSat;
    const hp = oppositeHue / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let rr = 0;
    let gg = 0;
    let bb = 0;

    if (hp >= 0 && hp < 1) {
      rr = c; gg = x;
    } else if (hp < 2) {
      rr = x; gg = c;
    } else if (hp < 3) {
      gg = c; bb = x;
    } else if (hp < 4) {
      gg = x; bb = c;
    } else if (hp < 5) {
      rr = x; bb = c;
    } else {
      rr = c; bb = x;
    }

    const m = outLight - c / 2;
    const outR = Math.round((rr + m) * 255);
    const outG = Math.round((gg + m) * 255);
    const outB = Math.round((bb + m) * 255);
    const out = (outR << 16) | (outG << 8) | outB;
    return `#${out.toString(16).padStart(6, "0")}`;
  };

  const isHidden = "hidden" in card;
  const isFaceDown = isHidden || (!isHidden && (card as any).face === CardFace.FaceDown);
  const defId = !isHidden ? (card as any).defId as string : undefined;
  const def = defId ? CLIENT_CARD_DEFS.get(defId) : undefined;
  const protoId = defId ? `proto_${defId.split("_")[0]}` : "";
  const bodyColor = PROTOCOL_COLORS.get(protoId) ?? 0x1a3a5c;
  const accentColor = PROTOCOL_ACCENT_COLORS.get(protoId) ?? 0x4488cc;
  const faceUpBgFill = shade(bodyColor, 0.7);
  const titleComp = oppositeHueCss(accentColor);
  const bgComp = oppositeHueCss(faceUpBgFill);

  const hH = h / 2;
  const hW = w / 2;

  const borderPad = 4;
  const borderRadius = 10;
  const borderGfx = scene.add.graphics();
  borderGfx.lineStyle(4, 0xffffff, 0.9);
  borderGfx.strokeRoundedRect(cx - hW - borderPad, cy - hH - borderPad, w + borderPad * 2, h + borderPad * 2, borderRadius);
  addToFocusPanel(scene, group, borderGfx);

  const bgFill = isFaceDown ? 0x242424 : faceUpBgFill;
  const bgStroke = isFaceDown ? 0x666666 : bodyColor;
  addToFocusPanel(scene, group, scene.add.rectangle(cx, cy, w, h, bgFill).setStrokeStyle(2, bgStroke));

  if (isFaceDown) {
    for (let dx = -80; dx <= 80; dx += 25) {
      addToFocusPanel(scene, group, scene.add.rectangle(cx + dx, cy, 6, h - 8, 0x3a3a3a).setAlpha(0.55));
    }
    const chip = scene.add.container(cx + hW - 22, cy - hH + 22);
    chip.add(scene.add.circle(0, 0, 18, 0x3a3a3a));
    chip.add(scene.add.text(0, 0, "2", {
      fontSize: "22px", fontFamily: "monospace", color: "#888888", fontStyle: "bold",
    }).setOrigin(0.5));
    addToFocusPanel(scene, group, chip);
    addToFocusPanel(scene, group, scene.add.text(cx, cy + hH - 16, "FACE DOWN", {
      fontSize: "12px", fontFamily: "monospace", color: "#666666",
    }).setOrigin(0.5, 1));
    return;
  }

  if (!def) return;

  const nameBarH = 38;
  const nameBarCy = cy - hH + nameBarH / 2;
  addToFocusPanel(scene, group, scene.add.rectangle(cx, nameBarCy, w, nameBarH, accentColor));
  addToFocusPanel(scene, group, scene.add.text(cx, nameBarCy, def.name, {
    fontSize: "20px", fontFamily: "monospace", color: titleComp, fontStyle: "bold",
    wordWrap: { width: w - 52 },
    stroke: "#000000", strokeThickness: 3,
  }).setOrigin(0.5));

  const chip = scene.add.container(cx + hW - 22, cy - hH + 20);
  chip.add(scene.add.circle(0, 0, 18, shade(faceUpBgFill, 0.6)));
  chip.add(scene.add.text(0, 0, String(def.value), {
    fontSize: "22px", fontFamily: "monospace", color: bgComp, fontStyle: "bold",
    stroke: "#000000", strokeThickness: 3,
  }).setOrigin(0.5));
  addToFocusPanel(scene, group, chip);

  const secH = (h - nameBarH) / 3;
  const secTop = (i: number) => cy - hH + nameBarH + secH * i;

  for (let i = 0; i < 3; i++) {
    addToFocusPanel(scene, group, scene.add.rectangle(cx, secTop(i), w, 1, 0x1e4a70));
  }

  const sections = [
    { tag: "START", text: def.top },
    { tag: "PLAY", text: def.mid },
    { tag: "END", text: def.bot },
  ] as const;

  sections.forEach(({ tag, text }, i) => {
    const sTop = secTop(i);
    if (!text) {
      addToFocusPanel(scene, group, scene.add.text(cx, sTop + secH / 2, "-", {
        fontSize: "12px", fontFamily: "monospace", color: bgComp,
        stroke: "#000000", strokeThickness: 2,
      }).setOrigin(0.5));
      return;
    }
    addToFocusPanel(scene, group, scene.add.text(cx - hW + 7, sTop + 6, tag, {
      fontSize: "11px", fontFamily: "monospace", color: bgComp,
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0, 0));
    addToFocusPanel(scene, group, scene.add.text(cx, sTop + 22, text, {
      fontSize: "14px", fontFamily: "monospace", color: bgComp,
      wordWrap: { width: w - 18 }, align: "center",
      stroke: "#000000", strokeThickness: 2,
    }).setOrigin(0.5, 0));
  });
}
