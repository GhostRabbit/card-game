import Phaser from "phaser";
import { DraftState, GameMode } from "@compile/shared";
import { getSocket } from "../network/SocketClient";

interface DraftSceneData {
  draftState: DraftState;
  myIndex: 0 | 1;
}

// Pick order labels shown at the top
const PICK_ORDER_LABELS = ["YOU", "OPP", "OPP", "YOU", "YOU", "OPP"];

export class DraftScene extends Phaser.Scene {
  private draftState!: DraftState;
  private myIndex: 0 | 1 = 0;
  /** Name lookup for ALL protocols, built once before any are removed */
  private allProtocolNames = new Map<string, string>();

  constructor() {
    super("DraftScene");
  }

  init(data: DraftSceneData): void {
    this.draftState = data.draftState;
    this.myIndex = data.myIndex ?? 0;
    // Build full name map now, while all protocols are still present
    for (const p of data.draftState.availableProtocols) {
      this.allProtocolNames.set(p.id, p.name);
    }
  }

  // Dynamic objects we rebuild on every state update
  private dynamicGroup!: Phaser.GameObjects.Group;
  private pickOrderDots: Phaser.GameObjects.Rectangle[] = [];

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

    const modeLabel: Record<GameMode, string> = {
      [GameMode.AllProtocols]: "All Protocols",
      [GameMode.MainUnit1]:    "Main Unit 1",
      [GameMode.MainUnit2]:    "Main Unit 2",
      [GameMode.Random9]:      "Random 9",
    };
    this.add.text(width / 2, L.titleY + 26,
      `Mode: ${modeLabel[this.draftState.gameMode] ?? this.draftState.gameMode}`, {
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

    // Protocol cards — grid starts at L.row0Y (always below banner)
    const cols = 3;
    const cardW = 230, cardH = L.cardH, gapX = 28;
    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = (width - totalW) / 2 + cardW / 2;
    const rowYs = [L.row0Y, L.row1Y];

    state.availableProtocols.forEach((proto, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = rowYs[row] ?? (rowYs[1] + cardH + L.cardGapY);

      const bg = this.add.rectangle(0, 0, cardW, cardH,
        isMyTurn ? 0x0d2035 : 0x0a1520)
        .setStrokeStyle(2, isMyTurn ? 0x00aaff : 0x1a3355);
      const nameT = this.add.text(0, -36, proto.name, {
        fontSize: "19px", fontFamily: "monospace", color: "#00ffcc", fontStyle: "bold",
      }).setOrigin(0.5);
      const descT = this.add.text(0, 8, proto.description, {
        fontSize: "11px", fontFamily: "monospace", color: "#7788aa",
        wordWrap: { width: cardW - 16 }, align: "center",
      }).setOrigin(0.5);

      const container = this.add.container(x, y, [bg, nameT, descT]);
      this.dynamicGroup.add(container, true);

      if (isMyTurn) {
        bg.setInteractive({ useHandCursor: true });
        bg.on("pointerover", () => { bg.setFillStyle(0x1a4060); bg.setStrokeStyle(2, 0x00ffcc); });
        bg.on("pointerout",  () => { bg.setFillStyle(0x0d2035); bg.setStrokeStyle(2, 0x00aaff); });
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
