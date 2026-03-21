import Phaser from "phaser";
import { DraftState, DraftVariant, ProtocolSet } from "@compile/shared";
import { getSocket } from "../network/SocketClient";
import { PROTOCOL_COLORS } from "../data/cardDefs";

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
      fontSize: "30px", fontFamily: "monospace", color: "#00ffcc", fontStyle: "bold",
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
        fontSize: "12px", fontFamily: "monospace", color: "#556677",
      }).setOrigin(0.5);

    this.add.text(width / 2, L.pickLabelY, "Pick order:", {
      fontSize: "13px", fontFamily: "monospace", color: "#556677",
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
        isYou ? 0x003322 : 0x110022)
        .setStrokeStyle(1, isYou ? 0x00ffcc : 0x554477);
      this.add.text(dx, L.dotsY, pickOrderLabels[i], {
        fontSize: "9px", fontFamily: "monospace",
        color: isYou ? "#00ffcc" : "#8855aa",
      }).setOrigin(0.5);
      this.pickOrderDots.push(dot);
    }

    this.add.text(width / 2, L.hintY, "You pick 1 • Opponent picks 2 • You pick 2", {
      fontSize: "12px", fontFamily: "monospace", color: "#445566",
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
        this.pickOrderDots[i].setFillStyle(0x223322).setStrokeStyle(2, 0x336644);
      } else if (i === picksDone) {
        this.pickOrderDots[i].setFillStyle(isMyTurn ? 0x004433 : 0x221133)
          .setStrokeStyle(2, isMyTurn ? 0x00ffcc : 0xaa66ff);
      }
    }

    // Turn banner — positioned via layout object
    const bannerColor  = state.done ? 0x002211 : (isMyTurn ? 0x002211 : 0x110022);
    const bannerBorder = state.done ? 0x00ffcc : (isMyTurn ? 0x00ffcc : 0xaa44ff);
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
        color: state.done ? "#00ffcc" : (isMyTurn ? "#00ffcc" : "#aa66ff"),
        fontStyle: isMyTurn ? "bold" : "normal",
      }).setOrigin(0.5), true
    );

    // Protocol cards — auto-fit grid to keep all available protocols on-screen.
    const availableIds = new Set(state.availableProtocols.map((p) => p.id));
    const pickedIds = new Set(state.picks.map((p) => p.protocolId));
    const cardCount = this.draftPool.length;
    const gridLeft = 20;
    const gridRight = width - 20;
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

      const protoColor = PROTOCOL_COLORS.get(proto.id) ?? 0x1a3a5c;
      const fillNormal = isDrafted
        ? 0x3e434a
        : isMyTurn
          ? DraftScene.shadeColor(protoColor, 1.0)
          : DraftScene.shadeColor(protoColor, 0.72);
      const fillHover = DraftScene.shadeColor(protoColor, 1.25);
      const strokeNormal = isDrafted ? 0x6b7380 : DraftScene.shadeColor(protoColor, 1.45);
      const titleColor = DraftScene.textColorForBg(fillNormal);
      const descColor = isDrafted ? "#c8d0da" : (isMyTurn ? "#e4f0ff" : "#b8c9df");

      const bg = this.add.rectangle(0, 0, best.cardW, best.cardH, fillNormal)
        .setStrokeStyle(2, strokeNormal);
      const nameT = this.add.text(0, -best.cardH * 0.28, proto.name, {
        fontSize: `${Math.max(11, Math.floor(best.cardW * 0.082))}px`,
        fontFamily: "monospace",
        color: titleColor,
        fontStyle: "bold",
      }).setOrigin(0.5);
      const descT = this.add.text(0, best.cardH * 0.06, proto.description, {
        fontSize: `${Math.max(8, Math.floor(best.cardW * 0.047))}px`,
        fontFamily: "monospace",
        color: descColor,
        wordWrap: { width: best.cardW - 14 },
        align: "center",
      }).setOrigin(0.5);

      const container = this.add.container(x, y, [bg, nameT, descT]);
      if (isDrafted) {
        container.setScale(0.5);
      }
      this.dynamicGroup.add(container, true);

      if (isMyTurn && isAvailable && !isDrafted) {
        bg.setInteractive({ useHandCursor: true });
        bg.on("pointerover", () => {
          bg.setFillStyle(fillHover);
          bg.setStrokeStyle(2, 0x00ffcc);
        });
        bg.on("pointerout", () => {
          bg.setFillStyle(fillNormal);
          bg.setStrokeStyle(2, strokeNormal);
        });
        bg.on("pointerdown", () => {
          bg.disableInteractive();
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
        .setStrokeStyle(1, 0x1a3355), true
    );
    this.dynamicGroup.add(
      this.add.text(width / 2, summaryY - 10,
        `Your picks (${myPicks.length}/3): ${myPicks.length ? myPicks.join("  •  ") : "none yet"}`, {
          fontSize: "14px", fontFamily: "monospace", color: "#00ffcc",
        }).setOrigin(0.5), true
    );
    this.dynamicGroup.add(
      this.add.text(width / 2, summaryY + 12,
        `Opponent picks: ${oppPickCount}/3`, {
          fontSize: "12px", fontFamily: "monospace", color: "#556677",
        }).setOrigin(0.5), true
    );
  }
}
