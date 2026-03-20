import Phaser from "phaser";
import { PlayerView, TurnPhase, CardView, CardFace, CardInstance, ProtocolStatus, PendingEffect } from "@compile/shared";
import { getSocket } from "../network/SocketClient";
import { CardSprite } from "../objects/CardSprite";
import { CARD_DEFS_CLIENT, PROTOCOL_NAMES_CLIENT, PROTOCOL_COLORS } from "../data/cardDefs";

const CLIENT_CARD_DEFS = CARD_DEFS_CLIENT;

/** Set true to draw coloured zone overlays — easy to disable for production */
const DEV_LAYOUT_ZONES = false;

interface GameSceneData {
  initialPayload: { view: PlayerView; turnPhase: TurnPhase };
  myIndex: 0 | 1;
  devMode?: boolean;
}

const LINE_COLORS = [0x2200aa, 0x008822, 0xaa6600];

export class GameScene extends Phaser.Scene {
  private myIndex: 0 | 1 = 0;
  private view!: PlayerView;
  private turnPhase!: TurnPhase;
  private devMode = false;

  private selectedCard: CardView | null = null;
  private faceDownMode = false;
  private effectBoardTargetId: string | null = null;   // staged board card pick for effects
  private effectHandTargetId: string | null = null;    // staged hand card pick for play_facedown etc.
  /** Control-reorder bonus: which player's deck the user chose to reorder (null = not yet chosen) */
  private controlReorderWhose: "self" | "opponent" | null = null;
  /** Control-reorder bonus: protocols clicked so far in desired new order */
  private controlReorderPicks: string[] = [];

  // UI containers we rebuild on each state_sync
  private handGroup!: Phaser.GameObjects.Group;
  private boardGroup!: Phaser.GameObjects.Group;
  private hudGroup!: Phaser.GameObjects.Group;
  /** Persistent right-panel: only cleared when hovered card changes. */
  private focusPanelGroup!: Phaser.GameObjects.Group;

  constructor() {
    super("GameScene");
  }

  init(data: GameSceneData): void {
    this.myIndex = data.myIndex ?? 0;
    this.view    = data.initialPayload.view;
    this.turnPhase = data.initialPayload.turnPhase;
    this.devMode = data.devMode ?? false;
  }

  create(): void {
    const socket = getSocket();

    this.handGroup = this.add.group();
    this.boardGroup = this.add.group();
    this.hudGroup = this.add.group();
    this.focusPanelGroup = this.add.group();

    this.showFocusCard(null);
    this.renderAll();

    socket.on("state_sync", ({ view, turnPhase }) => {
      this.view = view;
      this.turnPhase = turnPhase;
      this.selectedCard = null;
      this.faceDownMode = false;
      this.effectBoardTargetId = null;
      this.effectHandTargetId = null;
      this.controlReorderWhose = null;
      this.controlReorderPicks = [];
      this.renderAll();
    });

    socket.on("action_rejected", ({ reason }) => {
      this.showToast(reason, "#ff6666");
    });

    socket.on("game_over", ({ winnerUsername }) => {
      this.scene.start("GameOverScene", { winnerUsername });
    });

    socket.on("opponent_disconnected", () => {
      this.showToast("Opponent disconnected.", "#ffdd00");
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  /**
   * Single source of truth for every coordinate.
   * Tweak the semantic roots at the top; everything else is derived.
   */
  private computeLayout() {
    const W = this.scale.width;
    const H = this.scale.height;

    // ── Semantic roots ──────────────────────────────────────────────────────
    const zoneW  = 310;   // width of each line-column zone
    const zoneH  = 210;   // height of each line zone
    const pileW  = 220;   // width of the discard/draw pile column
    const stripH = 38;    // height of the mid-strip between opponent and own zones
    const gap    = 14;    // gap between a zone edge and the strip edge
    const hudH   = 85;    // vertical space consumed by the top HUD
    const padL   = 50;    // left padding before the first column centre
    const pitch  = 330;   // horizontal distance between column centres
    const padR   = 20;    // right padding

    // ── Derived vertical positions ──────────────────────────────────────────
    const oppCy  = hudH  + zoneH  / 2;
    const midY   = oppCy + zoneH  / 2 + gap + stripH / 2;
    const ownCy  = midY  + stripH / 2 + gap + zoneH  / 2;

    // ── Horizontal positions ────────────────────────────────────────────────
    const col0   = padL + zoneW / 2;
    const lineCx: [number, number, number] = [col0, col0 + pitch, col0 + pitch * 2];

    // Focus panel — immediately right of the last line column
    const focusPanelW = 240;
    const focusPanelCx = lineCx[2] + zoneW / 2 + 10 + focusPanelW / 2;

    // Pile sits at the far right of the 1600px canvas
    const pileCx = W - pileW / 2 - 10;

    // ── Controls (under focused card in right panel) ───────────────────────
    const focusCardBottom = H / 2 + 140; // focused card is 280px tall at panel centre
    const btnCx     = focusPanelCx;
    const resetY    = focusCardBottom + 44;
    const faceDownY = focusCardBottom + 90;

    // ── Hand strip ──────────────────────────────────────────────────────────
    const handY     = H - Math.round(CardSprite.HEIGHT / 2) - 10;
    // Hand is constrained to the board area left of the focus panel
    const handLeft  = 30;
    const handRight = focusPanelCx - focusPanelW / 2 - 20;

    return { W, H, zoneW, zoneH, pileW, stripH, hudH, lineCx, oppCy, ownCy, midY, pileCx, btnCx, resetY, faceDownY, handY, handLeft, handRight, focusPanelCx, focusPanelW };
  }

  private renderAll(): void {
    this.showFocusCard(null);
    this.handGroup.clear(true, true);
    this.boardGroup.clear(true, true);
    this.hudGroup.clear(true, true);
    if (DEV_LAYOUT_ZONES) this.renderLayoutDebug();
    this.renderHUD();
    this.renderBoard();
    this.renderHand();
  }

  private renderHUD(): void {
    const L = this.computeLayout();
    const addHud = (go: Phaser.GameObjects.GameObject) => {
      this.hudGroup.add(go, true);
      (go as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(100);
      return go;
    };

    const toCssHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
    const selectedProtoId = this.selectedCardProtocolId();
    const effectProtoId = this.view.pendingEffect
      ? `proto_${this.view.pendingEffect.cardDefId.split("_")[0]}`
      : null;
    const hudProtoId = effectProtoId ?? selectedProtoId ?? this.view.protocols[0]?.protocolId ?? null;
    const hudAccentNum = PROTOCOL_COLORS.get(hudProtoId ?? "") ?? 0x00ffcc;
    const hudAccentColor = toCssHex(hudAccentNum);

    const myTurn = this.isMyTurn();
    const isCompileChoice = this.view.isActivePlayer && this.turnPhase === TurnPhase.CompileChoice;
    const isEffectResolution = this.turnPhase === TurnPhase.EffectResolution;

    const turnStates = ["START", "CONTROL", "COMPILE", "ACTION", "CACHE", "END"] as const;
    const activeState = this.activeTurnState();
    const cellW = 98;
    const rowY = 18;
    const rowStartX = L.W / 2 - ((turnStates.length - 1) * cellW) / 2;
    turnStates.forEach((state, i) => {
      const cx = rowStartX + i * cellW;
      const isActive = state === activeState;
      const chip = this.add.rectangle(cx, rowY, 90, 24, isActive ? 0x19314a : 0x0b1420)
        .setStrokeStyle(1.5, isActive ? hudAccentNum : 0x25364a)
        .setInteractive({ useHandCursor: true });
      chip.on("pointerover", () => {
        chip.setFillStyle(isActive ? 0x21405f : 0x132337);
        this.showFocusTurnState(state);
      });
      chip.on("pointerout", () => {
        chip.setFillStyle(isActive ? 0x19314a : 0x0b1420);
        this.showFocusCard(null);
      });
      addHud(chip);
      addHud(this.add.text(cx, rowY, state, {
        fontSize: "11px", fontFamily: "monospace", fontStyle: "bold",
        color: isActive ? hudAccentColor : "#6f8da8",
      }).setOrigin(0.5));
    });

    // ── Effect resolution ─────────────────────────────────────────────────────
    if (isEffectResolution) {
      const myEffect   = this.view.pendingEffect;
      const oppEffect  = this.view.opponentPendingEffect;

      if (myEffect) {
        addHud(this.add.text(L.W / 2, 36, "RESOLVE EFFECT", {
          fontSize: "16px", fontFamily: "monospace", color: hudAccentColor, fontStyle: "bold",
        }).setOrigin(0.5));
        addHud(this.add.text(L.W / 2, 54, `[${myEffect.cardName}] ${myEffect.description}`, {
          fontSize: "11px", fontFamily: "monospace", color: "#aaddcc", wordWrap: { width: 500 },
        }).setOrigin(0.5));

        const spec = this.getEffectInputSpec(myEffect);

        if (myEffect.type === "discard") {
          if (this.view.hand.length === 0) {
            addHud(this.add.text(L.W / 2, 72, "(hand is empty — nothing to discard)", {
              fontSize: "11px", fontFamily: "monospace", color: "#668877",
            }).setOrigin(0.5));
            const btn = this.add.rectangle(L.btnCx, L.resetY, 160, 32, 0x0d2010)
              .setStrokeStyle(2, 0x558866)
              .setInteractive({ useHandCursor: true });
            btn.on("pointerover", () => btn.setFillStyle(0x1a3322));
            btn.on("pointerout",  () => btn.setFillStyle(0x0d2010));
            btn.on("pointerdown", () => getSocket().emit("resolve_effect", { id: myEffect.id }));
            addHud(btn);
            addHud(this.add.text(L.btnCx, L.resetY, "SKIP", {
              fontSize: "13px", fontFamily: "monospace", color: "#558866", fontStyle: "bold",
            }).setOrigin(0.5));
          } else {
            addHud(this.add.text(L.W / 2, 72, "Click a card in your hand to discard it ↓", {
              fontSize: "11px", fontFamily: "monospace", color: "#ffcc66",
            }).setOrigin(0.5));
          }

        } else if (myEffect.type === "discard_to_flip") {
          if (!this.effectHandTargetId) {
            // Stage 1: choose a hand card to discard (optional)
            if (this.view.hand.length === 0) {
              addHud(this.add.text(L.W / 2, 72, "(hand is empty — skipping discard)", {
                fontSize: "11px", fontFamily: "monospace", color: "#668877",
              }).setOrigin(0.5));
            } else {
              addHud(this.add.text(L.W / 2, 72, "Click a card in your hand to discard (you may skip) ↓", {
                fontSize: "11px", fontFamily: "monospace", color: "#ffcc66",
              }).setOrigin(0.5));
            }
            const skipBtn = this.add.rectangle(L.btnCx, L.resetY, 160, 32, 0x0d2010)
              .setStrokeStyle(2, 0x558866)
              .setInteractive({ useHandCursor: true });
            skipBtn.on("pointerover", () => skipBtn.setFillStyle(0x1a3322));
            skipBtn.on("pointerout",  () => skipBtn.setFillStyle(0x0d2010));
            skipBtn.on("pointerdown", () => getSocket().emit("resolve_effect", { id: myEffect.id }));
            addHud(skipBtn);
            addHud(this.add.text(L.btnCx, L.resetY, "SKIP", {
              fontSize: "13px", fontFamily: "monospace", color: "#558866", fontStyle: "bold",
            }).setOrigin(0.5));
          } else {
            // Stage 2: the hand card is staged — click a board card to flip
            const hc = this.view.hand.find(c => "instanceId" in c && (c as CardInstance).instanceId === this.effectHandTargetId);
            const handCardName = hc && "defId" in hc ? (CLIENT_CARD_DEFS.get((hc as CardInstance).defId)?.name ?? "Card") : "Card";
            addHud(this.add.text(L.W / 2, 72, `Discarding ${handCardName} — click a board card to flip ↓`, {
              fontSize: "11px", fontFamily: "monospace", color: "#aaddcc",
            }).setOrigin(0.5));
          }

        } else if (myEffect.type === "play_facedown") {
          if (!this.effectHandTargetId) {
            addHud(this.add.text(L.W / 2, 72, "Click a card in your hand to play face-down ↓", {
              fontSize: "11px", fontFamily: "monospace", color: "#ffcc66",
            }).setOrigin(0.5));
          } else {
            const hc = this.view.hand.find(c => "instanceId" in c && (c as CardInstance).instanceId === this.effectHandTargetId);
            const handCardName = hc && "defId" in hc ? (CLIENT_CARD_DEFS.get((hc as CardInstance).defId)?.name ?? "Card") : "Card";
            addHud(this.add.text(L.W / 2, 72, `Playing ${handCardName} face-down — choose a line:`, {
              fontSize: "11px", fontFamily: "monospace", color: "#aaddcc",
            }).setOrigin(0.5));
            this.renderLinePicker(L.lineCx, addHud, "own", (li) => {
              getSocket().emit("resolve_effect", { id: myEffect.id, targetInstanceId: this.effectHandTargetId!, targetLineIndex: li });
              this.effectHandTargetId = null;
            });
          }

        } else if (spec.isAutoExecute) {
          const btn = this.add.rectangle(L.btnCx, L.resetY, 160, 32, 0x0d2a1a)
            .setStrokeStyle(2, hudAccentNum)
            .setInteractive({ useHandCursor: true });
          btn.on("pointerover", () => btn.setFillStyle(0x1a4a30));
          btn.on("pointerout",  () => btn.setFillStyle(0x0d2a1a));
          btn.on("pointerdown", () => getSocket().emit("resolve_effect", { id: myEffect.id }));
          addHud(btn);
          addHud(this.add.text(L.btnCx, L.resetY, "▶  CONFIRM", {
            fontSize: "13px", fontFamily: "monospace", color: hudAccentColor, fontStyle: "bold",
          }).setOrigin(0.5));

        } else if (spec.boardMode && !this.effectBoardTargetId) {
          addHud(this.add.text(L.W / 2, 72, this.getBoardPickHint(spec.boardMode), {
            fontSize: "11px", fontFamily: "monospace", color: "#ffcc66",
          }).setOrigin(0.5));
          if (spec.isOptional) {
            const skipBtn = this.add.rectangle(L.btnCx, L.resetY, 160, 32, 0x0d2010)
              .setStrokeStyle(2, 0x558866)
              .setInteractive({ useHandCursor: true });
            skipBtn.on("pointerover", () => skipBtn.setFillStyle(0x1a3322));
            skipBtn.on("pointerout",  () => skipBtn.setFillStyle(0x0d2010));
            skipBtn.on("pointerdown", () => {
              this.effectBoardTargetId = null;
              getSocket().emit("resolve_effect", { id: myEffect.id });
            });
            addHud(skipBtn);
            addHud(this.add.text(L.btnCx, L.resetY, "SKIP", {
              fontSize: "13px", fontFamily: "monospace", color: "#558866", fontStyle: "bold",
            }).setOrigin(0.5));
          }

        } else if (spec.needsLine) {
          addHud(this.add.text(L.W / 2, 72,
            this.effectBoardTargetId ? "Card selected — choose a destination line:" : "Choose a destination line:", {
              fontSize: "11px", fontFamily: "monospace", color: "#aaddcc",
            }).setOrigin(0.5));
          this.renderLinePicker(L.lineCx, addHud, spec.lineScope!, (li) => {
            getSocket().emit("resolve_effect", {
              id: myEffect.id,
              targetInstanceId: this.effectBoardTargetId ?? undefined,
              targetLineIndex: li,
            });
            this.effectBoardTargetId = null;
          });
        }

      } else if (oppEffect) {
        addHud(this.add.text(L.W / 2, 36, "Opponent resolving...", {
          fontSize: "16px", fontFamily: "monospace", color: "#aaaaaa", fontStyle: "bold",
        }).setOrigin(0.5));
        addHud(this.add.text(L.W / 2, 54, `[${oppEffect.cardName}] ${oppEffect.description}`, {
          fontSize: "11px", fontFamily: "monospace", color: "#667788", wordWrap: { width: 500 },
        }).setOrigin(0.5));

      } else if (this.view.pendingControlReorder) {
        // ── Control-reorder bonus ───────────────────────────────────────────
        addHud(this.add.text(L.W / 2, 36, "★ CONTROL BONUS", {
          fontSize: "16px", fontFamily: "monospace", color: "#ffcc00", fontStyle: "bold",
        }).setOrigin(0.5));

        if (!this.controlReorderWhose) {
          // Stage 1: choose whose protocols to reorder
          addHud(this.add.text(L.W / 2, 54, "Choose whose protocols to reorder, or skip:", {
            fontSize: "12px", fontFamily: "monospace", color: "#ccbbaa",
          }).setOrigin(0.5));

          const mkBtn = (label: string, by: number, color: number, textColor: string, cb: () => void) => {
            const bg = this.add.rectangle(L.btnCx, by, 180, 38, color)
              .setStrokeStyle(2, 0xffcc00).setInteractive({ useHandCursor: true });
            bg.on("pointerover",  () => bg.setAlpha(0.75));
            bg.on("pointerout",   () => bg.setAlpha(1));
            bg.on("pointerdown",  cb);
            addHud(bg);
            addHud(this.add.text(L.btnCx, by, label, {
              fontSize: "13px", fontFamily: "monospace", color: textColor, fontStyle: "bold",
            }).setOrigin(0.5));
          };

          mkBtn("REORDER OWN", L.resetY, 0x2a1400, "#ffcc00", () => {
            this.controlReorderWhose = "self";
            this.controlReorderPicks = [];
            this.renderAll();
          });
          mkBtn("REORDER OPP", L.resetY + 44, 0x14002a, "#cc88ff", () => {
            this.controlReorderWhose = "opponent";
            this.controlReorderPicks = [];
            this.renderAll();
          });
          mkBtn("SKIP", L.resetY + 88, 0x0d1a0d, "#558866", () => {
            getSocket().emit("resolve_control_reorder", {});
          });

        } else {
          // Stage 2: select new protocol order
          const isOpp = this.controlReorderWhose === "opponent";
          const rawProtos = isOpp ? this.view.opponentProtocols : this.view.protocols;
          const sortedProtos = [...rawProtos].sort((a, b) => a.lineIndex - b.lineIndex);

          addHud(this.add.text(L.W / 2, 54,
            `Reorder ${isOpp ? "OPPONENT" : "OWN"} protocols — click in desired Line 0 → 1 → 2 order:`, {
              fontSize: "12px", fontFamily: "monospace", color: isOpp ? "#cc88ff" : "#ffcc00",
            }).setOrigin(0.5));

          // Pick preview
          const pickNames = this.controlReorderPicks
            .map(id => PROTOCOL_NAMES_CLIENT.get(id) ?? id);
          const preview = [0, 1, 2].map(i => `${i}: ${pickNames[i] ?? "—"}`).join("   ");
          addHud(this.add.text(L.W / 2, 72, preview, {
            fontSize: "13px", fontFamily: "monospace", color: "#aaddcc",
          }).setOrigin(0.5));

          // Protocol buttons (horizontal row, centered below the board)
          const btnW = 180; const btnH = 38; const btnY = 614;
          sortedProtos.forEach((proto, i) => {
            const name = PROTOCOL_NAMES_CLIENT.get(proto.protocolId) ?? proto.protocolId;
            const protoNameColor = this.complementaryProtoColor(proto.protocolId);
            const isPicked = this.controlReorderPicks.includes(proto.protocolId);
            const bx = L.W / 2 + (i - 1) * 200; // -200, 0, +200 relative to center
            const bg = this.add.rectangle(bx, btnY, btnW, btnH,
              isPicked ? 0x111111 : (isOpp ? 0x200030 : 0x2a1400))
              .setStrokeStyle(2, isPicked ? 0x333333 : (isOpp ? 0xcc88ff : 0xffcc00))
              .setAlpha(isPicked ? 0.5 : 1);
            if (!isPicked) {
              bg.setInteractive({ useHandCursor: true });
              bg.on("pointerover", () => bg.setAlpha(0.7));
              bg.on("pointerout",  () => bg.setAlpha(1));
              bg.on("pointerdown", () => {
                this.controlReorderPicks.push(proto.protocolId);
                this.renderAll();
              });
            }
            addHud(bg);
            const slotLabel = isPicked ? `↳ slot ${this.controlReorderPicks.indexOf(proto.protocolId)}` : name;
            addHud(this.add.text(bx, btnY, slotLabel, {
              fontSize: "13px", fontFamily: "monospace",
              color: isPicked ? "#444444" : protoNameColor,
              fontStyle: "bold",
            }).setOrigin(0.5));
          });

          // Action buttons in pile column
          const allPicked = this.controlReorderPicks.length === 3;
          if (allPicked) {
            const confirmBg = this.add.rectangle(L.btnCx, L.resetY, 180, 38, 0x002a14)
              .setStrokeStyle(2, hudAccentNum).setInteractive({ useHandCursor: true });
            confirmBg.on("pointerover", () => confirmBg.setAlpha(0.75));
            confirmBg.on("pointerout",  () => confirmBg.setAlpha(1));
            confirmBg.on("pointerdown", () => {
              getSocket().emit("resolve_control_reorder", {
                whose: this.controlReorderWhose!,
                newProtocolOrder: [...this.controlReorderPicks],
              });
              this.controlReorderWhose = null;
              this.controlReorderPicks = [];
            });
            addHud(confirmBg);
            addHud(this.add.text(L.btnCx, L.resetY, "▶  CONFIRM", {
              fontSize: "13px", fontFamily: "monospace", color: hudAccentColor, fontStyle: "bold",
            }).setOrigin(0.5));
          }

          const backY   = allPicked ? L.resetY + 44 : L.resetY;
          const skipY   = allPicked ? L.resetY + 88 : L.resetY + 44;

          const backBg = this.add.rectangle(L.btnCx, backY, 180, 38, 0x1a1a00)
            .setStrokeStyle(2, 0x886600).setInteractive({ useHandCursor: true });
          backBg.on("pointerover", () => backBg.setAlpha(0.75));
          backBg.on("pointerout",  () => backBg.setAlpha(1));
          backBg.on("pointerdown", () => {
            this.controlReorderWhose = null;
            this.controlReorderPicks = [];
            this.renderAll();
          });
          addHud(backBg);
          addHud(this.add.text(L.btnCx, backY, "◀  BACK", {
            fontSize: "13px", fontFamily: "monospace", color: "#886600", fontStyle: "bold",
          }).setOrigin(0.5));

          const skipBg = this.add.rectangle(L.btnCx, skipY, 180, 38, 0x0d1a0d)
            .setStrokeStyle(2, 0x558866).setInteractive({ useHandCursor: true });
          skipBg.on("pointerover", () => skipBg.setAlpha(0.75));
          skipBg.on("pointerout",  () => skipBg.setAlpha(1));
          skipBg.on("pointerdown", () => {
            getSocket().emit("resolve_control_reorder", {});
            this.controlReorderWhose = null;
            this.controlReorderPicks = [];
          });
          addHud(skipBg);
          addHud(this.add.text(L.btnCx, skipY, "SKIP", {
            fontSize: "13px", fontFamily: "monospace", color: "#558866", fontStyle: "bold",
          }).setOrigin(0.5));
        }
      }

      // Revealed hand/card banner during effect resolution
      if (this.view.opponentHandRevealed || this.view.opponentRevealedHandCard) {
        const msg = this.view.opponentHandRevealed
          ? `OPP HAND REVEALED: ${this.view.opponentHandRevealed.map(c => CLIENT_CARD_DEFS.get(c.defId)?.name ?? c.defId).join(", ") || "(empty)"}`
          : `OPP REVEALED: ${CLIENT_CARD_DEFS.get(this.view.opponentRevealedHandCard!.defId)?.name ?? this.view.opponentRevealedHandCard!.defId} (val ${CLIENT_CARD_DEFS.get(this.view.opponentRevealedHandCard!.defId)?.value ?? "?"}) — see panel →`;
        addHud(this.add.text(L.W / 2, 74, msg, {
          fontSize: "11px", fontFamily: "monospace", color: "#ffaa44", wordWrap: { width: 500 },
        }).setOrigin(0.5));
      }

      // Show control markers even during EffectResolution
      return;
    }

    addHud(this.add.text(L.W / 2, 36,
      isCompileChoice ? "COMPILE REQUIRED" : myTurn ? "YOUR TURN" : "Opponent's Turn", {
        fontSize: "16px", fontFamily: "monospace",
        color: isCompileChoice ? "#ffcc00" : myTurn ? hudAccentColor : "#445566", fontStyle: "bold",
      }).setOrigin(0.5));

    // Bonus play banner
    if (this.view.pendingBonusPlay && myTurn) {
      addHud(this.add.text(L.W / 2, 72,
        this.view.pendingBonusPlay.anyLine
          ? "BONUS PLAY — play 1 card in any line"
          : "BONUS PLAY — play 1 more card", {
          fontSize: "12px", fontFamily: "monospace", color: "#ffe066", fontStyle: "bold",
        }).setOrigin(0.5));
    }

    // Controls — below the own discard pile (positions from layout)
    if (isCompileChoice) {
      // Compile-choice UI: one button per compilable line (must compile, can't play)
      addHud(this.add.text(L.btnCx, L.resetY - 20,
        "You MUST compile:", {
          fontSize: "11px", fontFamily: "monospace", color: "#ccaa00",
        }).setOrigin(0.5));
      this.view.compilableLines.forEach((li, i) => {
        const protoId = this.view.protocols[li]?.protocolId ?? "";
        const protoName = PROTOCOL_NAMES_CLIENT.get(protoId) ?? `Line ${li}`;
        const protoNameColor = this.complementaryProtoColor(protoId);
        const by = L.resetY + i * 36;
        const btn = this.add.rectangle(L.btnCx, by, 150, 28, 0x2a1a00)
          .setStrokeStyle(2, 0xffcc00)
          .setInteractive({ useHandCursor: true });
        btn.on("pointerover", () => btn.setFillStyle(0x443300));
        btn.on("pointerout",  () => btn.setFillStyle(0x2a1a00));
        btn.on("pointerdown", () => this.onCompileClick(li));
        addHud(btn);
        addHud(this.add.text(L.btnCx, by, `COMPILE: ${protoName}`, {
          fontSize: "11px", fontFamily: "monospace", color: protoNameColor, fontStyle: "bold",
        }).setOrigin(0.5));
      });
    } else if (this.isMyTurn()) {
      // ── Face-Down toggle ──────────────────────────────────────────────────
      const isOn = this.faceDownMode;
      const toggleBg = this.add.rectangle(L.btnCx, L.faceDownY, 160, 38,
        isOn ? 0x0d2a4a : 0x0a1520)
        .setStrokeStyle(2, isOn ? hudAccentNum : 0x2255aa)
        .setInteractive({ useHandCursor: true });
      toggleBg.on("pointerover", () => toggleBg.setFillStyle(isOn ? 0x163a5e : 0x0f2030));
      toggleBg.on("pointerout",  () => toggleBg.setFillStyle(isOn ? 0x0d2a4a : 0x0a1520));
      toggleBg.on("pointerdown", () => {
        this.faceDownMode = !this.faceDownMode;
        this.renderAll();
      });
      addHud(toggleBg);
      addHud(this.add.text(L.btnCx, L.faceDownY,
        isOn ? "▼  FACE-DOWN  ON" : "▽  FACE-DOWN  OFF", {
          fontSize: "14px", fontFamily: "monospace", fontStyle: "bold",
          color: isOn ? hudAccentColor : "#4477aa",
        }).setOrigin(0.5));

      // ── Reset button ──────────────────────────────────────────────────────
      const canReset = this.view.hand.length < 5;
      const drawCount = 5 - this.view.hand.length;
      const resetLabel = canReset ? `⟳  RESET  (+${drawCount})` : "⟳  RESET  (full)";
      const refreshBg = this.add.rectangle(L.btnCx, L.resetY, 160, 38,
        canReset ? 0x0d2035 : 0x080e14)
        .setStrokeStyle(2, canReset ? hudAccentNum : 0x1a2a3a);
      if (canReset) {
        refreshBg.setInteractive({ useHandCursor: true });
        refreshBg.on("pointerover", () => refreshBg.setFillStyle(0x163050));
        refreshBg.on("pointerout",  () => refreshBg.setFillStyle(0x0d2035));
        refreshBg.on("pointerdown", () => getSocket().emit("refresh"));
      }
      addHud(refreshBg);
      addHud(this.add.text(L.btnCx, L.resetY, resetLabel, {
        fontSize: "14px", fontFamily: "monospace", fontStyle: "bold",
        color: canReset ? hudAccentColor : "#2a3f55",
      }).setOrigin(0.5));
    }
    if (this.view.opponentHandRevealed) {
      const revNames = this.view.opponentHandRevealed.map(c => CLIENT_CARD_DEFS.get(c.defId)?.name ?? c.defId).join(", ");
      addHud(this.add.text(20, 60, `OPP HAND: ${revNames || "(empty)"}`, {
        fontSize: "10px", fontFamily: "monospace", color: "#ffaa44", wordWrap: { width: 320 },
      }));
    } else if (this.view.opponentRevealedHandCard) {
      const rc = this.view.opponentRevealedHandCard;
      const rcName = CLIENT_CARD_DEFS.get(rc.defId)?.name ?? rc.defId;
      addHud(this.add.text(20, 60, `OPP REVEALS: ${rcName} (val ${CLIENT_CARD_DEFS.get(rc.defId)?.value ?? "?"}) — see panel →`, {
        fontSize: "10px", fontFamily: "monospace", color: "#ffaa44",
      }));
    }

    // Contextual play hint
    if (isCompileChoice) {
      addHud(this.add.text(L.W / 2, 54,
        "Select a protocol to compile ↓", {
          fontSize: "11px", fontFamily: "monospace", color: "#ccaa00",
        }).setOrigin(0.5));
    } else if (myTurn) {
      let hint: string;
      if (this.view.pendingBonusPlay) {
        hint = this.view.pendingBonusPlay.anyLine
          ? "Bonus play: click a card, then any line ↓"
          : "Bonus play: click a card, then its protocol line ↓";
      } else if (this.selectedCard === null) {
        hint = "Click a card in your hand to select it";
      } else if (this.faceDownMode) {
        hint = "Face-down: click any of your line zones below ↓";
      } else {
        hint = "Face-up: click a GREEN line zone that matches the card's protocol ↓";
      }
      addHud(this.add.text(L.W / 2, 54, hint, {
        fontSize: "11px", fontFamily: "monospace", color: "#7799bb",
      }).setOrigin(0.5));
    }
  }

  private renderBoard(): void {
    const L = this.computeLayout();
    const { zoneW, zoneH, oppCy, ownCy, midY } = L;

    const selectedProtocol = this.selectedCardProtocolId();

    // ── Effect board interaction setup ──────────────────────────────────────
    const isEffRes = this.turnPhase === TurnPhase.EffectResolution;
    const myEffect = this.view.pendingEffect;
    const effectSpec = isEffRes && myEffect
      ? this.getEffectInputSpec(myEffect)
      : null;
    if (isEffRes) console.log(`[renderBoard] isEffRes=${isEffRes} myEffect=`, myEffect, `effectSpec=`, effectSpec, `needsBoardPick will be:`, effectSpec != null && effectSpec.boardMode != null && !this.effectBoardTargetId);
    const discardToFlipStage2 = isEffRes && myEffect?.type === "discard_to_flip" && !!this.effectHandTargetId;
    const needsBoardPick = discardToFlipStage2 ||
      (effectSpec != null && effectSpec.boardMode != null && !this.effectBoardTargetId);
    const pendingEffectId = myEffect?.id;

    const makeBoardOnClick = (cardPi: 0 | 1) => {
      if (!needsBoardPick) return undefined;
      if (discardToFlipStage2) {
        return (card: CardView) => {
          if ("hidden" in card) return;
          getSocket().emit("resolve_effect", {
            id: pendingEffectId!,
            discardInstanceId: this.effectHandTargetId!,
            targetInstanceId: (card as CardInstance).instanceId,
          });
          this.effectHandTargetId = null;
        };
      }
      return (card: CardView) => {
        if ("hidden" in card) return;
        if (effectSpec!.needsLine) {
          this.effectBoardTargetId = (card as CardInstance).instanceId;
          this.renderAll();
        } else {
          getSocket().emit("resolve_effect", {
            id: pendingEffectId!,
            targetInstanceId: (card as CardInstance).instanceId,
          });
        }
      };
    };
    const makeBoardIsTarget = (cardPi: 0 | 1) => {
      if (!needsBoardPick) return undefined;
      if (discardToFlipStage2) {
        // All non-hidden cards are valid flip targets
        return (card: CardView) => !("hidden" in card);
      }
      return (card: CardView, idx: number, total: number) => {
        const result = this.isBoardCardValidForEffect(card, cardPi, idx, total, myEffect!);
        console.log(`[isTarget] cardPi=${cardPi} myIndex=${this.myIndex} idx=${idx}/${total} result=${result} instanceId=${"instanceId" in card ? (card as any).instanceId : "hidden"} sourceId=${myEffect!.sourceInstanceId}`);
        return result;
      };
    };

    for (let li = 0; li < 3; li++) {
      const rx = L.lineCx[li];
      const myProtoId  = this.view.protocols[li]?.protocolId          ?? "";
      const oppProtoId = this.view.opponentProtocols[li]?.protocolId  ?? "";
      const myCom  = this.view.protocols[li]?.status          === ProtocolStatus.Compiled;
      const oppCom = this.view.opponentProtocols[li]?.status  === ProtocolStatus.Compiled;

      let ownValidity: "none" | "valid" | "wrong_protocol" = "none";
      if (this.isMyTurn() && this.selectedCard !== null && !("hidden" in this.selectedCard)) {
        ownValidity = (this.faceDownMode || this.view.pendingBonusPlay?.anyLine)
          ? "valid"
          : selectedProtocol === myProtoId ? "valid" : "wrong_protocol";
      }

      this.renderLine(
        this.view.opponentLines[li].cards,
        rx, oppCy, li, zoneW, zoneH,
        oppProtoId,
        this.view.opponentProtocols[li]?.status ?? ProtocolStatus.Loading,
        false, "none",
        undefined,
        makeBoardOnClick((1 - this.myIndex) as 0 | 1),
        makeBoardIsTarget((1 - this.myIndex) as 0 | 1)
      );

      this.renderLine(
        this.view.lines[li].cards,
        rx, ownCy, li, zoneW, zoneH,
        myProtoId,
        this.view.protocols[li]?.status ?? ProtocolStatus.Loading,
        true, ownValidity,
        () => this.onLineClick(li),
        makeBoardOnClick(this.myIndex),
        makeBoardIsTarget(this.myIndex)
      );

      // ── Middle protocol + score strip ────────────────────────────
      const ownVal  = this.view.lineValues[li];
      const oppVal  = this.view.opponentLineValues[li];
      const myName  = PROTOCOL_NAMES_CLIENT.get(myProtoId)  ?? myProtoId;
      const oppName = PROTOCOL_NAMES_CLIENT.get(oppProtoId) ?? oppProtoId;
      const indicator = ownVal > oppVal ? "▲" : ownVal < oppVal ? "▼" : "=";
      const scoreColor = ownVal > oppVal ? "#44ff99" : ownVal < oppVal ? "#ff6655" : "#99aacc";
      const myProtoColor  = PROTOCOL_COLORS.get(myProtoId)  ?? 0x1a3a5c;
      const oppProtoColor = PROTOCOL_COLORS.get(oppProtoId) ?? 0x1a3a5c;
      const myProtoComp = this.complementaryProtoColor(myProtoId);
      const oppProtoComp = this.complementaryProtoColor(oppProtoId);

      // Strip background
      this.boardGroup.add(
        this.add.rectangle(rx, midY, zoneW, L.stripH, 0x080d15)
          .setStrokeStyle(1, 0x1a2030),
        true
      );

      // Left/right thirds carry protocol colours; middle third stays neutral for score.
      const thirdW = zoneW / 3;
      const leftCx = rx - zoneW / 2 + thirdW / 2;
      const rightCx = rx + zoneW / 2 - thirdW / 2;

      // Own protocol block (left third) — full rectangle is interactive
      const myProtoRect = this.add.rectangle(leftCx, midY, thirdW, L.stripH, myProtoColor)
        .setAlpha(0.9).setInteractive({ useHandCursor: true });
      myProtoRect.on("pointerover", () => { myProtoRect.setAlpha(1);   this.showFocusProtocol(myProtoId, true, li); });
      myProtoRect.on("pointerout",  () => { myProtoRect.setAlpha(0.9); this.showFocusCard(null); });
      this.boardGroup.add(myProtoRect, true);
      this.boardGroup.add(
        this.add.text(leftCx, midY, (myCom ? "\u2713 " : "") + myName, {
          fontSize: "11px", fontFamily: "monospace", fontStyle: "bold",
          color: myProtoComp,
          wordWrap: { width: thirdW - 8 },
          align: "center",
        }).setOrigin(0.5, 0.5),
        true
      );

      // Score centred
      this.boardGroup.add(
        this.add.text(rx, midY,
          `${ownVal} ${indicator} ${oppVal}`, {
            fontSize: "15px", fontFamily: "monospace", fontStyle: "bold",
            color: scoreColor,
          }).setOrigin(0.5, 0.5), true
      );

      // Opponent protocol block (right third) — full rectangle is interactive
      const oppProtoRect = this.add.rectangle(rightCx, midY, thirdW, L.stripH, oppProtoColor)
        .setAlpha(0.9).setInteractive({ useHandCursor: true });
      oppProtoRect.on("pointerover", () => { oppProtoRect.setAlpha(1);   this.showFocusProtocol(oppProtoId, false, li); });
      oppProtoRect.on("pointerout",  () => { oppProtoRect.setAlpha(0.9); this.showFocusCard(null); });
      this.boardGroup.add(oppProtoRect, true);
      this.boardGroup.add(
        this.add.text(rightCx, midY, (oppCom ? "\u2713 " : "") + oppName, {
          fontSize: "11px", fontFamily: "monospace", fontStyle: "bold",
          color: oppProtoComp,
          wordWrap: { width: thirdW - 8 },
          align: "center",
        }).setOrigin(0.5, 0.5),
        true
      );
    }

    // ── Discard / draw pile column ──────────────────────────────────────────
    this.renderPile(this.view.opponentTrash, this.view.opponentDeckSize, L.pileCx, oppCy, L.pileW, zoneH, "OPP DISCARD", "#cc7744", this.view.opponentHandSize, -42);
    this.renderPile(this.view.trash, this.view.deckSize, L.pileCx, ownCy, L.pileW, zoneH, "MY DISCARD", "#5599cc", undefined, 42);

    // ── Control token (between pile boxes) ─────────────────────────────────
    const iHave = this.view.hasControl;
    const oppHas = this.view.opponentHasControl;
    const tokenActive = iHave || oppHas;
    const tokenSize = 56;
    const tokenMargin = 8;
    // Left-corner anchor inside each pile box.
    const cornerTokenX = L.pileCx - L.pileW / 2 + tokenSize / 2 + tokenMargin;
    // Neutral stays between draw boxes on the left lane.
    const neutralTokenX = L.pileCx - L.pileW / 2 + 44;
    const neutralTokenY = (oppCy + ownCy) / 2;
    // Controlled positions: opponent in lower-left of top box; current player in top-left of bottom box.
    const oppControlledY = oppCy + zoneH / 2 - tokenSize / 2 - tokenMargin;
    const myControlledY = ownCy - zoneH / 2 + tokenSize / 2 + tokenMargin;
    const tokenX = iHave || oppHas ? cornerTokenX : neutralTokenX;
    const tokenY = iHave ? myControlledY : oppHas ? oppControlledY : neutralTokenY;

    // Compact token slot around the token only.
    const tokenSlot = this.add.rectangle(tokenX, tokenY, 72, 64, 0x0b1018)
      .setStrokeStyle(1.5, tokenActive ? 0x8a6a12 : 0x2a3648);
    this.boardGroup.add(tokenSlot, true);

    // Square golden "card" token that fills almost all available lane height.
    const tokenBody = this.add.rectangle(
      tokenX,
      tokenY,
      tokenSize,
      tokenSize,
      tokenActive ? 0xd4a52b : 0x6f6030
    ).setStrokeStyle(2, tokenActive ? 0xf0cd68 : 0x8a7b4a);
    this.boardGroup.add(tokenBody, true);

    // Central dark chip with golden "C" (mirrors value-chip visual language).
    const chipRadius = 16;
    const tokenChip = this.add.circle(tokenX, tokenY, chipRadius, 0x101010)
      .setStrokeStyle(1.5, tokenActive ? 0xf0cd68 : 0x7d7047);
    this.boardGroup.add(tokenChip, true);
    const tokenGlyph = this.add.text(tokenX, tokenY, "C", {
      fontSize: "24px",
      fontFamily: "monospace",
      fontStyle: "bold",
      color: tokenActive ? "#f5d26b" : "#9e8f61",
    }).setOrigin(0.5);
    this.boardGroup.add(tokenGlyph, true);

    // Hover target and focus-panel preview for control token details/rules.
    const tokenHoverHit = this.add.rectangle(tokenX, tokenY, 72, 64, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    tokenHoverHit.on("pointerover", () => {
      tokenSlot.setAlpha(1);
      tokenBody.setScale(1.03);
      this.showFocusControlToken();
    });
    tokenHoverHit.on("pointerout", () => {
      tokenSlot.setAlpha(0.95);
      tokenBody.setScale(1);
      this.showFocusCard(null);
    });
    this.boardGroup.add(tokenHoverHit, true);
  }

  private renderPile(
    cards: CardInstance[],
    deckSize: number,
    cx: number, cy: number,
    pileW: number, pileH: number,
    label: string,
    labelColor: string,
    handSize?: number,
    drawYOffset = 0
  ): void {
    const topY = cy - pileH / 2;
    const leftX = cx - pileW / 2 + 44;
    const stackCx = cx + 32;

    // Background panel
    this.boardGroup.add(
      this.add.rectangle(cx, cy, pileW, pileH, 0x080d15).setStrokeStyle(1, 0x223344), true);
    // Label
    this.boardGroup.add(
      this.add.text(cx, topY + 6, label, {
        fontSize: "9px", fontFamily: "monospace", color: labelColor, fontStyle: "bold",
      }).setOrigin(0.5, 0), true);
    // Hand size (opponent pile only)
    if (handSize !== undefined) {
      this.boardGroup.add(
        this.add.text(cx, topY + 18, `hand: ${handSize}`, {
          fontSize: "11px", fontFamily: "monospace", color: "#cc8855", fontStyle: "bold",
        }).setOrigin(0.5, 0), true);
    }

    // Divider between left draw-count lane and right discard stack lane
    this.boardGroup.add(
      this.add.rectangle(cx - 18, cy, 1, pileH - 12, 0x223344), true);

    // Draw counter — on left side of discard stack
    this.boardGroup.add(
      this.add.text(leftX, cy - 16 + drawYOffset, String(deckSize), {
        fontSize: "40px", fontFamily: "monospace", color: "#4499cc", fontStyle: "bold",
      }).setOrigin(0.5), true);
    this.boardGroup.add(
      this.add.text(leftX, cy + 20 + drawYOffset, "draw", {
        fontSize: "9px", fontFamily: "monospace", color: "#2a5577",
      }).setOrigin(0.5, 0), true);

    // Discard card stack (right side gets more vertical room)
    if (cards.length === 0) {
      this.boardGroup.add(
        this.add.text(stackCx, cy + 10, "empty", {
          fontSize: "9px", fontFamily: "monospace", color: "#334455",
        }).setOrigin(0.5), true);
    } else {
      const cardScale = 0.52;
      const stepPx    = CardSprite.COVERED_STEP * cardScale;
      const cardHalfH = CardSprite.HEIGHT * cardScale / 2;
      const topCardCy = cy + pileH / 2 - cardHalfH - 8;
      const n = cards.length;
      cards.forEach((card, i) => {
        const isCovered = i < n - 1;
        const cardCy    = topCardCy - (n - 1 - i) * stepPx;
        const sprite    = new CardSprite(this, stackCx, cardCy, card, CLIENT_CARD_DEFS, isCovered);
        sprite.setScale(cardScale);
        sprite.addFocusHover((c) => this.showFocusCard(c));
        this.boardGroup.add(sprite, true);
      });
    }
  }

  private renderLine(
    cards: CardView[],
    cx: number, cy: number,
    li: number,
    zoneW: number, zoneH: number,
    protocolId: string,
    protocolStatus: ProtocolStatus,
    isOwn: boolean,
    validity: "none" | "valid" | "wrong_protocol",
    onClick?: () => void,
    onCardClick?: (card: CardView) => void,
    isCardEffectTarget?: (card: CardView, idx: number, total: number) => boolean
  ): void {
    const compiled = protocolStatus === ProtocolStatus.Compiled;
    const protoIdleColor = PROTOCOL_COLORS.get(protocolId) ?? LINE_COLORS[li];

    // Zone border colour reflects play validity       when a card is selected
    // Valid placement keeps protocol colour, with a slightly wider border.
    const borderColor = protoIdleColor;
    const borderWidth = validity === "valid" ? 3 : 2;

    const zoneBg = this.add.rectangle(cx, cy, zoneW, zoneH,
      validity === "valid" ? 0x12271a : compiled ? 0x001a0e : 0x080d15)
      .setStrokeStyle(borderWidth, borderColor);

    if (validity !== "none" && onClick) {
      zoneBg.setInteractive({ useHandCursor: validity === "valid" });
      zoneBg.on("pointerover", () =>
        zoneBg.setStrokeStyle(borderWidth + 1, protoIdleColor));
      zoneBg.on("pointerout",  () =>
        zoneBg.setStrokeStyle(borderWidth, borderColor));
      zoneBg.on("pointerdown", onClick);
    }
    this.boardGroup.add(zoneBg, true);

    // "Wrong protocol" banner overlay
    if (validity === "wrong_protocol") {
      const protoName = PROTOCOL_NAMES_CLIENT.get(protocolId) ?? protocolId;
      this.boardGroup.add(
        this.add.text(cx, cy - zoneH / 2 + 10,
          `✗ needs ${protoName}`,
          { fontSize: "9px", fontFamily: "monospace", color: "#885500" }
        ).setOrigin(0.5, 0), true
      );
    }

    // ── Vertical card stack (full zone width, cards centred) ─────────────
    const cardScale = 0.52;
    const stepPx    = CardSprite.COVERED_STEP * cardScale;  // 26px
    const cardHalfH = CardSprite.HEIGHT * cardScale / 2;    // 33px
    const topCardCy = cy + zoneH / 2 - cardHalfH - 8;
    const n = cards.length;
    cards.forEach((card, i) => {
      const isCovered = i < n - 1;
      const cardCy    = topCardCy - (n - 1 - i) * stepPx;
      const sprite    = new CardSprite(this, cx, cardCy, card, CLIENT_CARD_DEFS, isCovered);
      sprite.setScale(cardScale);
      const isTarget = isCardEffectTarget && onCardClick && isCardEffectTarget(card, i, n);
      if (isTarget) {
        sprite.makeEffectTarget((c) => onCardClick!(c));
      }
      sprite.addFocusHover((c) => this.showFocusCard(c));
      // Highlight the staged board-card selection (picked, waiting for line)
      if (!("hidden" in card) && this.effectBoardTargetId &&
          (card as CardInstance).instanceId === this.effectBoardTargetId) {
        sprite.setSelected(true);
      }
      this.boardGroup.add(sprite, true);
    });
  }

  /** Draws subtle coloured zone overlays — gated by DEV_LAYOUT_ZONES. */
  private renderLayoutDebug(): void {
    const L = this.computeLayout();
    const add = (go: Phaser.GameObjects.GameObject) => {
      this.boardGroup.add(go, true);
      (go as any).setDepth?.(-10);
      return go;
    };
    const zone = (cx: number, cy: number, w: number, h: number, fill: number, alpha = 0.08) =>
      add(this.add.rectangle(cx, cy, w, h, fill).setAlpha(alpha));

    const { W, H, zoneW, zoneH, oppCy, ownCy, stripH, midY, lineCx, focusPanelCx, focusPanelW, pileCx, pileW, hudH, handY, handLeft, handRight } = L as any;

    // HUD strip
    zone(W / 2, hudH / 2, W, hudH, 0x002244, 0.25);
    // Opponent line zones
    for (let li = 0; li < 3; li++) zone(lineCx[li], oppCy, zoneW, zoneH, 0x440088, 0.12);
    // Mid strip
    zone(W / 2, midY, W, stripH, 0x004400, 0.18);
    // Own line zones
    for (let li = 0; li < 3; li++) zone(lineCx[li], ownCy, zoneW, zoneH, 0x004488, 0.12);
    // Focus panel
    zone(focusPanelCx, H / 2, focusPanelW, H, 0x443300, 0.15);
    // Pile column
    zone(pileCx, H / 2, pileW, H, 0x003322, 0.15);
    // Hand strip
    const handH = CardSprite.HEIGHT + 20;
    zone((handLeft + handRight) / 2, handY, handRight - handLeft, handH, 0x220033, 0.18);
  }

  private renderHand(): void {
    const L = this.computeLayout();
    const hand = this.view.hand;
    const handAreaW = L.handRight - L.handLeft;
    const spacing   = Math.min(CardSprite.WIDTH + 10, handAreaW / Math.max(hand.length, 1));
    const totalW    = spacing * (hand.length - 1);
    const startX    = (L.handLeft + L.handRight) / 2 - totalW / 2;

    const inEffect  = this.turnPhase === TurnPhase.EffectResolution;
    const effectType = this.view.pendingEffect?.type ?? null;
    const effectId   = this.view.pendingEffect?.id ?? null;

    const pendingDiscard               = inEffect && effectType === "discard";
    const pendingPlayFacedown          = inEffect && effectType === "play_facedown" && !this.effectHandTargetId;
    const pendingDiscardToFlipStage1   = inEffect && effectType === "discard_to_flip" && !this.effectHandTargetId;
    const pendingHandPickImmediate     = inEffect &&
      (effectType === "reveal_own_hand" || effectType === "exchange_hand" || effectType === "give_to_draw");

    hand.forEach((card, i) => {
      const x = startX + i * spacing;
      const sprite = new CardSprite(this, x, L.handY, card, CLIENT_CARD_DEFS);
      this.handGroup.add(sprite, true);

      const isSelected = this.selectedCard !== null &&
        "instanceId" in this.selectedCard &&
        "instanceId" in card &&
        this.selectedCard.instanceId === card.instanceId;

      // Highlight staged hand card for play_facedown
      const isStagedHand = inEffect && effectType === "play_facedown" &&
        this.effectHandTargetId !== null && "instanceId" in card &&
        (card as CardInstance).instanceId === this.effectHandTargetId;

      if (isStagedHand) {
        sprite.setSelected(true);
      } else if (isSelected) {
        sprite.setSelected(true);
      }

      if (pendingDiscard) {
        sprite.makeInteractive((c) => {
          if ("hidden" in c) return;
          getSocket().emit("resolve_effect", {
            id: effectId!,
            targetInstanceId: (c as CardInstance).instanceId,
          });
        });
      } else if (pendingPlayFacedown) {
        sprite.makeInteractive((c) => {
          if ("hidden" in c) return;
          this.effectHandTargetId = (c as CardInstance).instanceId;
          this.renderAll();
        });
      } else if (pendingDiscardToFlipStage1) {
        sprite.makeInteractive((c) => {
          if ("hidden" in c) return;
          this.effectHandTargetId = (c as CardInstance).instanceId;
          this.renderAll();
        });
      } else if (pendingHandPickImmediate) {
        sprite.makeInteractive((c) => {
          if ("hidden" in c) return;
          getSocket().emit("resolve_effect", {
            id: effectId!,
            targetInstanceId: (c as CardInstance).instanceId,
          });
        });
      } else if (this.isMyTurn()) {
        sprite.makeInteractive((c) => {
          if ("hidden" in c) return;
          if (this.selectedCard && "instanceId" in this.selectedCard && this.selectedCard.instanceId === (c as any).instanceId) {
            this.selectedCard = null;
          } else {
            this.selectedCard = c;
          }
          this.renderAll();
        });
      }
      sprite.addFocusHover((c) => this.showFocusCard(c));
    });
  }

  // ── Interaction ───────────────────────────────────────────────────────────────

  private onLineClick(lineIndex: number): void {
    if (!this.selectedCard || "hidden" in this.selectedCard) return;
    const face = this.faceDownMode ? CardFace.FaceDown : CardFace.FaceUp;

    if (this.devMode) {
      // Apply the play locally — no server in DEV mode.
      const cardIdx = this.view.hand.findIndex(
        (c) => "instanceId" in c && c.instanceId === (this.selectedCard as any).instanceId
      );
      if (cardIdx !== -1) {
        const [card] = this.view.hand.splice(cardIdx, 1) as import("@compile/shared").CardInstance[];
        card.face = face;
        this.view.lines[lineIndex].cards.push(card);
      }
      this.selectedCard = null;
      this.faceDownMode = false;
      this.renderAll();
      return;
    }

    getSocket().emit("play_card", {
      instanceId: this.selectedCard.instanceId,
      face,
      lineIndex,
    });
    this.selectedCard = null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  /** Returns CSS hex for the complementary colour of a protocol id. */
  private complementaryProtoColor(protoId: string): string {
    const base = PROTOCOL_COLORS.get(protoId) ?? 0x1a3a5c;
    const comp = (~base) & 0xffffff;
    return `#${comp.toString(16).padStart(6, "0")}`;
  }

  /** Returns the protocol ID that owns the selected hand card, or null. */
  private selectedCardProtocolId(): string | null {
    if (!this.selectedCard || "hidden" in this.selectedCard) return null;
    const defId = (this.selectedCard as any).defId as string;
    // defId format: "<proto>_<value>", e.g. "spd_3" → "proto_spd"
    const prefix = defId.split("_")[0];
    return `proto_${prefix}`;
  }

  private isMyTurn(): boolean {
    return this.turnPhase === TurnPhase.Action && this.view.isActivePlayer;
  }

  private onCompileClick(lineIndex: number): void {
    if (this.devMode) {
      // In DEV mode, apply compile locally
      this.view.compilableLines = [];
      this.renderAll();
      return;
    }
    getSocket().emit("compile_line", { lineIndex });
  }

  private showToast(msg: string, color = "#ffffff"): void {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height / 2, msg, {
      fontSize: "20px", fontFamily: "monospace", color,
      backgroundColor: "#000000cc", padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setDepth(100);
    this.tweens.add({ targets: t, alpha: 0, delay: 2000, duration: 600, onComplete: () => t.destroy() });
  }

  // ── Effect input helpers ──────────────────────────────────────────────────

  private getEffectInputSpec(effect: PendingEffect): {
    boardMode: string | null;
    handPick: boolean;
    needsLine: boolean;
    lineScope: "own" | "opponent" | "any" | "encoded" | null;
    isOptional: boolean;
    isAutoExecute: boolean;
  } {
    const { type, payload } = effect;
    const targets    = payload.targets    as string  | undefined;
    const toSourceLine = payload.toSourceLine as boolean | undefined;
    const optional   = payload.optional   as boolean | undefined;
    const auto = { boardMode: null, handPick: false, needsLine: false, lineScope: null as null, isOptional: false, isAutoExecute: true };

    switch (type) {
      case "shift": {
        if (targets === "own_facedown_in_line")
          return { boardMode: null, handPick: false, needsLine: true, lineScope: "own", isOptional: false, isAutoExecute: false };
        if (targets === "last_targeted")
          return toSourceLine
            ? auto
            : { boardMode: null, handPick: false, needsLine: true, lineScope: "any", isOptional: false, isAutoExecute: false };
        if (!targets)
          return { boardMode: "own_any", handPick: false, needsLine: true, lineScope: "own", isOptional: false, isAutoExecute: false };
        if (targets === "any_facedown")
          return toSourceLine
            ? { boardMode: "any_facedown", handPick: false, needsLine: false, lineScope: null, isOptional: false, isAutoExecute: false }
            : { boardMode: "any_facedown", handPick: false, needsLine: true, lineScope: "any", isOptional: false, isAutoExecute: false };
        if (targets === "opponent_covered")
          return { boardMode: "opponent_covered", handPick: false, needsLine: true, lineScope: "opponent", isOptional: false, isAutoExecute: false };
        if (targets === "opponent_any")
          return { boardMode: "opponent_any", handPick: false, needsLine: true, lineScope: "opponent", isOptional: false, isAutoExecute: false };
        if (targets === "opponent_facedown")
          return { boardMode: "opponent_facedown", handPick: false, needsLine: true, lineScope: "opponent", isOptional: false, isAutoExecute: false };
        if (targets === "own_others")
          return { boardMode: "own_others", handPick: false, needsLine: true, lineScope: "own", isOptional: false, isAutoExecute: false };
        return auto;
      }
      case "shift_flip_self":
        return { boardMode: "own_any", handPick: false, needsLine: true, lineScope: "own", isOptional: true, isAutoExecute: false };
      case "flip":
      case "flip_draw_equal": {
        if (type === "flip" && (targets === "all_other_faceup" || targets === "self")) return auto;
        const boardMode =
          targets === "any_facedown"       ? "any_facedown"      :
          targets === "any_uncovered"      ? "any_uncovered"     :
          targets === "opponent_any"       ? "opponent_any"      :
          targets === "own_covered_in_line"? "own_covered_in_line" :
                                             "any_card";
        return { boardMode, handPick: false, needsLine: false, lineScope: null, isOptional: optional ?? false, isAutoExecute: false };
      }
      case "delete": {
        if (targets === "each_other_line") return auto;
        if (targets === "line_values_1_2" || targets === "line_8plus_cards")
          return { boardMode: null, handPick: false, needsLine: true, lineScope: "encoded", isOptional: false, isAutoExecute: false };
        const boardMode =
          targets === "any_facedown" ? "any_facedown" :
          targets === "value_0_or_1" ? "value_0_or_1" :
                                       "any_card";
        return { boardMode, handPick: false, needsLine: false, lineScope: null, isOptional: false, isAutoExecute: false };
      }
      case "return":
        return { boardMode: "any_card", handPick: false, needsLine: false, lineScope: null, isOptional: false, isAutoExecute: false };
      case "reveal_own_hand":
      case "exchange_hand":
      case "give_to_draw":
        return { boardMode: null, handPick: true, needsLine: false, lineScope: null, isOptional: false, isAutoExecute: false };
      default:
        return auto;
    }
  }

  private isBoardCardValidForEffect(
    card: CardView,
    cardPi: 0 | 1,
    idxInLine: number,
    totalInLine: number,
    effect: PendingEffect
  ): boolean {
    const spec = this.getEffectInputSpec(effect);
    if (!spec.boardMode) return false;
    const isMine    = cardPi === this.myIndex;
    const isOpp     = !isMine;
    const isTopCard = idxInLine === totalInLine - 1;

    // Hidden (opponent face-down) cards: selectable for modes that allow face-down or any opponent
    if ("hidden" in card) {
      if (!isOpp) return false;
      return spec.boardMode === "any_card" || spec.boardMode === "any_facedown" ||
             spec.boardMode === "opponent_any" || spec.boardMode === "opponent_facedown" ||
             spec.boardMode === "opponent_covered";
    }

    const c   = card as CardInstance;
    const def = CLIENT_CARD_DEFS.get(c.defId);

    switch (spec.boardMode) {
      case "any_card":           return true;
      case "any_facedown":       return c.face === CardFace.FaceDown;
      case "any_uncovered":      return isTopCard;
      case "opponent_any":       return isOpp;
      case "opponent_covered":   return isOpp && !isTopCard;
      case "opponent_facedown":  return isOpp && c.face === CardFace.FaceDown;
      case "own_any":            return isMine;
      case "own_others":         return isMine && c.instanceId !== effect.sourceInstanceId;
      case "own_covered_in_line":return isMine && !isTopCard;
      case "value_0_or_1": {
        const val = c.face === CardFace.FaceDown ? 2 : (def?.value ?? 0);
        return val <= 1;
      }
      default: return true;
    }
  }

  private getBoardPickHint(boardMode: string): string {
    switch (boardMode) {
      case "any_card":            return "Click any card on the board \u2193";
      case "any_facedown":        return "Click a face-down card on the board \u2193";
      case "any_uncovered":       return "Click any uncovered (top) card on the board \u2193";
      case "opponent_any":        return "Click any of your opponent\u2019s cards \u2193";
      case "opponent_covered":    return "Click a covered card in your opponent\u2019s lines \u2193";
      case "opponent_facedown":   return "Click a face-down card in your opponent\u2019s lines \u2193";
      case "own_any":             return "Click any of your own cards on the board \u2193";
      case "own_others":          return "Click one of your other cards on the board \u2193";
      case "own_covered_in_line": return "Click a covered card in this line \u2193";
      case "value_0_or_1":        return "Click a card with value 0 or 1 \u2193";
      default:                    return "Click a card on the board \u2193";
    }
  }

  private activeTurnState(): "START" | "CONTROL" | "COMPILE" | "ACTION" | "CACHE" | "END" {
    switch (this.turnPhase) {
      case TurnPhase.Start:
        return "START";
      case TurnPhase.CheckControl:
        return "CONTROL";
      case TurnPhase.CheckCompile:
      case TurnPhase.CompileChoice:
        return "COMPILE";
      case TurnPhase.Action:
      case TurnPhase.EffectResolution:
        return "ACTION";
      case TurnPhase.ClearCache:
        return "CACHE";
      case TurnPhase.End:
      default:
        return "END";
    }
  }

  // ── Focus card panel ──────────────────────────────────────────────────────

  private showFocusTurnState(state: "START" | "CONTROL" | "COMPILE" | "ACTION" | "CACHE" | "END"): void {
    this.focusPanelGroup.clear(true, true);
    const L = this.computeLayout();
    const { focusPanelCx: cx, focusPanelW: pw, H } = L;

    const add = (go: Phaser.GameObjects.GameObject) => {
      (go as any).setDepth?.(10);
      this.focusPanelGroup.add(go, true);
      return go;
    };

    add(this.add.rectangle(cx, H / 2, pw, H, 0x070b11).setStrokeStyle(1, 0x18283a));
    add(this.add.text(cx, 10, "TURN STATE", {
      fontSize: "11px", fontFamily: "monospace", color: "#2a4d72", fontStyle: "bold",
    }).setOrigin(0.5, 0));

    const summaries: Record<typeof state, string> = {
      START: "Start-of-turn effects and setup resolve.",
      CONTROL: "Check who controls at least two lines and assign control token.",
      COMPILE: "If any line can compile, you must choose one to compile.",
      ACTION: "Play cards and resolve card/effect interactions.",
      CACHE: "Temporary per-turn effect memory is cleared.",
      END: "End-of-turn effects resolve, then turn passes.",
    };

    add(this.add.text(cx, H / 2 - 110, state, {
      fontSize: "30px", fontFamily: "monospace", fontStyle: "bold", color: "#9ec7ea",
    }).setOrigin(0.5));

    add(this.add.text(cx, H / 2 - 58, `Current: ${this.activeTurnState()}`, {
      fontSize: "12px", fontFamily: "monospace", color: state === this.activeTurnState() ? "#ffe27a" : "#6f8da8",
      fontStyle: state === this.activeTurnState() ? "bold" : "normal",
    }).setOrigin(0.5));

    add(this.add.text(cx, H / 2 - 16, summaries[state], {
      fontSize: "13px",
      fontFamily: "monospace",
      color: "#a9bfcd",
      align: "center",
      wordWrap: { width: pw - 30 },
    }).setOrigin(0.5, 0));
  }

  /**
   * Renders a large readable card in the right-side focus panel.
   * Pass null to show the empty placeholder. Called on every hover enter/leave
   * and at the start of each renderAll() to reset stale state.
   */
  private showFocusProtocol(protoId: string, isOwn: boolean, lineIndex: number): void {
    this.focusPanelGroup.clear(true, true);
    const L = this.computeLayout();
    const { focusPanelCx: cx, focusPanelW: pw, H } = L;

    const add = (go: Phaser.GameObjects.GameObject) => {
      (go as any).setDepth?.(10);
      this.focusPanelGroup.add(go, true);
      return go;
    };

    // Panel background
    add(this.add.rectangle(cx, H / 2, pw, H, 0x070b11).setStrokeStyle(1, 0x18283a));
    add(this.add.text(cx, 10, "PROTOCOL", {
      fontSize: "9px", fontFamily: "monospace", color: "#1a3355",
    }).setOrigin(0.5, 0));

    // ── Landscape card centred in panel ────────────────────────────────────
    // Drawn wide & short to look like a card lying on its side
    const cardW = pw - 20;   // ~220px
    const cardH = 130;
    const cardCy = H / 2 - 40;
    const cardCx = cx;

    const protoColor  = PROTOCOL_COLORS.get(protoId) ?? 0x1a3a5c;
    const protoComp = this.complementaryProtoColor(protoId);
    const protoName   = PROTOCOL_NAMES_CLIENT.get(protoId) ?? protoId;
    const compiled    = isOwn
      ? this.view.protocols[lineIndex]?.status === ProtocolStatus.Compiled
      : this.view.opponentProtocols[lineIndex]?.status === ProtocolStatus.Compiled;
    const ownVal   = this.view.lineValues[lineIndex];
    const oppVal   = this.view.opponentLineValues[lineIndex];
    const myVal    = isOwn ? ownVal : oppVal;
    const theirVal = isOwn ? oppVal : ownVal;

    // Card outline
    add(this.add.rectangle(cardCx, cardCy, cardW, cardH, 0x0e1c2e)
      .setStrokeStyle(2, compiled ? 0x00ffcc : 0x2d7acc));

    // Coloured header strip — left 30% of width (the "top row" lying on its side)
    const headerW = Math.round(cardW * 0.30);
    const headerCx = cardCx - cardW / 2 + headerW / 2;
    add(this.add.rectangle(headerCx, cardCy, headerW, cardH, protoColor));

    // Protocol name — vertical in the header (rotated 90° text via angle)
    const nameText = this.add.text(headerCx, cardCy, protoName, {
      fontSize: "15px", fontFamily: "monospace", color: protoComp, fontStyle: "bold",
    }).setOrigin(0.5, 0.5).setAngle(-90);
    add(nameText);

    // Status label
    const statusLabel = compiled ? "COMPILED" : "Loading...";
    const statusColor = compiled ? "#00ffcc" : "#5588aa";
    add(this.add.text(headerCx, cardCy + cardH / 2 - 10, statusLabel, {
      fontSize: "8px", fontFamily: "monospace", color: statusColor, fontStyle: "bold",
    }).setOrigin(0.5, 1));

    // Body — right portion
    const bodyX = cardCx - cardW / 2 + headerW + 10;
    const bodyRight = cardCx + cardW / 2 - 10;
    const bodyCx = (bodyX + bodyRight) / 2;

    // Your line value
    add(this.add.text(bodyX, cardCy - cardH / 2 + 14, isOwn ? "YOUR LINE" : "OPP LINE", {
      fontSize: "9px", fontFamily: "monospace", color: "#5588aa",
    }).setOrigin(0, 0));
    add(this.add.text(bodyX, cardCy - cardH / 2 + 26, String(myVal), {
      fontSize: "34px", fontFamily: "monospace", color: "#c8eeff", fontStyle: "bold",
    }).setOrigin(0, 0));

    // Divider
    add(this.add.rectangle(bodyCx, cardCy + 2, bodyRight - bodyX, 1, 0x1e4a70));

    // Opponent line value
    add(this.add.text(bodyX, cardCy + 8, isOwn ? "OPP LINE" : "YOUR LINE", {
      fontSize: "9px", fontFamily: "monospace", color: "#5588aa",
    }).setOrigin(0, 0));
    add(this.add.text(bodyX, cardCy + 20, String(theirVal), {
      fontSize: "34px", fontFamily: "monospace", color: "#ffbb88", fontStyle: "bold",
    }).setOrigin(0, 0));

    // ── Line index indicator below card ────────────────────────────────────
    add(this.add.text(cx, cardCy + cardH / 2 + 14, `Line ${lineIndex}`, {
      fontSize: "11px", fontFamily: "monospace", color: "#334455",
    }).setOrigin(0.5, 0));
  }

  private showFocusControlToken(): void {
    this.focusPanelGroup.clear(true, true);
    const L = this.computeLayout();
    const { focusPanelCx: cx, focusPanelW: pw, H } = L;

    const add = (go: Phaser.GameObjects.GameObject) => {
      (go as any).setDepth?.(10);
      this.focusPanelGroup.add(go, true);
      return go;
    };

    add(this.add.rectangle(cx, H / 2, pw, H, 0x070b11).setStrokeStyle(1, 0x18283a));
    add(this.add.text(cx, 10, "CONTROL TOKEN", {
      fontSize: "18px", fontFamily: "monospace", color: "#1a3355",
    }).setOrigin(0.5, 0));

    const iHave = this.view.hasControl;
    const oppHas = this.view.opponentHasControl;
    const tokenActive = iHave || oppHas;
    const controlOwner = iHave ? "You" : oppHas ? "Opponent" : "Neutral";

    // Square token preview (card-like, unlike regular rectangular cards).
    const tokenSize = 150;
    const tokenCy = H / 2 - 70;
    add(this.add.rectangle(cx, tokenCy, tokenSize, tokenSize, tokenActive ? 0xd4a52b : 0x6f6030)
      .setStrokeStyle(3, tokenActive ? 0xf0cd68 : 0x8a7b4a));
    add(this.add.circle(cx, tokenCy, 44, 0x101010)
      .setStrokeStyle(2, tokenActive ? 0xf0cd68 : 0x7d7047));
    add(this.add.text(cx, tokenCy, "C", {
      fontSize: "62px", fontFamily: "monospace", fontStyle: "bold",
      color: tokenActive ? "#f5d26b" : "#9e8f61",
    }).setOrigin(0.5));

    add(this.add.text(cx, tokenCy + tokenSize / 2 + 18, `In Control: ${controlOwner}`, {
      fontSize: "13px", fontFamily: "monospace", fontStyle: "bold",
      color: tokenActive ? "#f5d26b" : "#778899",
    }).setOrigin(0.5, 0));

    const rules = tokenActive
      ? "Compile/Reset: Return Control token to neutral. You may rearrange yours or the opponent's protocols."
      : "Control: Take control if you have most points in at least two lines.";
    add(this.add.text(cx, tokenCy + tokenSize / 2 + 48, rules, {
      fontSize: "12px",
      fontFamily: "monospace",
      color: "#a9bfcd",
      align: "center",
      wordWrap: { width: pw - 26 },
    }).setOrigin(0.5, 0));
  }

  private showFocusCard(card: CardView | null): void {
    this.focusPanelGroup.clear(true, true);
    const L = this.computeLayout();
    const { focusPanelCx: cx, focusPanelW: pw, H } = L;

    const add = (go: Phaser.GameObjects.GameObject) => {
      (go as any).setDepth?.(10);
      this.focusPanelGroup.add(go, true);
      return go;
    };

    // Panel background — full-height right strip
    add(this.add.rectangle(cx, H / 2, pw, H, 0x070b11).setStrokeStyle(1, 0x18283a));
    add(this.add.text(cx, 10, "CARD DETAIL", {
      fontSize: "9px", fontFamily: "monospace", color: "#1a3355",
    }).setOrigin(0.5, 0));

    if (!card) {
      const revealedCard = this.view?.opponentRevealedHandCard ?? null;
      if (revealedCard) {
        add(this.add.text(cx, H / 2 - 155, "OPP REVEALED", {
          fontSize: "11px", fontFamily: "monospace", color: "#ffaa44", fontStyle: "bold",
        }).setOrigin(0.5));
        this.buildFocusCard(cx, H / 2, revealedCard, 200, 280, add);
      } else {
        add(this.add.text(cx, H / 2, "hover a card\nto inspect", {
          fontSize: "12px", fontFamily: "monospace", color: "#1a3355", align: "center",
        }).setOrigin(0.5));
      }
      return;
    }

    // Card dimensions: 200 × 280 px  →  ratio 200/280 = 0.714 ≈ 63/88 (life-size feel)
    this.buildFocusCard(cx, H / 2, card, 200, 280, add);
  }

  /** Renders a large face-up / face-down card at (cx, cy) into the focus panel. */
  private buildFocusCard(
    cx: number, cy: number,
    card: CardView,
    w: number, h: number,
    add: (go: Phaser.GameObjects.GameObject) => Phaser.GameObjects.GameObject
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
      const outLight = light < 0.5 ? 0.72 : 0.28;

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
    const isHidden   = "hidden" in card;
    const isFaceDown = isHidden || (!isHidden && (card as any).face === CardFace.FaceDown);
    const defId      = !isHidden ? (card as any).defId as string : undefined;
    const def        = defId ? CLIENT_CARD_DEFS.get(defId) : undefined;
    const protoColor = defId ? (PROTOCOL_COLORS.get(`proto_${defId.split("_")[0]}`) ?? 0x1a3a5c) : 0x1a3a5c;
    const faceUpBgFill = shade(protoColor, 0.7);
    const titleComp = oppositeHueCss(protoColor);
    const bgComp  = oppositeHueCss(faceUpBgFill);

    const hH = h / 2;  // 140
    const hW = w / 2;  // 100

    // Rounded white outer border
    const borderPad = 4;
    const borderRadius = 10;
    const borderGfx = this.add.graphics();
    borderGfx.lineStyle(4, 0xffffff, 0.9);
    borderGfx.strokeRoundedRect(cx - hW - borderPad, cy - hH - borderPad, w + borderPad * 2, h + borderPad * 2, borderRadius);
    add(borderGfx);

    // Card outline
    const bgFill   = isFaceDown ? 0x242424 : faceUpBgFill;
    const bgStroke = isFaceDown ? 0x666666 : protoColor;
    add(this.add.rectangle(cx, cy, w, h, bgFill).setStrokeStyle(2, bgStroke));

    if (isFaceDown) {
      // Subtle vertical stripe texture
      for (let dx = -80; dx <= 80; dx += 25) {
        add(this.add.rectangle(cx + dx, cy, 6, h - 8, 0x3a3a3a).setAlpha(0.55));
      }
      // Value chip — top-right
      const chip = this.add.container(cx + hW - 22, cy - hH + 22);
      chip.add(this.add.circle(0, 0, 18, 0x3a3a3a));
      chip.add(this.add.text(0, 0, "2", {
        fontSize: "22px", fontFamily: "monospace", color: "#888888", fontStyle: "bold",
      }).setOrigin(0.5));
      add(chip);
      // Label
      add(this.add.text(cx, cy + hH - 16, "FACE DOWN", {
        fontSize: "12px", fontFamily: "monospace", color: "#666666",
      }).setOrigin(0.5, 1));
      return;
    }

    if (!def) return;

    // ── Name bar — top 38px ──────────────────────────────────────────────────
    const nameBarH  = 38;
    const nameBarCy = cy - hH + nameBarH / 2;
    add(this.add.rectangle(cx, nameBarCy, w, nameBarH, protoColor));
    add(this.add.text(cx, nameBarCy, def.name, {
      fontSize: "20px", fontFamily: "monospace", color: titleComp, fontStyle: "bold",
      wordWrap: { width: w - 52 },
    }).setOrigin(0.5));

    // Value chip — top-right of name bar
    const chip = this.add.container(cx + hW - 22, cy - hH + 20);
    chip.add(this.add.circle(0, 0, 18, shade(faceUpBgFill, 0.6)));
    chip.add(this.add.text(0, 0, String(def.value), {
      fontSize: "22px", fontFamily: "monospace", color: bgComp, fontStyle: "bold",
    }).setOrigin(0.5));
    add(chip);

    // ── Three equal sections for START / PLAY / END ──────────────────────────
    const secH = (h - nameBarH) / 3;                           // ≈ 80.7px each
    const secTop = (i: number) => cy - hH + nameBarH + secH * i;

    // Divider lines at section boundaries
    for (let i = 0; i < 3; i++) {
      add(this.add.rectangle(cx, secTop(i), w, 1, 0x1e4a70));
    }

    const sections = [
      { tag: "START", text: def.top },
      { tag: "PLAY",  text: def.mid },
      { tag: "END",   text: def.bot },
    ] as const;

    sections.forEach(({ tag, text }, i) => {
      const sTop = secTop(i);
      if (!text) {
        add(this.add.text(cx, sTop + secH / 2, "—", {
          fontSize: "12px", fontFamily: "monospace", color: bgComp,
        }).setOrigin(0.5));
        return;
      }
      // Trigger label — top-left of section
      add(this.add.text(cx - hW + 7, sTop + 6, tag, {
        fontSize: "11px", fontFamily: "monospace", color: bgComp,
      }).setOrigin(0, 0));
      // Effect text — centred, wrapping
      add(this.add.text(cx, sTop + 22, text, {
        fontSize: "14px", fontFamily: "monospace", color: bgComp,
        wordWrap: { width: w - 18 }, align: "center",
      }).setOrigin(0.5, 0));
    });
  }

  private renderLinePicker(
    lineCx: [number, number, number],
    addHud: (go: Phaser.GameObjects.GameObject) => Phaser.GameObjects.GameObject,
    scope: "own" | "opponent" | "any" | "encoded",
    onPick: (lineIndex: number) => void
  ): void {
    const makeBtn = (cx: number, y: number, label: string, lineIdx: number, borderColor: number, textColor: string) => {
      const btn = this.add.rectangle(cx, y, 140, 26, 0x001a0a)
        .setStrokeStyle(2, borderColor)
        .setInteractive({ useHandCursor: true });
      btn.on("pointerover",  () => btn.setFillStyle(0x003320));
      btn.on("pointerout",   () => btn.setFillStyle(0x001a0a));
      btn.on("pointerdown",  () => onPick(lineIdx));
      addHud(btn);
      addHud(this.add.text(cx, y, label, {
        fontSize: "10px", fontFamily: "monospace", color: textColor, fontStyle: "bold",
      }).setOrigin(0.5));
    };

    const ownName = (li: number) =>
      PROTOCOL_NAMES_CLIENT.get(this.view.protocols[li]?.protocolId ?? "") ?? `Line ${li}`;
    const oppName = (li: number) =>
      PROTOCOL_NAMES_CLIENT.get(this.view.opponentProtocols[li]?.protocolId ?? "") ?? `Opp ${li}`;
    const ownColor = (li: number) => this.complementaryProtoColor(this.view.protocols[li]?.protocolId ?? "");
    const oppColor = (li: number) => this.complementaryProtoColor(this.view.opponentProtocols[li]?.protocolId ?? "");

    if (scope === "own" || scope === "any") {
      for (let li = 0; li < 3; li++)
        makeBtn(lineCx[li], 88, ownName(li), li, 0x00ff88, ownColor(li));
    } else if (scope === "opponent") {
      for (let li = 0; li < 3; li++)
        makeBtn(lineCx[li], 88, oppName(li), li, 0xff8844, oppColor(li));
    } else if (scope === "encoded") {
      for (let li = 0; li < 3; li++)
        makeBtn(lineCx[li], 82, `Own: ${ownName(li)}`, li, 0x00ff88, ownColor(li));
      for (let li = 0; li < 3; li++)
        makeBtn(lineCx[li], 112, `Opp: ${oppName(li)}`, li + 3, 0xff8844, oppColor(li));
    }
  }
}
