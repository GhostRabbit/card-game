import Phaser from "phaser";
import { PlayerView, TurnPhase, CardView, CardFace, CardInstance, ProtocolStatus, PendingEffect } from "@compile/shared";
import { getSocket } from "../network/SocketClient";
import { CardSprite } from "../objects/CardSprite";
import { CARD_DEFS_CLIENT, PROTOCOL_NAMES_CLIENT, PROTOCOL_COLORS, PROTOCOL_ACCENT_COLORS } from "../data/cardDefs";
import { matchesEitherLineProtocol } from "./rules/playValidity";
import { renderEffectResolutionHUD } from "./ui/effectResolutionRenderer";
import { renderFocusCardPanel, renderFocusControlToken, renderFocusProtocol, renderFocusTurnState } from "./ui/focusPanelRenderers";

const CLIENT_CARD_DEFS = CARD_DEFS_CLIENT;

/** Set true to draw coloured zone overlays — easy to disable for production */
const DEV_LAYOUT_ZONES = false;

interface GameSceneData {
  initialPayload: { view: PlayerView; turnPhase: TurnPhase };
  myIndex: 0 | 1;
  devMode?: boolean;
  mockEffectType?: string;
}

interface HudStatusText {
  id: string;
  text: string;
}

const LINE_COLORS = [0x2200aa, 0x008822, 0xaa6600];

export class GameScene extends Phaser.Scene {
  private static readonly PHASE_HIGHLIGHT_MS = 500;
  private myIndex: 0 | 1 = 0;
  private view!: PlayerView;
  private turnPhase!: TurnPhase;
  private previousTurnPhase!: TurnPhase;
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
  private testIdOverlay?: HTMLElement;
  private phaseIntroTimers: Phaser.Time.TimerEvent[] = [];
  private mockEffectMode = false;
  private injectedEffect: PendingEffect | null = null;
    private phaseGlow: Phaser.GameObjects.Rectangle | null = null;
  private pinnedRevealCardId: string | null = null;

  private publishHudStatusTexts(entries: HudStatusText[]): void {
    if (!this.devMode) return;
    (window as any).__GAME_STATUS_TEXTS__ = entries;
    (window as any).__GAME_STATUS_TEXT_MAP__ = Object.fromEntries(entries.map((e) => [e.id, e.text]));
  }

  constructor() {
    super("GameScene");
  }

  init(data: GameSceneData): void {
    this.myIndex = data.myIndex ?? 0;
    this.view    = data.initialPayload.view;
    this.turnPhase = data.initialPayload.turnPhase;
    this.previousTurnPhase = -1 as any; // Initialize to impossible value to trigger animation on first sync
    this.devMode = data.devMode ?? false;
    this.mockEffectMode = this.devMode && !!data.mockEffectType;
    this.injectedEffect = data.initialPayload.view.pendingEffect ?? null;
  }

  create(): void {
    const socket = getSocket();

    this.handGroup = this.add.group();
    this.boardGroup = this.add.group();
    this.hudGroup = this.add.group();
    this.focusPanelGroup = this.add.group();

    this.showDefaultFocusCard();
    this.renderAll();
    this.maybePlayInitialPhaseIntro();

    if (this.mockEffectMode && this.injectedEffect && this.turnPhase === TurnPhase.Action) {
      // In effect-test mode, mimic entering EffectResolution from ACTION.
      this.time.delayedCall(120, () => {
        this.view.pendingEffect = this.injectedEffect;
        this.turnPhase = TurnPhase.EffectResolution;
        this.renderAll();
      });
    }

    socket.on("state_sync", ({ view, turnPhase }) => {
      if (this.mockEffectMode) {
        return;
      }
      this.clearPhaseIntroTimers();
      this.view = view;
      const phaseChanged = this.turnPhase !== turnPhase;
      this.previousTurnPhase = this.turnPhase;
      this.turnPhase = turnPhase;
      this.selectedCard = null;
      this.faceDownMode = false;
      this.effectBoardTargetId = null;
      this.effectHandTargetId = null;
      this.controlReorderWhose = null;
      this.controlReorderPicks = [];
      if (!this.view.opponentHandRevealed?.some((card) => card.instanceId === this.pinnedRevealCardId)) {
        this.pinnedRevealCardId = null;
      }
      
      if (phaseChanged) {
        this.animatePhaseTransition();
      } else {
        this.renderAll();
      }
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clearPhaseIntroTimers());

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
    const padL   = 20;    // left padding before the first column centre (shift board west)
    const pitch  = 330;   // horizontal distance between column centres
    const lineToFocusGutter = 120; // reserved lane between lines and focus area (control token gutter)
    const padR   = 20;    // right padding

    // ── Derived vertical positions ──────────────────────────────────────────
    const oppCy  = hudH  + zoneH  / 2;
    const midY   = oppCy + zoneH  / 2 + gap + stripH / 2;
    const ownCy  = midY  + stripH / 2 + gap + zoneH  / 2;

    // ── Horizontal positions ────────────────────────────────────────────────
    const col0   = padL + zoneW / 2;
    const lineCx: [number, number, number] = [col0, col0 + pitch, col0 + pitch * 2];

    // Focus panel — offset right to leave a gutter between lines and zoom/focus panel
    const focusPanelW = 240;
    const focusPanelCx = lineCx[2] + zoneW / 2 + lineToFocusGutter + focusPanelW / 2;

    // Pile sits immediately right of the focus panel with minimal gap
    const pileCx = focusPanelCx + focusPanelW / 2 + 10 + pileW / 2;

    // ── Hand strip ──────────────────────────────────────────────────────────
    const handY     = H - Math.round(CardSprite.HEIGHT / 2) - 10;

    // ── Controls (aligned in height with hand cards) ─────────────────────────
    const btnCx     = focusPanelCx;
    const resetY    = handY - 50;
    const faceDownY = handY + 10;
    // Hand is constrained to the board area left of the focus panel
    const handLeft  = 30;
    const handRight = focusPanelCx - focusPanelW / 2 - 20;

    return { W, H, zoneW, zoneH, pileW, stripH, hudH, lineCx, oppCy, ownCy, midY, pileCx, btnCx, resetY, faceDownY, handY, handLeft, handRight, focusPanelCx, focusPanelW };
  }

  private ensureTestIdOverlay(): void {
    if (this.testIdOverlay) {
      return;
    }

    const existing = document.getElementById('phaser-testid-overlay');
    if (existing instanceof HTMLElement) {
      this.testIdOverlay = existing;
    } else {
      const overlay = document.createElement('div');
      overlay.id = 'phaser-testid-overlay';
      overlay.dataset.testid = 'game-container';
      Object.assign(overlay.style, {
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
        zIndex: '9999',
        opacity: '0',
      });
      document.body.appendChild(overlay);
      this.testIdOverlay = overlay;
    }
  }

  private syncTestIdOverlay(): void {
    if (!this.devMode) return;
    this.ensureTestIdOverlay();
    if (!this.testIdOverlay) return;

    const canvas = this.sys.game.canvas;
    const canvasRect = canvas.getBoundingClientRect();

    const overlay = this.testIdOverlay;
    if (!overlay) return;

    overlay.innerHTML = '';

    this.children.list.forEach((go: any) => {
      const testid = typeof go.getData === 'function' ? go.getData('testid') : undefined;
      if (!testid) return;

      const el = document.createElement('div');
      el.dataset.testid = testid;
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      el.style.opacity = '0';

      // Mirror visible Phaser text into the hidden DOM test overlay so
      // Playwright text assertions read the same value shown on-screen.
      if (typeof go.text === 'string') {
        el.textContent = go.text;
      }

      if (typeof go.getBounds === 'function') {
        try {
          const bounds = go.getBounds();
          if (bounds) {
            const x = bounds.x + canvasRect.left;
            const y = bounds.y + canvasRect.top;
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            el.style.width = `${Math.max(bounds.width, 2)}px`;
            el.style.height = `${Math.max(bounds.height, 2)}px`;
          }
        } catch {
          // keep default fallback styling
        }
      }

      overlay.appendChild(el);
    });
  }

  private renderAll(): void {
    this.showDefaultFocusCard();
    this.handGroup.clear(true, true);
    this.boardGroup.clear(true, true);
    this.hudGroup.clear(true, true);
    this.renderBattleBackdrop();
    if (DEV_LAYOUT_ZONES) this.renderLayoutDebug();
    this.renderHUD();
    this.renderBoard();
    this.renderHand();
    this.syncTestIdOverlay();
  }

  private renderBattleBackdrop(): void {
    const L = this.computeLayout();
    const addBg = (go: Phaser.GameObjects.GameObject) => {
      this.boardGroup.add(go, true);
      (go as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(-50);
      return go;
    };

    addBg(this.add.rectangle(L.W / 2, L.H / 2, L.W, L.H, 0x11283d));
    addBg(this.add.circle(L.W * 0.18, L.H * 0.16, 240, 0x66e2ff, 0.12));
    addBg(this.add.circle(L.W * 0.84, L.H * 0.18, 220, 0x8c90ff, 0.1));
    addBg(this.add.circle(L.W * 0.5, L.H * 0.82, 280, 0xffdf7a, 0.05));
    addBg(this.add.rectangle(L.W / 2, L.midY, L.W - 36, 168, 0x1a3550, 0.22));
    addBg(this.add.rectangle(L.focusPanelCx, L.H / 2, L.focusPanelW + 18, L.H - 24, 0x132437, 0.48));
    addBg(this.add.rectangle(L.pileCx, L.H / 2, L.pileW + 12, L.H - 24, 0x15283d, 0.42));

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x8bd0ff, 0.08);
    for (let y = 40; y < L.H; y += 56) grid.lineBetween(24, y, L.W - 24, y);
    for (let x = 42; x < L.W; x += 84) grid.lineBetween(x, 24, x, L.H - 24);
    grid.lineStyle(2, 0x8df5df, 0.14);
    grid.lineBetween(L.lineCx[0] - 40, L.oppCy - 110, L.lineCx[1], L.midY - 20);
    grid.lineBetween(L.lineCx[2] + 40, L.oppCy - 110, L.lineCx[1], L.midY - 20);
    grid.lineBetween(L.lineCx[0] - 28, L.ownCy + 110, L.lineCx[1], L.midY + 20);
    grid.lineBetween(L.lineCx[2] + 28, L.ownCy + 110, L.lineCx[1], L.midY + 20);
    addBg(grid);
  }

  private renderHUD(): void {
    const L = this.computeLayout();
    const hudStatusTexts: HudStatusText[] = [];
    const noteStatus = (id: string, text: string) => {
      hudStatusTexts.push({ id, text });
    };
    const addHud = (go: Phaser.GameObjects.GameObject) => {
      this.hudGroup.add(go, true);
      (go as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(100);
      return go;
    };

    const toCssHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
    const shadeColor = (color: number, factor: number): number => {
      const r = Math.max(0, Math.min(255, Math.floor(((color >> 16) & 0xff) * factor)));
      const g = Math.max(0, Math.min(255, Math.floor(((color >> 8) & 0xff) * factor)));
      const b = Math.max(0, Math.min(255, Math.floor((color & 0xff) * factor)));
      return (r << 16) | (g << 8) | b;
    };
    const selectedProtoId = this.selectedCardProtocolId();
    const effectProtoId = this.view.pendingEffect
      ? `proto_${this.view.pendingEffect.cardDefId.split("_")[0]}`
      : null;
    const hudProtoId = effectProtoId ?? selectedProtoId ?? this.view.protocols[0]?.protocolId ?? null;
    const hudAccentNum = PROTOCOL_COLORS.get(hudProtoId ?? "") ?? 0x00ffcc;
    const hudAccentColor = toCssHex(hudAccentNum);
    const effectBodyNum = PROTOCOL_COLORS.get(effectProtoId ?? "") ?? hudAccentNum;
    const effectAccentNum = PROTOCOL_ACCENT_COLORS.get(effectProtoId ?? "")
      ?? PROTOCOL_ACCENT_COLORS.get(hudProtoId ?? "")
      ?? 0x00ffcc;
    const confirmFillNum = shadeColor(effectBodyNum, 0.78);
    const confirmHoverNum = shadeColor(effectBodyNum, 1.05);
    const confirmStrokeNum = effectAccentNum;
    const confirmTextColor = toCssHex(effectAccentNum);

    const myTurn = this.view.isActivePlayer;
    const isCompileChoice = this.view.isActivePlayer && this.turnPhase === TurnPhase.CompileChoice;
    const isEffectResolution = this.turnPhase === TurnPhase.EffectResolution;

    const effectStack = this.view.effectStack ?? [];
    if (effectStack.length > 0) {
      const stackX = 218;
      const stackTopY = 16;
      const rowH = 18;
      const maxRows = 5;
      const shown = effectStack.slice(0, maxRows);
      const panelH = 30 + shown.length * rowH + (effectStack.length > maxRows ? 16 : 0);

      addHud(this.add.rectangle(stackX, stackTopY + panelH / 2, 400, panelH, 0x0f2438, 0.92)
        .setStrokeStyle(1.5, 0x4f7ea6, 0.95)
        .setName("effect-stack-panel")
        .setData("testid", "effect-stack-panel"));
      addHud(this.add.text(stackX, stackTopY + 8, `EFFECT STACK (${effectStack.length})`, {
        fontSize: "12px", fontFamily: "monospace", fontStyle: "bold", color: "#d8ecff",
      }).setOrigin(0.5, 0)
        .setName("effect-stack-title")
        .setData("testid", "effect-stack-title"));

      shown.forEach((e, i) => {
        const y = stackTopY + 28 + i * rowH;
        const ownerTag = e.ownerIndex === this.myIndex ? "YOU" : "OPP";
        const lineText = `${i + 1}. [${ownerTag}] ${e.cardName} :: ${e.description}`;
        addHud(this.add.text(stackX - 192, y, lineText, {
          fontSize: "11px", fontFamily: "monospace", color: i === 0 ? "#f3fff6" : "#c2d8ea",
          fontStyle: i === 0 ? "bold" : "normal", wordWrap: { width: 382 },
        }).setOrigin(0, 0)
          .setName(`effect-stack-item-${i}`)
          .setData("testid", "effect-stack-item"));
      });

      if (effectStack.length > maxRows) {
        addHud(this.add.text(stackX, stackTopY + 28 + shown.length * rowH, `... +${effectStack.length - maxRows} more`, {
          fontSize: "10px", fontFamily: "monospace", color: "#8fb3cf",
        }).setOrigin(0.5, 0)
          .setName("effect-stack-more")
          .setData("testid", "effect-stack-more"));
      }

      noteStatus("effect-stack", shown.map((e, i) => `${i + 1}. ${e.cardName}: ${e.description}`).join(" | "));
    }

    const turnStates = ["START", "CONTROL", "COMPILE", "ACTION", "CACHE", "END"] as const;
    const activeState = this.activeTurnState();
    // Phase chips — vertical column in the right focus panel, north of the zoomed card
    const chipW = L.focusPanelW - 8;
    const chipH = 20;
    const chipX = L.focusPanelCx;
    const chipStartY = 12;
    const chipPitch = chipH + 4;   // 24px per step
    const turnPalette = myTurn
      ? {
          activeFill: 0x17352f,
          activeStroke: 0x4ce0b8,
          activeHover: 0x1f4a42,
          activeText: "#dcfff5",
        }
      : {
          activeFill: 0x31223d,
          activeStroke: 0xd08cff,
          activeHover: 0x402b4f,
          activeText: "#f3e4ff",
        };
    turnStates.forEach((state, i) => {
      const cy = chipStartY + i * chipPitch;
      const isActive = state === activeState;
      const chip = this.add.rectangle(chipX, cy, chipW, chipH, isActive ? turnPalette.activeFill : 0x0b1420)
        .setFillStyle(isActive ? turnPalette.activeFill : 0x173049)
        .setStrokeStyle(1.5, isActive ? turnPalette.activeStroke : 0x4a6d8c)
        .setInteractive({ useHandCursor: true })
        .setName(`phase-${state}`)
        .setData("testid", `phase-${state}`)
        .setData("phase", state)
        .setData("isActive", isActive)
        .setData("phaseActive", isActive ? "true" : "false");
      chip.on("pointerover", () => {
        chip.setFillStyle(isActive ? turnPalette.activeHover : 0x214261);
        this.showFocusTurnState(state);
      });
      chip.on("pointerout", () => {
        chip.setFillStyle(isActive ? turnPalette.activeFill : 0x173049);
        this.showFocusCard(null);
      });
      addHud(chip);
      const chipLabel = isActive ? `${myTurn ? "YOU" : "OPP"} · ${state}` : state;
      addHud(this.add.text(chipX, cy, chipLabel, {
        fontSize: "11px", fontFamily: "monospace", fontStyle: "bold",
          color: isActive ? turnPalette.activeText : "#b8d0e4",
      }).setOrigin(0.5)
        .setName(`phase-text-${state}`)
        .setData("testid", `phase-text-${state}`));

        // Compile-denied overlay: thick red diagonal slash
        if (state === "COMPILE" && this.view.compileDeniedThisTurn) {
          const slash = this.add.graphics();
          slash.lineStyle(4, 0xff1a1a, 1);
          slash.lineBetween(
            chipX - chipW / 2 + 4, cy - chipH / 2 + 2,
            chipX + chipW / 2 - 4, cy + chipH / 2 - 2
          );
          addHud(slash);
        }
    });

    // ── Effect resolution ─────────────────────────────────────────────────────
    if (isEffectResolution) {
      renderEffectResolutionHUD({
        scene: this,
        layout: {
          W: L.W,
          lineCx: L.lineCx,
          btnCx: L.btnCx,
          resetY: L.resetY,
          focusPanelW: L.focusPanelW,
        },
        view: this.view,
        myIndex: this.myIndex,
        hudAccentNum,
        hudAccentColor,
        confirmFillNum,
        confirmHoverNum,
        confirmStrokeNum,
        confirmTextColor,
        noteStatus,
        addHud,
        getEffectInputSpec: (effect) => this.getEffectInputSpec(effect),
        getBoardPickHint: (boardMode) => this.getBoardPickHint(boardMode),
        isBoardCardValidForEffect: (card, pi, idx, total, effect) => this.isBoardCardValidForEffect(card, pi, idx, total, effect),
        findOwnLineOfInstance: (instanceId) => this.findOwnLineOfInstance(instanceId),
        renderLinePicker: (scope, onPick, isLineAllowed) => this.renderLinePicker(L.lineCx, addHud, scope, onPick, isLineAllowed),
        complementaryProtoColor: (protoId) => this.complementaryProtoColor(protoId),
        renderAll: () => this.renderAll(),
        emitResolveEffect: (payload) => getSocket().emit("resolve_effect", payload),
        emitResolveControlReorder: (payload) => getSocket().emit("resolve_control_reorder", payload),
        state: {
          getEffectBoardTargetId: () => this.effectBoardTargetId,
          setEffectBoardTargetId: (value) => { this.effectBoardTargetId = value; },
          getEffectHandTargetId: () => this.effectHandTargetId,
          setEffectHandTargetId: (value) => { this.effectHandTargetId = value; },
          getControlReorderWhose: () => this.controlReorderWhose,
          setControlReorderWhose: (value) => { this.controlReorderWhose = value; },
          getControlReorderPicks: () => this.controlReorderPicks,
          setControlReorderPicks: (value) => { this.controlReorderPicks = value; },
        },
      });

      // Show control markers even during EffectResolution
      this.publishHudStatusTexts(hudStatusTexts);
      return;
    }

    // Bonus play banner
    if (this.view.pendingBonusPlay && myTurn) {
      const bonusText = this.view.pendingBonusPlay.anyLine
        ? "BONUS PLAY — play 1 card in any line"
        : "BONUS PLAY — play 1 more card";
      noteStatus("bonus-play-banner", bonusText);
      addHud(this.add.text(L.W / 2, 38, bonusText, {
          fontSize: "12px", fontFamily: "monospace", color: "#ffe066", fontStyle: "bold",
        }).setOrigin(0.5));
    }

    // Controls — below the own discard pile (positions from layout)
    if (isCompileChoice) {
      // Compile-choice UI: one button per compilable line (must compile, can't play)
      const compileText = "You MUST compile:";
      noteStatus("compile-choice-instruction", compileText);
      addHud(this.add.text(L.btnCx, L.resetY - 20, compileText, {
          fontSize: "11px", fontFamily: "monospace", color: "#ccaa00",
        }).setOrigin(0.5));
      this.view.compilableLines.forEach((li, i) => {
        const protoId = this.view.protocols[li]?.protocolId ?? "";
        const protoName = PROTOCOL_NAMES_CLIENT.get(protoId) ?? `Line ${li}`;
        const protoNameColor = this.complementaryProtoColor(protoId);
        const by = L.resetY + i * 36;
        const btn = this.add.rectangle(L.btnCx, by, 168, 32, 0x6b4d12)
          .setStrokeStyle(2, 0xffe28a)
          .setInteractive({ useHandCursor: true });
        btn.on("pointerover", () => btn.setFillStyle(0x86621a));
        btn.on("pointerout",  () => btn.setFillStyle(0x6b4d12));
        btn.on("pointerdown", () => this.onCompileClick(li));
        addHud(btn);
        addHud(this.add.text(L.btnCx, by, `COMPILE: ${protoName}`, {
          fontSize: "11px", fontFamily: "monospace", color: protoNameColor, fontStyle: "bold",
        }).setOrigin(0.5));
      });
    } else if (this.isMyTurn()) {
      // ── Face-Down toggle ──────────────────────────────────────────────────
      const isOn = this.faceDownMode;
      const toggleBg = this.add.rectangle(L.btnCx, L.faceDownY, 176, 42,
        isOn ? 0x166b6c : 0x335f8d)
        .setStrokeStyle(2.5, isOn ? 0x9effef : 0xbadfff)
        .setInteractive({ useHandCursor: true })
        .setName("toggle-face-down")
        .setData("testid", "toggle-face-down");
      toggleBg.on("pointerover", () => toggleBg.setFillStyle(isOn ? 0x218587 : 0x447ab5));
      toggleBg.on("pointerout",  () => toggleBg.setFillStyle(isOn ? 0x166b6c : 0x335f8d));
      toggleBg.on("pointerdown", () => {
        this.faceDownMode = !this.faceDownMode;
        this.renderAll();
      });
      addHud(toggleBg);
      addHud(this.add.text(L.btnCx, L.faceDownY,
        isOn ? "▼  FACE-DOWN  ON" : "▽  FACE-DOWN  OFF", {
          fontSize: "14px", fontFamily: "monospace", fontStyle: "bold",
          color: isOn ? "#f2fffd" : "#f3f9ff",
        }).setOrigin(0.5)
        .setName("toggle-face-down-text")
        .setData("testid", "toggle-face-down-text"));

      // ── Reset button ──────────────────────────────────────────────────────
      const canReset = this.view.hand.length < 5;
      const drawCount = 5 - this.view.hand.length;
      const resetLabel = canReset ? `⟳  RESET  (+${drawCount})` : "⟳  RESET  (full)";
      const refreshBg = this.add.rectangle(L.btnCx, L.resetY, 176, 42,
        canReset ? 0x2f78bf : 0x4b596d)
        .setStrokeStyle(2.5, canReset ? 0xe2f5ff : 0xaab8ca)
        .setName("reset-button")
        .setData("testid", "reset-button");
      if (canReset) {
        refreshBg.setInteractive({ useHandCursor: true });
        refreshBg.on("pointerover", () => refreshBg.setFillStyle(0x4093e6));
        refreshBg.on("pointerout",  () => refreshBg.setFillStyle(0x2f78bf));
        refreshBg.on("pointerdown", () => getSocket().emit("refresh"));
      }
      addHud(refreshBg);
      addHud(this.add.text(L.btnCx, L.resetY, resetLabel, {
        fontSize: "14px", fontFamily: "monospace", fontStyle: "bold",
        color: canReset ? "#ffffff" : "#edf3fb",
      }).setOrigin(0.5)
        .setName("reset-button-text")
        .setData("testid", "reset-button-text"));

      // Turn ownership is conveyed by the highlighted phase chip style; no extra turn label here.
    }
    if (this.view.opponentHandRevealed) {
      const oppHandText = `OPP HAND REVEALED · ${this.view.opponentHandRevealed.length} CARD${this.view.opponentHandRevealed.length === 1 ? "" : "S"}`;
      noteStatus("opponent-hand-status", oppHandText);
      this.renderOpponentHandRevealOverlay(addHud, noteStatus);
    } else if (this.view.opponentRevealedHandCard) {
      const rc = this.view.opponentRevealedHandCard;
      const rcName = CLIENT_CARD_DEFS.get(rc.defId)?.name ?? rc.defId;
      const oppRevealText = `OPP REVEALS: ${rcName} (val ${CLIENT_CARD_DEFS.get(rc.defId)?.value ?? "?"}) — see panel →`;
      noteStatus("opponent-reveal-status", oppRevealText);
      addHud(this.add.text(20, 50, oppRevealText, {
        fontSize: "10px", fontFamily: "monospace", color: "#ffaa44",
      }));
    }

    const phaseHint = this.getPhaseHintText(myTurn, isCompileChoice, isEffectResolution);
    if (phaseHint) {
      noteStatus("phase-hint", phaseHint);
      addHud(this.add.text(L.lineCx[1], 12, phaseHint, {
        fontSize: "14px", fontFamily: "monospace", color: "#bdd6eb", align: "center",
        wordWrap: { width: 760 },
      }).setOrigin(0.5)
        .setName("phase-hint")
        .setData("testid", "phase-hint"));
    }

    this.publishHudStatusTexts(hudStatusTexts);
  }

  private renderOpponentHandRevealOverlay(
    addHud: (go: Phaser.GameObjects.GameObject) => Phaser.GameObjects.GameObject,
    noteStatus: (id: string, text: string) => void,
  ): void {
    const revealed = this.view.opponentHandRevealed;
    if (!revealed) return;

    const panelX = 188;
    const panelY = 120;
    const panelW = 336;
    const panelH = 160;
    addHud(this.add.rectangle(panelX, panelY, panelW, panelH, 0x132133, 0.88)
      .setStrokeStyle(2, 0xe7a14a, 0.95));
    addHud(this.add.text(panelX, panelY - 60, "OPPONENT HAND REVEALED", {
      fontSize: "13px", fontFamily: "monospace", fontStyle: "bold", color: "#ffcf7a",
    }).setOrigin(0.5));
    addHud(this.add.text(panelX, panelY - 42, "Hover to preview, click to pin in zoom panel", {
      fontSize: "10px", fontFamily: "monospace", color: "#ffe1b2",
    }).setOrigin(0.5));

    if (revealed.length === 0) {
      addHud(this.add.text(panelX, panelY + 4, "(empty hand)", {
        fontSize: "12px", fontFamily: "monospace", color: "#d7a469",
      }).setOrigin(0.5));
      return;
    }

    const columns = Math.min(5, Math.max(1, revealed.length));
    const cardScale = 0.52;
    const cardPitchX = 54;
    const cardPitchY = 72;
    const startX = panelX - ((columns - 1) * cardPitchX) / 2;
    const startY = panelY - (revealed.length > columns ? 14 : 0);

    revealed.forEach((card, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const cardX = startX + col * cardPitchX;
      const cardY = startY + row * cardPitchY;
      const isPinned = this.pinnedRevealCardId === card.instanceId;

      if (isPinned) {
        addHud(this.add.rectangle(cardX, cardY, 56, 76, 0x000000, 0)
          .setStrokeStyle(2, 0xffd37a, 1)
          .setName(`revealed-hand-card-pin-${index}`)
          .setData("testid", "revealed-hand-card-pin"));
      }

      const sprite = new CardSprite(this, cardX, cardY, card, CLIENT_CARD_DEFS, false, cardScale)
        .setName(`revealed-hand-card-${index}`)
        .setData("testid", "revealed-hand-card")
        .setData("cardIndex", index)
        .setData("instanceId", card.instanceId)
        .setData("isPinned", isPinned ? "true" : "false");
      sprite.makeInteractive(() => {
        this.pinnedRevealCardId = this.pinnedRevealCardId === card.instanceId ? null : card.instanceId;
        this.renderAll();
      });
      sprite.addFocusHover((hovered) => {
        if (hovered) {
          this.showFocusCard(card);
        } else {
          this.showDefaultFocusCard();
        }
      });
      addHud(sprite);
    });

    const pinnedCard = this.getPinnedRevealCard();
    if (pinnedCard) {
      noteStatus("opponent-hand-focus", `Pinned reveal: ${CLIENT_CARD_DEFS.get(pinnedCard.defId)?.name ?? pinnedCard.defId}`);
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
        // Both CardInstance and HiddenCard have instanceId — use it directly.
        const instanceId = (card as { instanceId: string }).instanceId;
        if (effectSpec!.needsLine) {
          this.effectBoardTargetId = instanceId;
          this.renderAll();
        } else {
          getSocket().emit("resolve_effect", {
            id: pendingEffectId!,
            targetInstanceId: instanceId,
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
        const matchesEitherProtocol = matchesEitherLineProtocol(selectedProtocol, myProtoId, oppProtoId);
        ownValidity = (this.faceDownMode || this.view.pendingBonusPlay?.anyLine)
          ? "valid"
          : matchesEitherProtocol ? "valid" : "wrong_protocol";
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
      const myProtoAccent = PROTOCOL_ACCENT_COLORS.get(myProtoId) ?? 0x4488cc;
      const oppProtoAccent = PROTOCOL_ACCENT_COLORS.get(oppProtoId) ?? 0x4488cc;
      const myProtoTitleColor = this.protocolTitleColor(myProtoAccent);
      const oppProtoTitleColor = this.protocolTitleColor(oppProtoAccent);

      // Strip background
      this.boardGroup.add(
        this.add.rectangle(rx, midY, zoneW, L.stripH, 0x13273d)
          .setStrokeStyle(1, 0x40607d),
        true
      );

      // Left/right thirds carry protocol colours; middle third stays neutral for score.
      const thirdW = zoneW / 3;
      const leftCx = rx - zoneW / 2 + thirdW / 2;
      const rightCx = rx + zoneW / 2 - thirdW / 2;
      const protoBlockW = thirdW - 6;
      const protoBlockH = L.stripH - 6;
      const protoRadius = 6;
      
      const createRoundedProtoBlock = (
        blockCx: number,
        fillColor: number,
        borderColor: number,
      ) => {
        const g = this.add.graphics();
        g.fillStyle(fillColor, 0.9);
        g.lineStyle(3, borderColor, 1);
        g.fillRoundedRect(blockCx - protoBlockW / 2, midY - protoBlockH / 2, protoBlockW, protoBlockH, protoRadius);
        g.strokeRoundedRect(blockCx - protoBlockW / 2, midY - protoBlockH / 2, protoBlockW, protoBlockH, protoRadius);
        g.setAlpha(0.9);

        const hit = this.add.rectangle(blockCx, midY, protoBlockW, protoBlockH, 0x000000, 0)
          .setInteractive({ useHandCursor: true });
        hit.on("pointerover", () => { g.setAlpha(1); this.showFocusProtocol(li); });
        hit.on("pointerout", () => { g.setAlpha(0.9); this.showFocusCard(null); });

        this.boardGroup.add(g, true);
        this.boardGroup.add(hit, true);
      };

      // Own protocol block (left third) — full rectangle is interactive
      createRoundedProtoBlock(leftCx, myProtoColor, myProtoAccent);
      this.boardGroup.add(
        this.add.text(leftCx, midY, (myCom ? "\u2713 " : "") + myName, {
          fontSize: "11px", fontFamily: "monospace", fontStyle: "bold",
          color: myProtoTitleColor,
          stroke: "#000000",
          strokeThickness: 2,
          shadow: { offsetX: 1, offsetY: 1, color: "#000000", blur: 0, stroke: false, fill: true },
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
      createRoundedProtoBlock(rightCx, oppProtoColor, oppProtoAccent);
      this.boardGroup.add(
        this.add.text(rightCx, midY, (oppCom ? "\u2713 " : "") + oppName, {
          fontSize: "11px", fontFamily: "monospace", fontStyle: "bold",
          color: oppProtoTitleColor,
          stroke: "#000000",
          strokeThickness: 2,
          shadow: { offsetX: 1, offsetY: 1, color: "#000000", blur: 0, stroke: false, fill: true },
          wordWrap: { width: thirdW - 8 },
          align: "center",
        }).setOrigin(0.5, 0.5),
        true
      );
    }

    // ── Discard / draw pile column ──────────────────────────────────────────
    this.renderPile(this.view.opponentTrash, this.view.opponentDeckSize, L.pileCx, oppCy, L.pileW, zoneH, "OPP DISCARD", "#cc7744", this.view.opponentHandSize);
    this.renderPile(this.view.trash, this.view.deckSize, L.pileCx, ownCy, L.pileW, zoneH, "MY DISCARD", "#5599cc", undefined);

    // ── Control token (between pile boxes) ─────────────────────────────────
    const iHave = this.view.hasControl;
    const oppHas = this.view.opponentHasControl;
    const tokenActive = iHave || oppHas;
    const tokenSize = 56;
    const tokenMargin = 8;
    // Token sits in the dedicated gutter between line columns and focus panel.
    const gutterLeft = L.lineCx[2] + zoneW / 2;
    const gutterRight = L.focusPanelCx - L.focusPanelW / 2;
    const gutterTokenX = Math.round((gutterLeft + gutterRight) / 2);
    const neutralTokenY = (oppCy + ownCy) / 2;
    // Controlled positions: token moves away from mid toward the owning player's zone.
    const oppControlledY = oppCy - zoneH / 2 + tokenSize / 2 + tokenMargin;
    const myControlledY = ownCy + zoneH / 2 - tokenSize / 2 - tokenMargin;
    const tokenX = gutterTokenX;
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
    handSize?: number
  ): void {
    const topY = cy - pileH / 2;
    const leftX = cx - pileW / 2 + 44;
    const stackCx = cx + 32;

    // Background panel
    const isMine = label.includes("MY");
    this.boardGroup.add(
      this.add.rectangle(cx, cy, pileW, pileH, 0x13253a)
        .setStrokeStyle(1.5, 0x426887)
        .setName(isMine ? "draw-pile" : "opponent-draw-pile")
        .setData("testid", isMine ? "draw-pile" : "opponent-draw-pile"), true);
    // Label
    this.boardGroup.add(
      this.add.text(cx, topY + 6, label, {
        fontSize: "9px", fontFamily: "monospace", color: labelColor, fontStyle: "bold",
      }).setOrigin(0.5, 0)
        .setName(isMine ? "draw-pile-label-text" : "opponent-draw-pile-label-text")
        .setData("testid", isMine ? "draw-pile-label-text" : "opponent-draw-pile-label-text"), true);
    // Hand size (opponent pile only)
    if (handSize !== undefined) {
      this.boardGroup.add(
        this.add.text(cx, topY + 18, `hand: ${handSize}`, {
          fontSize: "11px", fontFamily: "monospace", color: "#cc8855", fontStyle: "bold",
        }).setOrigin(0.5, 0)
          .setName("opponent-hand-size")
          .setData("testid", "opponent-hand-size")
          .setData("handSize", handSize), true);
    }

    // Divider between left draw-count lane and right discard stack lane
    this.boardGroup.add(
      this.add.rectangle(cx - 18, cy, 1, pileH - 12, 0x426887), true);

    // Draw deck (left lane): compact face-down stack with a shallow vertical buildup.
    const deckScale = 0.42;
    const deckStepPx = 4;
    const visibleDeckCards = Math.min(deckSize, 10);
    const deckTopCardCy = cy + (isMine ? -8 : 12);
    for (let i = 0; i < visibleDeckCards; i++) {
      const hiddenCard: CardView = {
        instanceId: `${isMine ? "my" : "opp"}-deck-${i}`,
        hidden: true,
      };
      const isCovered = i < visibleDeckCards - 1;
      const cardCy = deckTopCardCy - (visibleDeckCards - 1 - i) * deckStepPx;
      const sprite = new CardSprite(this, leftX, cardCy, hiddenCard, CLIENT_CARD_DEFS, isCovered, deckScale);
      this.boardGroup.add(sprite, true);
    }

    const deckHalfH = (CardSprite.HEIGHT * deckScale) / 2;
    const deckTop = deckTopCardCy - (visibleDeckCards - 1) * deckStepPx - deckHalfH;
    const deckBottom = deckTopCardCy + deckHalfH;
    const drawCountY = isMine ? deckBottom + 12 : deckTop - 12;
    this.boardGroup.add(
      this.add.text(leftX, drawCountY, String(deckSize), {
        fontSize: "34px", fontFamily: "monospace", color: "#64b6ff", fontStyle: "bold",
      }).setOrigin(0.5, isMine ? 0 : 1)
        .setName(isMine ? "draw-pile-count" : "opponent-draw-pile-count")
        .setData("testid", isMine ? "draw-pile-count" : "opponent-draw-pile-count")
        .setData("deckSize", deckSize), true);

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
        const sprite    = new CardSprite(this, stackCx, cardCy, card, CLIENT_CARD_DEFS, isCovered, cardScale);
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
      validity === "valid" ? 0x1d4a46 : compiled ? 0x16382f : 0x13263c)
      .setStrokeStyle(borderWidth, borderColor)
      .setName(isOwn ? `own-line-${li}` : `opponent-line-${li}`)
      .setData("testid", isOwn ? "own-line" : "opponent-line")
      .setData("line", li)
      .setData("isOwn", isOwn);

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
      const sprite    = new CardSprite(this, cx, cardCy, card, CLIENT_CARD_DEFS, isCovered, cardScale)
        .setName("board-card")
        .setData("testid", "board-card")
        .setData("line", li)
        .setData("position", i)
        .setData("isOwn", isOwn);
      const isTarget = isCardEffectTarget && onCardClick && isCardEffectTarget(card, i, n);
      if (isTarget) {
        sprite.makeEffectTarget((c) => onCardClick!(c));
      }
      const canHoldReveal = isOwn && !("hidden" in card) && (card as CardInstance).face === CardFace.FaceDown;
      const revealCard: CardView = canHoldReveal
        ? { ...(card as CardInstance), face: CardFace.FaceUp }
        : card;
      let isHovered = false;
      let isHolding = false;
      const refreshFocus = () => {
        if (!isHovered) {
          this.showFocusCard(null);
          return;
        }
        this.showFocusCard(canHoldReveal && isHolding ? revealCard : card);
      };
      sprite.addFocusHover((c) => {
        isHovered = c !== null;
        refreshFocus();
      });
      if (canHoldReveal) {
        sprite.addPressHold((holding) => {
          isHolding = holding;
          refreshFocus();
        });
      }
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
      (effectType === "reveal_own_hand"
        || (effectType === "exchange_hand" && this.view.pendingEffect?.payload.awaitGive === true)
        || effectType === "give_to_draw");

    hand.forEach((card, i) => {
      const x = startX + i * spacing;
      const sprite = new CardSprite(this, x, L.handY, card, CLIENT_CARD_DEFS);
      sprite.setName("card-in-hand")
        .setData("testid", "card-in-hand")
        .setData("cardIndex", i)
        .setData("cardId", "instanceId" in card ? (card as CardInstance).instanceId : undefined);
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
      } else if (this.isMyTurn() || isSelected) {
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
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  /** Returns CSS hex for the complementary colour of a protocol id. */
  private complementaryProtoColor(protoId: string): string {
    // Choose dark or light text based on accent luminance (WCAG perceived brightness)
    const accent = PROTOCOL_ACCENT_COLORS.get(protoId) ?? 0x4488cc;
    const r = (accent >> 16) & 0xff;
    const g = (accent >> 8)  & 0xff;
    const b =  accent        & 0xff;
    const lum = (r * 299 + g * 587 + b * 114) / 1000;
    return lum > 130 ? "#111111" : "#ffffff";
  }

  private protocolTitleColor(accent: number): string {
    const r = ((accent >> 16) & 0xff) / 255;
    const g = ((accent >> 8) & 0xff) / 255;
    const b = (accent & 0xff) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (delta !== 0) {
      s = delta / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h *= 60;
      if (h < 0) h += 360;
    }

    const oppositeHue = (h + 180) % 360;
    const sat = Math.max(0.35, s);
    const light = l < 0.45 ? 0.78 : 0.24;
    const chroma = (1 - Math.abs(2 * light - 1)) * sat;
    const x = chroma * (1 - Math.abs(((oppositeHue / 60) % 2) - 1));
    const m = light - chroma / 2;

    let rr = 0;
    let gg = 0;
    let bb = 0;
    if (oppositeHue < 60) [rr, gg, bb] = [chroma, x, 0];
    else if (oppositeHue < 120) [rr, gg, bb] = [x, chroma, 0];
    else if (oppositeHue < 180) [rr, gg, bb] = [0, chroma, x];
    else if (oppositeHue < 240) [rr, gg, bb] = [0, x, chroma];
    else if (oppositeHue < 300) [rr, gg, bb] = [x, 0, chroma];
    else [rr, gg, bb] = [chroma, 0, x];

    const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
    return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
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
    lineScope: "own" | "opponent" | "any" | "both" | "encoded" | null;
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
            : { boardMode: null, handPick: false, needsLine: true, lineScope: "any", isOptional: optional ?? false, isAutoExecute: false };
        if (!targets)
          return { boardMode: "own_any", handPick: false, needsLine: true, lineScope: "own", isOptional: false, isAutoExecute: false };
        if (targets === "any_facedown")
          return toSourceLine
            ? { boardMode: "any_facedown", handPick: false, needsLine: false, lineScope: null, isOptional: false, isAutoExecute: false }
            : { boardMode: "any_facedown", handPick: false, needsLine: true, lineScope: "any", isOptional: false, isAutoExecute: false };
        if (targets === "any_uncovered")
          return { boardMode: "any_uncovered", handPick: false, needsLine: true, lineScope: "any", isOptional: false, isAutoExecute: false };
        if (targets === "covered_facedown")
          return { boardMode: "covered_facedown", handPick: false, needsLine: true, lineScope: "any", isOptional: optional ?? false, isAutoExecute: false };
        if (targets === "opponent_covered")
          return { boardMode: "opponent_covered", handPick: false, needsLine: true, lineScope: "opponent", isOptional: false, isAutoExecute: false };
        if (targets === "opponent_any")
          return { boardMode: "opponent_any", handPick: false, needsLine: true, lineScope: "opponent", isOptional: false, isAutoExecute: false };
        if (targets === "opponent_facedown")
          return { boardMode: "opponent_facedown", handPick: false, needsLine: true, lineScope: "opponent", isOptional: false, isAutoExecute: false };
        if (targets === "own_others")
          return { boardMode: "own_others", handPick: false, needsLine: true, lineScope: "own", isOptional: false, isAutoExecute: false };
        if (targets === "any_other")
          return { boardMode: "any_other", handPick: false, needsLine: true, lineScope: "any", isOptional: optional ?? false, isAutoExecute: false };
        if (targets === "own_covered")
          return { boardMode: "own_covered", handPick: false, needsLine: true, lineScope: "own", isOptional: optional ?? false, isAutoExecute: false };
        if (targets === "self_if_covered")
          return { boardMode: null, handPick: false, needsLine: true, lineScope: "own", isOptional: true, isAutoExecute: false };
        if (targets === "opponent_in_source_line")
          return { boardMode: "opponent_in_source_line", handPick: false, needsLine: true, lineScope: "opponent", isOptional: false, isAutoExecute: false };
        return auto;
      }
      case "shift_flip_self":
        return { boardMode: "own_any", handPick: false, needsLine: true, lineScope: "own", isOptional: true, isAutoExecute: false };
      case "flip":
      case "flip_draw_equal": {
        if (type === "flip" && targets === "all_other_faceup") return auto;
        if (type === "flip" && targets === "self") {
          if (optional ?? false) {
            return { boardMode: "self_source", handPick: false, needsLine: false, lineScope: null, isOptional: true, isAutoExecute: false };
          }
          return auto;
        }
        const boardMode =
          targets === "own_any"            ? "own_any"           :
          targets === "any_covered"        ? "any_covered"       :
          targets === "any_faceup_covered" ? "any_faceup_covered":
          targets === "any_facedown"       ? "any_facedown"      :
          targets === "any_faceup_uncovered" ? "any_faceup_uncovered" :
          targets === "opponent_in_last_target_line" ? "opponent_in_last_target_line" :
          targets === "any_uncovered"      ? "any_uncovered"     :
          targets === "opponent_any"       ? "opponent_any"      :
          targets === "any_other"          ? "any_other"         :
          targets === "own_covered_in_line"? "own_covered_in_line" :
                                             "any_card";
        return { boardMode, handPick: false, needsLine: false, lineScope: null, isOptional: optional ?? false, isAutoExecute: false };
      }
      case "delete": {
        if (targets === "each_other_line") return auto;
        if (targets === "line_values_1_2" || targets === "line_8plus_cards")
          return { boardMode: null, handPick: false, needsLine: true, lineScope: "both", isOptional: false, isAutoExecute: false };
        const boardMode =
          targets === "any_facedown" ? "any_facedown" :
          targets === "opponent_facedown" ? "opponent_facedown" :
          targets === "value_0_or_1" ? "value_0_or_1" :
                                       "any_card";
        return { boardMode, handPick: false, needsLine: false, lineScope: null, isOptional: false, isAutoExecute: false };
      }
      case "return":
        if (targets === "line_value_2") {
          return { boardMode: null, handPick: false, needsLine: true, lineScope: "both", isOptional: false, isAutoExecute: false };
        }
        return { boardMode: targets === "opponent_any" ? "opponent_any" : targets === "own_any" ? "own_any" : "any_card", handPick: false, needsLine: false, lineScope: null, isOptional: false, isAutoExecute: false };
      case "reveal_own_hand":
        return { boardMode: null, handPick: true, needsLine: false, lineScope: null, isOptional: false, isAutoExecute: false };
      case "exchange_hand":
        return payload.awaitGive === true
          ? { boardMode: null, handPick: true, needsLine: false, lineScope: null, isOptional: false, isAutoExecute: false }
          : auto;
      case "give_to_draw":
        return { boardMode: null, handPick: true, needsLine: false, lineScope: null, isOptional: true, isAutoExecute: false };
      case "discard_or_delete_self":
        return { boardMode: null, handPick: true, needsLine: false, lineScope: null, isOptional: true, isAutoExecute: false };
      case "discard_then_opponent_discard":
        return { boardMode: null, handPick: true, needsLine: false, lineScope: null, isOptional: true, isAutoExecute: false };
      case "take_opponent_facedown_to_hand":
        return { boardMode: "opponent_facedown_any", handPick: false, needsLine: false, lineScope: null, isOptional: false, isAutoExecute: false };
      case "swap_protocols":
      case "rearrange_protocols":
        return { boardMode: null, handPick: false, needsLine: false, lineScope: null, isOptional: false, isAutoExecute: false };
      case "trash_to_other_line_facedown":
        return { boardMode: null, handPick: false, needsLine: true, lineScope: "own", isOptional: false, isAutoExecute: false };
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
    const maxValueSource = effect.payload.maxValueSource as string | undefined;
    const valueComparison = (effect.payload.valueComparison as string | undefined) ?? "lt";

    const meetsValueConstraint = (): boolean => {
      if (maxValueSource !== "distinct_protocols_in_field") return true;
      const threshold = new Set([
        ...this.view.lines.flatMap((line) => line.cards),
        ...this.view.opponentLines.flatMap((line) => line.cards),
      ].filter((boardCard): boardCard is CardInstance => !("hidden" in boardCard))
        .map((boardCard) => boardCard.defId.split("_")[0]))
        .size;
      const value = this.getBoardCardNumericValue(card);
      return valueComparison === "lte" ? value <= threshold : value < threshold;
    };

    // Hidden (opponent face-down) cards: selectable for modes that allow face-down or any opponent
    if ("hidden" in card) {
      if (!isOpp) return false;
      return (spec.boardMode === "any_card" || spec.boardMode === "any_other" ||
              spec.boardMode === "any_facedown" ||
              spec.boardMode === "opponent_any" || spec.boardMode === "opponent_facedown" ||
              spec.boardMode === "opponent_covered" || spec.boardMode === "opponent_in_source_line" ||
              spec.boardMode === "opponent_facedown_any") &&
        (spec.boardMode === "opponent_covered" ? !isTopCard :
         spec.boardMode === "opponent_facedown_any" ? true : isTopCard);
    }

    const c   = card as CardInstance;
    const def = CLIENT_CARD_DEFS.get(c.defId);

    switch (spec.boardMode) {
      case "any_card":           return isTopCard;
      case "any_other":          return isTopCard && c.instanceId !== effect.sourceInstanceId;
      case "any_covered":        return !isTopCard;
      case "any_faceup_covered": return c.face === CardFace.FaceUp && !isTopCard;
      case "any_facedown":       return c.face === CardFace.FaceDown && isTopCard;
      case "any_faceup_uncovered": return c.face === CardFace.FaceUp && isTopCard && meetsValueConstraint();
      case "covered_facedown":   return c.face === CardFace.FaceDown && !isTopCard;
      case "any_uncovered":      return isTopCard && meetsValueConstraint();
      case "opponent_any":       return isOpp && isTopCard;
      case "opponent_covered":   return isOpp && !isTopCard;
      case "opponent_facedown":  return isOpp && c.face === CardFace.FaceDown && isTopCard;
      case "own_any":            return isMine && isTopCard;
      case "own_covered":        return isMine && !isTopCard;
      case "own_others":         return isMine && c.instanceId !== effect.sourceInstanceId && isTopCard;
      case "self_source":        return c.instanceId === effect.sourceInstanceId;
      case "own_covered_in_line":return isMine && !isTopCard;
      case "opponent_in_source_line": {
        if (!isOpp || !isTopCard) return false;
        if (!effect.sourceInstanceId) return true;
        // Find which line the source card is in (own lines)
        const srcLi = this.view.lines.findIndex((l) =>
          l.cards.some((bc) => "instanceId" in bc && (bc as any).instanceId === effect.sourceInstanceId)
        );
        if (srcLi === -1) return true;
        // find which line this opponent card is in
        const oppLi = this.view.opponentLines.findIndex((l) =>
          l.cards.some((bc) => "instanceId" in bc
            ? (bc as any).instanceId === c.instanceId
            : false)
        );
        return oppLi === srcLi;
      }
      case "opponent_in_last_target_line": {
        if (!isOpp || !isTopCard) return false;
        const lastTargetId = this.view.lastTargetedInstanceId;
        if (!lastTargetId) return false;
        const ownLi = this.view.lines.findIndex((l) =>
          l.cards.some((bc) => "instanceId" in bc && (bc as CardInstance).instanceId === lastTargetId)
        );
        if (ownLi === -1) return false;
        const oppLi = this.view.opponentLines.findIndex((l) =>
          l.cards.some((bc) => "instanceId" in bc && (bc as CardInstance).instanceId === c.instanceId)
        );
        return oppLi === ownLi;
      }
      case "opponent_facedown_any":  return isOpp && c.face === CardFace.FaceDown;
      case "value_0_or_1": {
        if (!isTopCard) return false;
        const val = c.face === CardFace.FaceDown ? 2 : (def?.value ?? 0);
        return val <= 1;
      }
      default: return true;
    }
  }

  private getBoardPickHint(boardMode: string): string {
    switch (boardMode) {
      case "any_card":            return "Click any card on the board \u2193";
      case "any_other":           return "Click any other card on the board \u2193";
      case "any_covered":         return "Click a covered card on the board \u2193";
      case "any_faceup_covered":  return "Click a face-up covered card on the board \u2193";
      case "any_facedown":        return "Click a face-down card on the board \u2193";
      case "any_faceup_uncovered": return "Click a face-up uncovered card on the board \u2193";
      case "covered_facedown":    return "Click a covered face-down card on the board \u2193";
      case "any_uncovered":       return "Click any uncovered (top) card on the board \u2193";
      case "opponent_any":        return "Click any of your opponent\u2019s cards \u2193";
      case "opponent_covered":    return "Click a covered card in your opponent\u2019s lines \u2193";
      case "opponent_facedown":   return "Click a face-down card in your opponent\u2019s lines \u2193";
      case "own_any":             return "Click any of your own cards on the board \u2193";
      case "own_covered":         return "Click one of your covered cards on the board \u2193";
      case "own_others":          return "Click one of your other cards on the board \u2193";
      case "self_source":         return "Click this card to flip it (or skip) \u2193";
      case "own_covered_in_line": return "Click a covered card in this line \u2193";
      case "opponent_in_source_line": return "Click one of your opponent\u2019s cards in this line \u2193";
      case "opponent_in_last_target_line": return "Click one of your opponent\u2019s cards in the same line as the last card you flipped \u2193";
      case "opponent_facedown_any":  return "Click one of your opponent\u2019s face-down cards \u2193";
      case "value_0_or_1":        return "Click a card with value 0 or 1 \u2193";
      default:                    return "Click a card on the board \u2193";
    }
  }

  private getBoardCardNumericValue(card: CardView): number {
    if ("hidden" in card) return 2;
    if (card.face === CardFace.FaceDown) return 2;
    return CLIENT_CARD_DEFS.get(card.defId)?.value ?? 0;
  }

  private resolutionDisplayState(): "START" | "ACTION" | "CACHE" | "END" {
    const effect = this.view.pendingEffect ?? this.view.opponentPendingEffect;
    if (effect?.type === "discard" && effect.payload?.reason === "cache") {
      return "CACHE";
    }
    if (effect?.trigger === "start") {
      return "START";
    }
    if (effect?.trigger === "end") {
      return "END";
    }
    return "ACTION";
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
      case TurnPhase.EffectResolution:
        return this.resolutionDisplayState();
      case TurnPhase.Action:
        return "ACTION";
      case TurnPhase.ClearCache:
        return "CACHE";
      case TurnPhase.End:
      default:
        return "END";
    }
  }

  private getPhaseHintText(myTurn: boolean, isCompileChoice: boolean, isEffectResolution: boolean): string | null {
    if (isEffectResolution) {
      return null;
    }

    if (isCompileChoice) {
      return "Select a protocol to compile ↓";
    }

    switch (this.turnPhase) {
      case TurnPhase.Start:
        return myTurn
          ? "Nothing to do in START - moving to CONTROL shortly."
          : "Opponent START phase - no actions available.";
      case TurnPhase.CheckControl:
        return myTurn
          ? "Nothing to do in CONTROL - checking control automatically."
          : "Opponent CONTROL phase - checking control automatically.";
      case TurnPhase.CheckCompile:
        return myTurn
          ? "Nothing to do in COMPILE - checking compile options automatically."
          : "Opponent COMPILE phase - checking compile options automatically.";
      case TurnPhase.ClearCache:
        return this.view.hand.length > 5
          ? "CACHE phase - discarding down to five cards automatically."
          : "Nothing to do in CACHE - hand is already five cards or less.";
      case TurnPhase.End:
        return myTurn
          ? "Nothing to do in END - resolving end-of-turn effects."
          : "Opponent END phase - resolving end-of-turn effects.";
      case TurnPhase.Action:
        if (!myTurn) {
          return "Waiting for your opponent to act.";
        }
        if (this.view.pendingBonusPlay) {
          return this.view.pendingBonusPlay.anyLine
            ? "Bonus play: click a card, then any line ↓"
            : "Bonus play: click a card, then its protocol line ↓";
        }
        if (this.selectedCard === null) {
          return "Click a card in your hand to select it, or reset the hand.";
        }
        if (this.faceDownMode) {
          return "Face-down: click any of your line zones below ↓";
        }
        return "Face-up: click a GREEN line zone that matches the card's protocol ↓";
      default:
        return null;
    }
  }

  private animatePhaseTransition(): void {
    // Render to show the new phase state
    this.renderAll();

    // Schedule the phase highlight animation after render completes
    this.time.delayedCall(10, () => {
      const activeState = this.activeTurnState();
      this.pulsePhaseChip(activeState);
    });
  }

  private clearPhaseIntroTimers(): void {
    for (const timer of this.phaseIntroTimers) timer.remove(false);
    this.phaseIntroTimers = [];
  }

  private maybePlayInitialPhaseIntro(): void {
    // Server already owns turn-phase sequencing. Avoid client-side replay on first load.
    this.animatePhaseTransition();
  }

  private pulsePhaseChip(state: "START" | "CONTROL" | "COMPILE" | "ACTION" | "CACHE" | "END"): void {
    const turnStates = ["START", "CONTROL", "COMPILE", "ACTION", "CACHE", "END"] as const;
    const stateIndex = turnStates.indexOf(state);
    if (stateIndex === -1) return;

    const chipIndex = stateIndex * 2;
    const chip = this.hudGroup.getChildren()[chipIndex] as Phaser.GameObjects.Rectangle;
    if (!chip || !chip.setFillStyle) return;

    // Clean up any previous glow from a rapid phase transition
    if (this.phaseGlow) {
      this.tweens.killTweensOf(this.phaseGlow);
      this.phaseGlow.destroy();
      this.phaseGlow = null;
    }
    this.tweens.killTweensOf(chip);
    chip.setScale(1);

    // Glow ring: bright colour, transparent → visible → fades out smoothly
    const glow = this.add.rectangle(chip.x, chip.y, chip.width + 8, chip.height + 8, 0x4a9eff, 0)
      .setDepth(98);
    this.phaseGlow = glow;

    this.tweens.add({
      targets: glow,
      alpha: 0.65,
      duration: 200,
      ease: 'Sine.Out',
      yoyo: true,
      hold: 120,
      repeat: 1,
      onComplete: () => {
        if (this.phaseGlow === glow) this.phaseGlow = null;
        glow.destroy();
      },
    });

    // Chip breathe: scale gently expands then returns
    this.tweens.add({
      targets: chip,
      scaleX: 1.06,
      scaleY: 1.18,
      duration: 220,
      ease: 'Sine.Out',
      yoyo: true,
      hold: 80,
      onComplete: () => chip.setScale(1),
    });
  }
  // ── Focus card panel ──────────────────────────────────────────────────────

  private showFocusTurnState(state: "START" | "CONTROL" | "COMPILE" | "ACTION" | "CACHE" | "END"): void {
    this.focusPanelGroup.clear(true, true);
    const L = this.computeLayout();
    renderFocusTurnState(this, this.focusPanelGroup, L, state);
  }

  /**
   * Renders a large readable card in the right-side focus panel.
   * Pass null to show the empty placeholder. Called on every hover enter/leave
   * and at the start of each renderAll() to reset stale state.
   */
  private showFocusProtocol(lineIndex: number): void {
    this.focusPanelGroup.clear(true, true);
    const L = this.computeLayout();
    renderFocusProtocol(this, this.focusPanelGroup, L, this.view, lineIndex, (protoId) => this.complementaryProtoColor(protoId));
  }

  private showFocusControlToken(): void {
    this.focusPanelGroup.clear(true, true);
    const L = this.computeLayout();
    renderFocusControlToken(this, this.focusPanelGroup, L, this.view.hasControl, this.view.opponentHasControl);
  }

  private getPinnedRevealCard(): CardInstance | null {
    if (!this.pinnedRevealCardId || !this.view.opponentHandRevealed) return null;
    return this.view.opponentHandRevealed.find((card) => card.instanceId === this.pinnedRevealCardId) ?? null;
  }

  private showDefaultFocusCard(): void {
    const topDeckCard = this.view.ownRevealedTopDeckCard ?? null;
    this.showFocusCard(topDeckCard ?? this.getPinnedRevealCard());
  }

  private showFocusCard(card: CardView | null): void {
    this.focusPanelGroup.clear(true, true);
    const L = this.computeLayout();
    renderFocusCardPanel(this, this.focusPanelGroup, L, this.view, card);
  }

  private renderLinePicker(
    lineCx: [number, number, number],
    addHud: (go: Phaser.GameObjects.GameObject) => Phaser.GameObjects.GameObject,
    scope: "own" | "opponent" | "any" | "both" | "encoded",
    onPick: (lineIndex: number) => void,
    isLineAllowed?: (lineIndex: number) => boolean
  ): void {
    const linePickY = 590;
    const linePickW = 180;
    const linePickH = 38;
    const makeBtn = (cx: number, y: number, label: string, lineIdx: number, borderColor: number, textColor: string) => {
      const allowed = isLineAllowed ? isLineAllowed(lineIdx) : true;
      const btn = this.add.rectangle(cx, y, linePickW, linePickH, allowed ? 0x001a0a : 0x131313)
        .setStrokeStyle(2, borderColor)
        .setName(`line-pick-button-${lineIdx}`)
        .setData("testid", `line-pick-button-${lineIdx}`);
      if (allowed) {
        btn.setInteractive({ useHandCursor: true });
        btn.on("pointerover",  () => btn.setFillStyle(0x003320));
        btn.on("pointerout",   () => btn.setFillStyle(0x001a0a));
        btn.on("pointerdown",  () => onPick(lineIdx));
      } else {
        btn.setAlpha(0.5);
      }
      addHud(btn);
      addHud(this.add.text(cx, y, label, {
        fontSize: "10px", fontFamily: "monospace", color: allowed ? textColor : "#666666", fontStyle: "bold",
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
        makeBtn(lineCx[li], linePickY, ownName(li), li, 0x00ff88, ownColor(li));
    } else if (scope === "both") {
      // Full-lane pick: one button per line, labelled with both protocols
      for (let li = 0; li < 3; li++) {
        const label = `${ownName(li)} vs ${oppName(li)}`;
        makeBtn(lineCx[li], linePickY, label, li, 0xffcc44, "#ffffcc");
      }
    } else if (scope === "opponent") {
      for (let li = 0; li < 3; li++)
        makeBtn(lineCx[li], linePickY, oppName(li), li, 0xff8844, oppColor(li));
    } else if (scope === "encoded") {
      for (let li = 0; li < 3; li++)
        makeBtn(lineCx[li], linePickY - 24, `Own: ${ownName(li)}`, li, 0x00ff88, ownColor(li));
      for (let li = 0; li < 3; li++)
        makeBtn(lineCx[li], linePickY + 24, `Opp: ${oppName(li)}`, li + 3, 0xff8844, oppColor(li));
    }
  }

  private findOwnLineOfInstance(instanceId: string): number | null {
    for (let li = 0; li < 3; li++) {
      const line = this.view.lines[li];
      if (line.cards.some((c) => c.instanceId === instanceId)) return li;
    }
    return null;
  }
}
