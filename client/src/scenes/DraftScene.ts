import Phaser from "phaser";
import { DraftState, DraftVariant, ProtocolSet } from "@compile/shared";
import { getSocket } from "../network/SocketClient";
import { PROTOCOL_ACCENT_COLORS, PROTOCOL_COLORS } from "../data/cardDefs";

interface DraftSceneData {
  draftState: DraftState;
  myIndex: 0 | 1;
}

// Pick order labels shown at the top
const PICK_ORDER_LABELS = ["YOU", "OPP", "OPP", "YOU", "YOU", "OPP"];

export class DraftScene extends Phaser.Scene {
  private draftState!: DraftState;
  private myIndex: 0 | 1 = 0;
  private draftPool: DraftState["availableProtocols"] = [];
  /** Name lookup for ALL protocols, built once before any are removed */
  private allProtocolNames = new Map<string, string>();

  constructor() {
    super("DraftScene");
  }

  init(data: DraftSceneData): void {
    this.draftState = data.draftState;
    this.myIndex = data.myIndex ?? 0;
    this.draftPool = [...data.draftState.availableProtocols];
    // Build full name map now, while all protocols are still present
    for (const p of data.draftState.availableProtocols) {
      this.allProtocolNames.set(p.id, p.name);
    }
  }

  // Dynamic objects we rebuild on every state update
  private dynamicGroup!: Phaser.GameObjects.Group;
  private pickOrderDots: Phaser.GameObjects.Rectangle[] = [];

  private static shadeColor(color: number, factor: number): number {
    const r = Math.max(0, Math.min(255, Math.floor(((color >> 16) & 0xff) * factor)));
    const g = Math.max(0, Math.min(255, Math.floor(((color >> 8) & 0xff) * factor)));
    const b = Math.max(0, Math.min(255, Math.floor((color & 0xff) * factor)));
    return (r << 16) | (g << 8) | b;
  }

  private static textColorForBg(color: number): string {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luma > 140 ? "#0a0f18" : "#eef7ff";
  }

  create(): void {
    const socket = getSocket();
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x10263a);
    this.add.circle(width * 0.14, height * 0.18, 240, 0x65e6ff, 0.14);
    this.add.circle(width * 0.86, height * 0.22, 220, 0x7f7dff, 0.12);
    this.add.circle(width * 0.5, height * 0.72, 300, 0xffd166, 0.05);
    this.add.rectangle(width / 2, height * 0.14, width, 170, 0x18324d, 0.28);
    this.add.rectangle(width / 2, height * 0.88, width, 210, 0x0d1625, 0.22);

    const bgLines = this.add.graphics();
    bgLines.lineStyle(1, 0x7fd8ff, 0.1);
    for (let y = 44; y < height; y += 64) {
      bgLines.lineBetween(30, y, width - 30, y);
    }
    for (let x = 54; x < width; x += 92) {
      bgLines.lineBetween(x, 28, x, height - 28);
    }
    bgLines.lineStyle(2, 0x8cf5de, 0.16);
    bgLines.lineBetween(width * 0.12, height * 0.18, width * 0.36, height * 0.34);
    bgLines.lineBetween(width * 0.88, height * 0.22, width * 0.64, height * 0.36);
    bgLines.lineBetween(width * 0.36, height * 0.34, width * 0.5, height * 0.5);
    bgLines.lineBetween(width * 0.64, height * 0.36, width * 0.5, height * 0.5);
    bgLines.lineBetween(width * 0.5, height * 0.5, width * 0.5, height * 0.78);
    [
      [width * 0.12, height * 0.18, 9, 0x65e6ff],
      [width * 0.36, height * 0.34, 7, 0x91ffd8],
      [width * 0.5, height * 0.5, 11, 0xffd166],
      [width * 0.64, height * 0.36, 7, 0xc2a2ff],
      [width * 0.88, height * 0.22, 9, 0x7f7dff],
    ].forEach(([x, y, radius, color]) => {
      bgLines.fillStyle(color as number, 0.22);
      bgLines.fillCircle(x as number, y as number, radius as number);
    });

    // ── Layout: derive every Y position top-down so nothing can overlap ──
    const L = {
      titleY:     28,
      pickLabelY: 62,
      dotsY:      86,
      hintY:      112,
      bannerH:    34,
      get bannerY()    { return this.hintY + 10 + this.bannerH / 2; },   // 112+10+17 = 139
      get cardsTop()   { return this.bannerY + this.bannerH / 2 + 18; }, // 139+17+18 = 174
      cardH:      130,
      cardGapY:   14,
      get row0Y()      { return this.cardsTop + this.cardH / 2; },        // 174+65 = 239
      get row1Y()      { return this.row0Y + this.cardH + this.cardGapY; },
      get summaryH()   { return 52; },
      get summaryY()   { return height - this.summaryH / 2 - 10; },
    };

    // ── Static header ──────────────────────────────────────────────────────
    this.add.text(width / 2, L.titleY, "DRAFT PROTOCOLS", {
      fontSize: "30px", fontFamily: "monospace", color: "#dffcff", fontStyle: "bold",
    }).setOrigin(0.5);

    const variantLabel: Record<DraftVariant, string> = {
      [DraftVariant.Full]: "Full",
      [DraftVariant.Limited9]: "Limited 9",
      [DraftVariant.Random3]: "Random 3",
    };
    const setLabel: Record<ProtocolSet, string> = {
      [ProtocolSet.MainUnit1]: "Main Unit 1",
      [ProtocolSet.MainUnit2]: "Main Unit 2",
      [ProtocolSet.Aux1]: "Aux 1",
      [ProtocolSet.Aux2]: "Aux 2",
    };
    const setText = this.draftState.lobbySettings.selectedProtocolSets
      .map((s) => setLabel[s] ?? s)
      .join(", ");
    this.add.text(width / 2, L.titleY + 26,
      `Variant: ${variantLabel[this.draftState.lobbySettings.draftVariant] ?? this.draftState.lobbySettings.draftVariant} | Sets: ${setText}`, {
        fontSize: "12px", fontFamily: "monospace", color: "#9fc4e6",
      }).setOrigin(0.5);

    this.add.text(width / 2, L.pickLabelY, "Pick order:", {
      fontSize: "13px", fontFamily: "monospace", color: "#b5d6ef",
    }).setOrigin(0.5);

    const dotSize = 28, dotGap = 6;
    const totalDotW = 6 * dotSize + 5 * dotGap;
    const dotStartX = width / 2 - totalDotW / 2 + dotSize / 2;
    const pickOrderLabels = this.myIndex === 0
      ? PICK_ORDER_LABELS
      : PICK_ORDER_LABELS.map(l => l === "YOU" ? "OPP" : "YOU");

    this.pickOrderDots = [];
    for (let i = 0; i < 6; i++) {
      const dx = dotStartX + i * (dotSize + dotGap);
      const isYou = pickOrderLabels[i] === "YOU";
      const dot = this.add.rectangle(dx, L.dotsY, dotSize, dotSize,
        isYou ? 0x164f4b : 0x35214f)
        .setStrokeStyle(1.5, isYou ? 0x97fff0 : 0xd2a8ff);
      this.add.text(dx, L.dotsY, pickOrderLabels[i], {
        fontSize: "9px", fontFamily: "monospace",
        color: isYou ? "#e7fffb" : "#f1dcff",
      }).setOrigin(0.5);
      this.pickOrderDots.push(dot);
    }

    this.add.text(width / 2, L.hintY, "You pick 1 • Opponent picks 2 • You pick 2", {
      fontSize: "12px", fontFamily: "monospace", color: "#8fb9d5",
    }).setOrigin(0.5);

    // ── Dynamic area (rebuilt on each update) ─────────────────────────────
    this.dynamicGroup = this.add.group();
    // Store layout so renderDynamic can use it
    (this as any)._L = L;
    this.renderDynamic(this.draftState);

    socket.on("draft_updated", ({ draftState }) => this.renderDynamic(draftState));
    socket.on("draft_done",    ({ draftState }) => this.renderDynamic(draftState));
    socket.on("state_sync",    (payload) => {
      this.scene.start("GameScene", { initialPayload: payload, myIndex: this.myIndex });
    });
  }

  private renderDynamic(state: DraftState): void {
    this.draftState = state;
    this.dynamicGroup.clear(true, true);

    const { width, height } = this.scale;
    const L = (this as any)._L;
    const isMyTurn = state.currentPickerIndex === this.myIndex && !state.done;
    const picksDone = state.picks.length;

    // Highlight current dot
    for (let i = 0; i < this.pickOrderDots.length; i++) {
      if (i < picksDone) {
        this.pickOrderDots[i].setFillStyle(0x38635a).setStrokeStyle(2, 0x8be1c9);
      } else if (i === picksDone) {
        this.pickOrderDots[i].setFillStyle(isMyTurn ? 0x1a645f : 0x4d2f72)
          .setStrokeStyle(2, isMyTurn ? 0x97fff0 : 0xdfb8ff);
      }
    }

    // Turn banner — positioned via layout object
    const bannerColor  = state.done ? 0x123c36 : (isMyTurn ? 0x154f4b : 0x40275c);
    const bannerBorder = state.done ? 0x99ffeb : (isMyTurn ? 0x97fff0 : 0xe2b8ff);
    const bannerBg = this.add.rectangle(width / 2, L.bannerY, 520, L.bannerH, bannerColor)
      .setStrokeStyle(2, bannerBorder);
    this.dynamicGroup.add(bannerBg, true);
    const bannerMsg = state.done
      ? "Draft complete! Starting game…"
      : isMyTurn
        ? `▶  YOUR PICK  (${picksDone + 1} of 6)`
        : `⏳  Waiting for opponent… (pick ${picksDone + 1} of 6)`;
    this.dynamicGroup.add(
      this.add.text(width / 2, L.bannerY, bannerMsg, {
        fontSize: "16px", fontFamily: "monospace",
        color: state.done ? "#effff8" : (isMyTurn ? "#effff8" : "#f8efff"),
        fontStyle: isMyTurn ? "bold" : "normal",
      }).setOrigin(0.5), true
    );

    // Protocol cards — auto-fit grid to keep all available protocols on-screen.
    const availableIds = new Set(state.availableProtocols.map((p) => p.id));
    const pickedIds = new Set(state.picks.map((p) => p.protocolId));
    const cardCount = this.draftPool.length;
    const forceThreeByThree =
      state.lobbySettings.draftVariant === DraftVariant.Limited9 && cardCount === 9;
    // For Limited9's fixed 3x3, reserve extra west/east breathing room.
    const sideInset = forceThreeByThree ? Math.max(64, Math.floor(width * 0.12)) : 20;
    const gridLeft = sideInset;
    const gridRight = width - sideInset;
    const gridTop = L.cardsTop;
    const gridBottom = L.summaryY - L.summaryH / 2 - 10;
    const gridW = Math.max(1, gridRight - gridLeft);
    const gridH = Math.max(1, gridBottom - gridTop);
    const minGapX = 8;
    const minGapY = 8;
    const targetAspect = 130 / 230; // keep the current wide-card look

    let best = {
      cols: Math.max(1, Math.min(3, cardCount || 1)),
      rows: Math.max(1, Math.ceil((cardCount || 1) / Math.max(1, Math.min(3, cardCount || 1)))),
      cardW: 120,
      cardH: 120 * targetAspect,
      gapX: minGapX,
      gapY: minGapY,
    };

    if (forceThreeByThree) {
      const cols = 3;
      const rows = 3;
      const slotW = (gridW - (cols - 1) * minGapX) / cols;
      const slotH = (gridH - (rows - 1) * minGapY) / rows;
      const cardW = Math.min(slotW, slotH / targetAspect);
      const cardH = cardW * targetAspect;
      best = {
        cols,
        rows,
        cardW,
        cardH,
        gapX: cols > 1 ? (gridW - cols * cardW) / (cols - 1) : 0,
        gapY: rows > 1 ? (gridH - rows * cardH) / (rows - 1) : 0,
      };
    }

    if (!forceThreeByThree) {
      const minCols = cardCount <= 6 ? 3 : 4;
      const maxCols = Math.max(minCols, Math.min(cardCount || 1, 8));
      for (let cols = minCols; cols <= maxCols; cols++) {
        const rows = Math.max(1, Math.ceil((cardCount || 1) / cols));
        const slotW = (gridW - (cols - 1) * minGapX) / cols;
        const slotH = (gridH - (rows - 1) * minGapY) / rows;
        if (slotW <= 0 || slotH <= 0) continue;

        const cardW = Math.min(slotW, slotH / targetAspect);
        const cardH = cardW * targetAspect;
        const score = cardW;
        if (score > best.cardW) {
          best = {
            cols,
            rows,
            cardW,
            cardH,
            gapX: cols > 1 ? (gridW - cols * cardW) / (cols - 1) : 0,
            gapY: rows > 1 ? (gridH - rows * cardH) / (rows - 1) : 0,
          };
        }
      }
    }

    const totalW = best.cols * best.cardW + (best.cols - 1) * best.gapX;
    const totalH = best.rows * best.cardH + (best.rows - 1) * best.gapY;
    const startX = width / 2 - totalW / 2 + best.cardW / 2;
    const startY = gridTop + (gridH - totalH) / 2 + best.cardH / 2;

    this.draftPool.forEach((proto, i) => {
      const col = i % best.cols;
      const row = Math.floor(i / best.cols);
      const x = startX + col * (best.cardW + best.gapX);
      const y = startY + row * (best.cardH + best.gapY);

      const isAvailable = availableIds.has(proto.id);
      const isDrafted = pickedIds.has(proto.id);

      const protoBody   = PROTOCOL_COLORS.get(proto.id) ?? 0x1a3a5c;
      const protoAccent = PROTOCOL_ACCENT_COLORS.get(proto.id) ?? 0x4488cc;
      const dimFactor = isDrafted ? 0.45 : (isMyTurn ? 1.0 : 0.72);
      const fillBody   = isDrafted ? 0x3e434a : DraftScene.shadeColor(protoBody,   dimFactor);
      const fillAccent = isDrafted ? 0x555a60 : DraftScene.shadeColor(protoAccent, dimFactor);
      const fillBodyH   = DraftScene.shadeColor(protoBody,   1.25);
      const fillAccentH = DraftScene.shadeColor(protoAccent, 1.25);
      const strokeNormal = isDrafted ? 0x6b7380 : DraftScene.shadeColor(protoAccent, 1.5);

      // Two-tone split: north half = accent, south half = body
      const halfH = best.cardH / 2;
      const northBg = this.add.rectangle(0, -halfH / 2, best.cardW, halfH, fillAccent);
      const southBg = this.add.rectangle(0,  halfH / 2, best.cardW, halfH, fillBody);
      // Border drawn as transparent overlay so it sits above both halves
      const border = this.add.rectangle(0, 0, best.cardW, best.cardH, 0x000000, 0)
        .setStrokeStyle(2, strokeNormal);

      const nameFontSize = Math.max(11, Math.floor(best.cardW * 0.082));
      const descFontSize = Math.max(8,  Math.floor(best.cardW * 0.047));
      const nameT = this.add.text(0, -best.cardH / 4, proto.name, {
        fontSize: `${nameFontSize}px`,
        fontFamily: "monospace",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: Math.max(2, Math.floor(nameFontSize * 0.18)),
      }).setOrigin(0.5);
      const descT = this.add.text(0, best.cardH / 4, proto.description, {
        fontSize: `${descFontSize}px`,
        fontFamily: "monospace",
        color: isDrafted ? "#c8d0da" : "#e4f0ff",
        wordWrap: { width: best.cardW - 14 },
        align: "center",
        stroke: "#000000",
        strokeThickness: Math.max(1, Math.floor(descFontSize * 0.18)),
      }).setOrigin(0.5);

      const container = this.add.container(x, y, [northBg, southBg, border, nameT, descT]);
      if (isDrafted) {
        container.setScale(0.5);
      }
      this.dynamicGroup.add(container, true);

      if (isMyTurn && isAvailable && !isDrafted) {
        border.setInteractive({ useHandCursor: true });
        border.on("pointerover", () => {
          northBg.setFillStyle(fillAccentH);
          southBg.setFillStyle(fillBodyH);
          border.setStrokeStyle(2, 0x00ffcc);
        });
        border.on("pointerout", () => {
          northBg.setFillStyle(fillAccent);
          southBg.setFillStyle(fillBody);
          border.setStrokeStyle(2, strokeNormal);
        });
        border.on("pointerdown", () => {
          border.disableInteractive();
          getSocket().emit("draft_pick", { protocolId: proto.id });
        });
      }
    });

    // ── Picks summary bar ───────────────────────────────────────────────
    const myPicks = state.picks
      .filter((p) => p.playerIndex === this.myIndex)
      .map((p) => this.allProtocolNames.get(p.protocolId) ?? p.protocolId);
    const oppPickCount = state.picks.filter((p) => p.playerIndex !== this.myIndex).length;

    const summaryY = L.summaryY;
    this.dynamicGroup.add(
      this.add.rectangle(width / 2, summaryY, width - 40, L.summaryH, 0x0a1520)
        .setStrokeStyle(1.5, 0x44739a), true
    );
    this.dynamicGroup.add(
      this.add.text(width / 2, summaryY - 10,
        `Your picks (${myPicks.length}/3): ${myPicks.length ? myPicks.join("  •  ") : "none yet"}`, {
          fontSize: "14px", fontFamily: "monospace", color: "#defff7",
        }).setOrigin(0.5), true
    );
    this.dynamicGroup.add(
      this.add.text(width / 2, summaryY + 12,
        `Opponent picks: ${oppPickCount}/3`, {
          fontSize: "12px", fontFamily: "monospace", color: "#a9c5de",
        }).setOrigin(0.5), true
    );
  }
}
