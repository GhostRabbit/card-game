import Phaser from "phaser";
import { CardInstance, CardView, PendingEffect, PlayerView } from "@compile/shared";
import { CARD_DEFS_CLIENT, PROTOCOL_ACCENT_COLORS, PROTOCOL_NAMES_CLIENT } from "../../data/cardDefs";

export interface EffectResolutionLayout {
  W: number;
  lineCx: [number, number, number];
  btnCx: number;
  resetY: number;
  focusPanelW: number;
}

export type LinePickerScope = "own" | "opponent" | "any" | "both" | "encoded";

export interface EffectInputSpec {
  boardMode: string | null;
  handPick: boolean;
  needsLine: boolean;
  lineScope: LinePickerScope | null;
  isOptional: boolean;
  isAutoExecute: boolean;
}

interface EffectResolutionState {
  getEffectBoardTargetId(): string | null;
  setEffectBoardTargetId(value: string | null): void;
  getEffectHandTargetId(): string | null;
  setEffectHandTargetId(value: string | null): void;
  getControlReorderWhose(): "self" | "opponent" | null;
  setControlReorderWhose(value: "self" | "opponent" | null): void;
  getControlReorderPicks(): string[];
  setControlReorderPicks(value: string[]): void;
}

export interface EffectResolutionContext {
  scene: Phaser.Scene;
  layout: EffectResolutionLayout;
  view: PlayerView;
  myIndex: 0 | 1;
  hudAccentNum: number;
  hudAccentColor: string;
  confirmFillNum: number;
  confirmHoverNum: number;
  confirmStrokeNum: number;
  confirmTextColor: string;
  noteStatus(id: string, text: string): void;
  addHud(go: Phaser.GameObjects.GameObject): Phaser.GameObjects.GameObject;
  getEffectInputSpec(effect: PendingEffect): EffectInputSpec;
  getBoardPickHint(boardMode: string): string;
  isBoardCardValidForEffect(card: CardView, pi: 0 | 1, idx: number, total: number, effect: PendingEffect): boolean;
  findOwnLineOfInstance(instanceId: string): number | null;
  renderLinePicker(scope: LinePickerScope, onPick: (lineIndex: number) => void, isLineAllowed?: (lineIndex: number) => boolean): void;
  complementaryProtoColor(protoId: string): string;
  renderAll(): void;
  emitResolveEffect(payload: {
    id: string;
    targetInstanceId?: string;
    newProtocolOrder?: string[];
    swapProtocolIds?: string[];
    targetLineIndex?: number;
  }): void;
  emitResolveControlReorder(payload: { whose?: "self" | "opponent"; newProtocolOrder?: string[] }): void;
  state: EffectResolutionState;
}

const CLIENT_CARD_DEFS = CARD_DEFS_CLIENT;

function addHint(
  ctx: EffectResolutionContext,
  hint: string,
  color = "#e6f3ff",
): void {
  const { scene, layout: L, noteStatus, addHud } = ctx;
  noteStatus("effect-hint", hint);
  addHud(scene.add.text(L.btnCx, L.resetY - 50, hint, {
    fontSize: "13px", fontFamily: "monospace", fontStyle: "bold", color, align: "center",
    wordWrap: { width: L.focusPanelW - 14 },
  }).setOrigin(0.5)
    .setName("effect-hint")
    .setData("testid", "effect-hint"));
}

function addConfirmButton(
  ctx: EffectResolutionContext,
  description: string,
  onConfirm: () => void,
  testId = "confirm-effect-button",
): void {
  const { scene, layout: L, addHud } = ctx;
  const btn = scene.add.rectangle(L.btnCx, L.resetY, 200, 36, ctx.confirmFillNum)
    .setStrokeStyle(2, ctx.confirmStrokeNum)
    .setInteractive({ useHandCursor: true })
    .setName(testId)
    .setData("testid", testId);
  btn.on("pointerover", () => btn.setFillStyle(ctx.confirmHoverNum));
  btn.on("pointerout",  () => btn.setFillStyle(ctx.confirmFillNum));
  btn.on("pointerdown", onConfirm);
  addHud(btn);
  addHud(scene.add.text(L.btnCx, L.resetY, "▶  CONFIRM", {
    fontSize: "13px", fontFamily: "monospace", color: ctx.confirmTextColor, fontStyle: "bold",
  }).setOrigin(0.5));
}

function addSkipButton(ctx: EffectResolutionContext, onClick: () => void): void {
  const { scene, layout: L, addHud } = ctx;
  const skipBtn = scene.add.rectangle(L.btnCx, L.resetY, 200, 36, 0x0d2010)
    .setStrokeStyle(2, 0x558866)
    .setInteractive({ useHandCursor: true })
    .setName("skip-effect-button")
    .setData("testid", "skip-effect-button");
  skipBtn.on("pointerover", () => skipBtn.setFillStyle(0x1a3322));
  skipBtn.on("pointerout", () => skipBtn.setFillStyle(0x0d2010));
  skipBtn.on("pointerdown", onClick);
  addHud(skipBtn);
  addHud(scene.add.text(L.btnCx, L.resetY, "SKIP", {
    fontSize: "13px", fontFamily: "monospace", color: "#558866", fontStyle: "bold",
  }).setOrigin(0.5));
}

export function renderEffectResolutionHUD(ctx: EffectResolutionContext): void {
  const { scene, layout: L, view, myIndex, addHud, noteStatus } = ctx;
  const myEffect = view.pendingEffect;
  const oppEffect = view.opponentPendingEffect;

  if (myEffect) {
    const effectDescription = `${myEffect.cardName} ▸ ${myEffect.description}`;
    noteStatus("effect-description", effectDescription);
    // Effect action panel — under zoom card in the focus panel
    addHud(scene.add.rectangle(L.btnCx, L.resetY - 50, L.focusPanelW - 6, 148, 0x091929, 0.94)
      .setStrokeStyle(1.5, ctx.confirmStrokeNum, 0.5));
    addHud(scene.add.text(L.btnCx, L.resetY - 117, myEffect.cardName.toUpperCase(), {
      fontSize: "10px", fontFamily: "monospace", fontStyle: "bold", color: ctx.hudAccentColor,
    }).setOrigin(0.5));
    addHud(scene.add.text(L.btnCx, L.resetY - 104, myEffect.description, {
      fontSize: "11px", fontFamily: "monospace", color: "#dff4ff", align: "center",
      wordWrap: { width: L.focusPanelW - 18 },
    }).setOrigin(0.5, 0)
      .setName("effect-description")
      .setData("testid", "effect-description"));

    const spec = ctx.getEffectInputSpec(myEffect);

    if (myEffect.type === "discard") {
      if (view.hand.length === 0) {
        addHint(ctx, "(hand is empty — nothing to discard)", "#445566");
        addSkipButton(ctx, () => ctx.emitResolveEffect({ id: myEffect.id }));
      } else {
        addHint(ctx, "Click a card in your hand to discard it ↓");
      }
    } else if (myEffect.type === "discard_to_flip") {
      if (!ctx.state.getEffectHandTargetId()) {
        if (view.hand.length === 0) {
          addHint(ctx, "(hand is empty — skipping discard)", "#445566");
        } else {
          addHint(ctx, "Click a card in your hand to discard (you may skip) ↓");
        }
        addSkipButton(ctx, () => ctx.emitResolveEffect({ id: myEffect.id }));
      } else {
        const handTargetId = ctx.state.getEffectHandTargetId();
        const hc = view.hand.find(c => "instanceId" in c && (c as CardInstance).instanceId === handTargetId);
        const handCardName = hc && "defId" in hc ? (CLIENT_CARD_DEFS.get((hc as CardInstance).defId)?.name ?? "Card") : "Card";
        addHint(ctx, `Discarding ${handCardName} — click a board card to flip ↓`);
      }
    } else if (myEffect.type === "play_facedown") {
      if (!ctx.state.getEffectHandTargetId()) {
        addHint(ctx, "Click a card in your hand to play face-down ↓");
      } else {
        const handTargetId = ctx.state.getEffectHandTargetId();
        const hc = view.hand.find(c => "instanceId" in c && (c as CardInstance).instanceId === handTargetId);
        const handCardName = hc && "defId" in hc ? (CLIENT_CARD_DEFS.get((hc as CardInstance).defId)?.name ?? "Card") : "Card";
        addHint(ctx, `Playing ${handCardName} face-down — choose a line:`);
        const sourceLine = myEffect.sourceInstanceId ? ctx.findOwnLineOfInstance(myEffect.sourceInstanceId) : null;
        const isLineAllowed = sourceLine == null ? undefined : (li: number) => li !== sourceLine;
        ctx.renderLinePicker("own", (li) => {
          ctx.emitResolveEffect({ id: myEffect.id, targetInstanceId: handTargetId!, targetLineIndex: li });
          ctx.state.setEffectHandTargetId(null);
        }, isLineAllowed);
      }
    } else if (myEffect.type === "exchange_hand" && myEffect.payload.awaitGive !== true) {
      addHint(ctx, "Confirm to take 1 random card from your opponent's hand ↓");
      addConfirmButton(ctx, myEffect.description, () => ctx.emitResolveEffect({ id: myEffect.id }));
    } else if (spec.handPick) {
      const pickLabel = myEffect.type === "exchange_hand"
        ? "Choose 1 card from your hand to give to your opponent ↓"
        : myEffect.type === "give_to_draw"
          ? "Give 1 card to your opponent to draw 2 (or skip) ↓"
          : "Click a card in your hand to reveal ↓";
      addHint(ctx, pickLabel);
      if (spec.isOptional) {
        addSkipButton(ctx, () => ctx.emitResolveEffect({ id: myEffect.id }));
      }
    } else if (myEffect.type === "swap_protocols") {
      const protocols = view.protocols.slice().sort((a, b) => a.lineIndex - b.lineIndex);
      const picks = ctx.state.getControlReorderPicks();

      const hint = picks.length < 2
        ? `Click 2 protocols to swap their positions (${picks.length}/2):`
        : "Swap set — confirm to apply:";
      addHint(ctx, hint);

      protocols.forEach((proto, i) => {
        const protoName = PROTOCOL_NAMES_CLIENT.get(proto.protocolId) ?? proto.protocolId;
        const protoComp = ctx.complementaryProtoColor(proto.protocolId);
        const protoColor = PROTOCOL_ACCENT_COLORS.get(proto.protocolId) ?? 0x4488cc;
        const pickIdx = picks.indexOf(proto.protocolId);
        const isPicked = pickIdx !== -1;
        const chipX = L.lineCx[i];
        const chipY = 590;
        const chipBg = scene.add.rectangle(chipX, chipY, 180, 38,
          isPicked ? 0x111111 : protoColor)
          .setStrokeStyle(2, isPicked ? 0x333333 : 0xffffff)
          .setAlpha(isPicked ? 0.4 : 1);
        addHud(chipBg);
        const chipLabel = isPicked ? `↔ swap ${pickIdx + 1}` : protoName;
        addHud(scene.add.text(chipX, chipY, chipLabel, {
          fontSize: "13px", fontFamily: "monospace", color: isPicked ? "#444444" : protoComp, fontStyle: "bold",
        }).setOrigin(0.5));
        if (!isPicked && picks.length < 2) {
          chipBg.setInteractive({ useHandCursor: true });
          chipBg.on("pointerover", () => chipBg.setAlpha(0.7));
          chipBg.on("pointerout", () => chipBg.setAlpha(1));
          chipBg.on("pointerdown", () => {
            ctx.state.setControlReorderPicks([...ctx.state.getControlReorderPicks(), proto.protocolId]);
            ctx.renderAll();
          });
        }
      });

      if (picks.length > 0) {
        const resetBtn = scene.add.rectangle(L.btnCx, L.resetY + 44, 160, 32, 0x2a1800)
          .setStrokeStyle(2, 0x886600).setInteractive({ useHandCursor: true })
          .setName("swap-reset-button")
          .setData("testid", "swap-reset-button");
        resetBtn.on("pointerover", () => resetBtn.setAlpha(0.7));
        resetBtn.on("pointerout", () => resetBtn.setAlpha(1));
        resetBtn.on("pointerdown", () => {
          ctx.state.setControlReorderPicks([]);
          ctx.renderAll();
        });
        addHud(resetBtn);
        addHud(scene.add.text(L.btnCx, L.resetY + 44, "◀  RESET", {
          fontSize: "13px", fontFamily: "monospace", color: "#886600", fontStyle: "bold",
        }).setOrigin(0.5));
      }

      if (picks.length === 2) {
        addConfirmButton(ctx, myEffect.description, () => {
          ctx.emitResolveEffect({ id: myEffect.id, swapProtocolIds: [...picks] });
          ctx.state.setControlReorderPicks([]);
        });
      }
    } else if (myEffect.type === "rearrange_protocols") {
      const whose = myEffect.payload.whose as "self" | "opponent";
      const protocols = (whose === "self" ? view.protocols : view.opponentProtocols)
        .slice().sort((a, b) => a.lineIndex - b.lineIndex);
      const picks = ctx.state.getControlReorderPicks();

      const hint = picks.length < 3
        ? `Click protocols in desired Line 0 → 1 → 2 order (${picks.length}/3):`
        : "Order set — confirm to apply:";
      addHint(ctx, hint);

      protocols.forEach((proto, i) => {
        const protoName = PROTOCOL_NAMES_CLIENT.get(proto.protocolId) ?? proto.protocolId;
        const protoComp = ctx.complementaryProtoColor(proto.protocolId);
        const protoColor = PROTOCOL_ACCENT_COLORS.get(proto.protocolId) ?? 0x4488cc;
        const pickIdx = picks.indexOf(proto.protocolId);
        const isPicked = pickIdx !== -1;
        const chipX = L.lineCx[i];
        const chipY = 590;
        const chipBg = scene.add.rectangle(chipX, chipY, 180, 38,
          isPicked ? 0x111111 : protoColor)
          .setStrokeStyle(2, isPicked ? 0x333333 : 0xffffff)
          .setAlpha(isPicked ? 0.4 : 1)
          .setName(`rearrange-protocol-chip-${i}`)
          .setData("testid", `rearrange-protocol-chip-${i}`);
        addHud(chipBg);
        const chipLabel = isPicked ? `↳ slot ${pickIdx}` : protoName;
        addHud(scene.add.text(chipX, chipY, chipLabel, {
          fontSize: "13px", fontFamily: "monospace", color: isPicked ? "#444444" : protoComp, fontStyle: "bold",
        }).setOrigin(0.5)
          .setName(`rearrange-protocol-chip-text-${i}`)
          .setData("testid", `rearrange-protocol-chip-text-${i}`));
        if (!isPicked) {
          chipBg.setInteractive({ useHandCursor: true });
          chipBg.on("pointerover", () => chipBg.setAlpha(0.7));
          chipBg.on("pointerout", () => chipBg.setAlpha(1));
          chipBg.on("pointerdown", () => {
            ctx.state.setControlReorderPicks([...ctx.state.getControlReorderPicks(), proto.protocolId]);
            ctx.renderAll();
          });
        }
      });

      if (picks.length > 0) {
        const resetBtn = scene.add.rectangle(L.btnCx, L.resetY + 44, 160, 32, 0x2a1800)
          .setStrokeStyle(2, 0x886600).setInteractive({ useHandCursor: true })
          .setName("rearrange-reset-button")
          .setData("testid", "rearrange-reset-button");
        resetBtn.on("pointerover", () => resetBtn.setAlpha(0.7));
        resetBtn.on("pointerout", () => resetBtn.setAlpha(1));
        resetBtn.on("pointerdown", () => {
          ctx.state.setControlReorderPicks([]);
          ctx.renderAll();
        });
        addHud(resetBtn);
        addHud(scene.add.text(L.btnCx, L.resetY + 44, "◀  RESET", {
          fontSize: "13px", fontFamily: "monospace", color: "#886600", fontStyle: "bold",
        }).setOrigin(0.5));
      }

      if (picks.length === 3) {
        addConfirmButton(ctx, myEffect.description, () => {
          ctx.emitResolveEffect({ id: myEffect.id, newProtocolOrder: [...picks] });
          ctx.state.setControlReorderPicks([]);
        });
      }
    } else if (myEffect.type === "reveal_hand" && myEffect.payload.awaitRead === true) {
      // Player must confirm they have read the revealed opponent hand.
      addHint(ctx, "Review the hand above, then confirm ↑");
      addConfirmButton(ctx, "Confirmed — I've read it", () => ctx.emitResolveEffect({ id: myEffect.id }));
    } else if (myEffect.type === "reveal_top_deck" && myEffect.payload.awaitRead === true) {
      // Show the revealed top deck card in the zoom panel and offer keep / discard.
      const topCard = view.ownRevealedTopDeckCard;
      if (topCard) {
        const cardName = CLIENT_CARD_DEFS.get(topCard.defId)?.name ?? topCard.defId;
        const cardVal  = CLIENT_CARD_DEFS.get(topCard.defId)?.value ?? "?";
        addHint(ctx, `Top deck: ${topCard.defId}  ·  val ${cardVal}`);
        // KEEP button
        const keepBtn = scene.add.rectangle(L.btnCx, L.resetY - 20, 200, 32, ctx.confirmFillNum)
          .setStrokeStyle(2, ctx.confirmStrokeNum)
          .setInteractive({ useHandCursor: true })
          .setName("reveal-top-deck-keep")
          .setData("testid", "reveal-top-deck-keep");
        keepBtn.on("pointerover", () => keepBtn.setFillStyle(ctx.confirmHoverNum));
        keepBtn.on("pointerout",  () => keepBtn.setFillStyle(ctx.confirmFillNum));
        keepBtn.on("pointerdown", () => ctx.emitResolveEffect({ id: myEffect.id }));
        addHud(keepBtn);
        addHud(scene.add.text(L.btnCx, L.resetY - 20, "▶  KEEP", {
          fontSize: "13px", fontFamily: "monospace", color: ctx.confirmTextColor, fontStyle: "bold",
        }).setOrigin(0.5));
        // DISCARD button
        const discardBtn = scene.add.rectangle(L.btnCx, L.resetY + 18, 200, 32, 0x2a0a0a)
          .setStrokeStyle(2, 0xcc4444)
          .setInteractive({ useHandCursor: true })
          .setName("reveal-top-deck-discard")
          .setData("testid", "reveal-top-deck-discard");
        discardBtn.on("pointerover", () => discardBtn.setFillStyle(0x3d1010));
        discardBtn.on("pointerout",  () => discardBtn.setFillStyle(0x2a0a0a));
        discardBtn.on("pointerdown", () => ctx.emitResolveEffect({ id: myEffect.id, targetInstanceId: topCard.instanceId }));
        addHud(discardBtn);
        addHud(scene.add.text(L.btnCx, L.resetY + 18, "✕  DISCARD", {
          fontSize: "13px", fontFamily: "monospace", color: "#cc4444", fontStyle: "bold",
        }).setOrigin(0.5));
      } else {
        addConfirmButton(ctx, myEffect.description, () => ctx.emitResolveEffect({ id: myEffect.id }));
      }
    } else if (spec.isAutoExecute) {
      addConfirmButton(ctx, myEffect.description, () => ctx.emitResolveEffect({ id: myEffect.id }));
    } else if (spec.boardMode && !ctx.state.getEffectBoardTargetId()) {
      const allBoardCards: Array<{ card: CardView; pi: 0 | 1; idx: number; total: number }> = [];
      const ownPi = myIndex;
      const oppPi = (1 - myIndex) as 0 | 1;
      for (let li = 0; li < 3; li++) {
        const ownCards = view.lines[li].cards;
        ownCards.forEach((c, idx) => allBoardCards.push({ card: c, pi: ownPi, idx, total: ownCards.length }));
        const oppCards = view.opponentLines[li].cards;
        oppCards.forEach((c, idx) => allBoardCards.push({ card: c, pi: oppPi, idx, total: oppCards.length }));
      }
      const hasValidTarget = allBoardCards.some(({ card, pi, idx, total }) =>
        ctx.isBoardCardValidForEffect(card, pi, idx, total, myEffect)
      );

      if (!hasValidTarget) {
        addHint(ctx, "No valid targets on the board.", "#445566");
        const confirmNoneBtn = scene.add.rectangle(L.btnCx, L.resetY, 200, 36, 0x0d2010)
          .setStrokeStyle(2, ctx.confirmStrokeNum)
          .setInteractive({ useHandCursor: true })
          .setName("skip-effect-button")
          .setData("testid", "skip-effect-button");
        confirmNoneBtn.on("pointerover", () => confirmNoneBtn.setFillStyle(ctx.confirmHoverNum));
        confirmNoneBtn.on("pointerout", () => confirmNoneBtn.setFillStyle(ctx.confirmFillNum));
        confirmNoneBtn.on("pointerdown", () => ctx.emitResolveEffect({ id: myEffect.id }));
        addHud(confirmNoneBtn);
        addHud(scene.add.text(L.btnCx, L.resetY, "▶  CONFIRM (no targets)", {
          fontSize: "13px", fontFamily: "monospace", color: ctx.confirmTextColor, fontStyle: "bold",
        }).setOrigin(0.5));
      } else {
        addHint(ctx, ctx.getBoardPickHint(spec.boardMode));
        if (spec.isOptional) {
          addSkipButton(ctx, () => {
            ctx.state.setEffectBoardTargetId(null);
            ctx.emitResolveEffect({ id: myEffect.id });
          });
        }
      }
    } else if (spec.needsLine) {
      const hint = ctx.state.getEffectBoardTargetId() ? "Card selected — choose a destination line:" : "Choose a line:";
      addHint(ctx, hint);

      const isGravity1Shift =
        myEffect.type === "shift" &&
        ((myEffect.payload.targets as string | undefined) === undefined) &&
        !!ctx.state.getEffectBoardTargetId();
      const isLight3Shift =
        myEffect.type === "shift" &&
        (myEffect.payload.targets as string | undefined) === "own_facedown_in_line";
      const isLineAllowed = isGravity1Shift
        ? (li: number) => {
          if (!myEffect.sourceInstanceId) return false;
          const srcLine = ctx.findOwnLineOfInstance(myEffect.sourceInstanceId);
          const pickedLine = ctx.findOwnLineOfInstance(ctx.state.getEffectBoardTargetId()!);
          if (srcLine == null || pickedLine == null) return false;
          if (pickedLine === srcLine) return li !== srcLine;
          return li === srcLine;
        }
        : isLight3Shift
          ? (li: number) => {
            if (!myEffect.sourceInstanceId) return false;
            const srcLine = ctx.findOwnLineOfInstance(myEffect.sourceInstanceId);
            return srcLine != null && li !== srcLine;
          }
        : undefined;

      ctx.renderLinePicker(spec.lineScope!, (li) => {
        ctx.emitResolveEffect({
          id: myEffect.id,
          targetInstanceId: ctx.state.getEffectBoardTargetId() ?? undefined,
          targetLineIndex: li,
        });
        ctx.state.setEffectBoardTargetId(null);
      }, isLineAllowed);
    }
  } else if (oppEffect) {
    noteStatus("effect-opponent-title", "Opponent resolving...");
    const oppDescription = `[${oppEffect.cardName}] ${oppEffect.description}`;
    noteStatus("effect-opponent-description", oppDescription);
    // Opponent effect panel — focus panel bottom area
    addHud(scene.add.rectangle(L.btnCx, L.resetY - 50, L.focusPanelW - 6, 148, 0x0e0a18, 0.94)
      .setStrokeStyle(1.5, 0xa36a7b, 0.5));
    addHud(scene.add.text(L.btnCx, L.resetY - 117, "OPPONENT RESOLVING", {
      fontSize: "10px", fontFamily: "monospace", fontStyle: "bold", color: "#ff8ca0",
    }).setOrigin(0.5));
    addHud(scene.add.text(L.btnCx, L.resetY - 103, oppEffect.cardName.toUpperCase(), {
      fontSize: "11px", fontFamily: "monospace", fontStyle: "bold", color: "#ffdce5",
    }).setOrigin(0.5));
    addHud(scene.add.text(L.btnCx, L.resetY - 88, oppEffect.description, {
      fontSize: "11px", fontFamily: "monospace", color: "#e8e2f4", align: "center",
      wordWrap: { width: L.focusPanelW - 18 },
    }).setOrigin(0.5, 0)
      .setName("effect-opponent-description")
      .setData("testid", "effect-opponent-description"));
  } else if (view.pendingControlReorder) {
    noteStatus("control-reorder-title", "★ CONTROL BONUS");
    // Control reorder panel — focus panel bottom area
    addHud(scene.add.rectangle(L.btnCx, L.resetY - 50, L.focusPanelW - 6, 148, 0x0e0e00, 0.90)
      .setStrokeStyle(1.5, 0xffcc00, 0.4));
    addHud(scene.add.text(L.btnCx, L.resetY - 117, "★ CONTROL BONUS", {
      fontSize: "10px", fontFamily: "monospace", color: "#ffcc00", fontStyle: "bold",
    }).setOrigin(0.5));

    if (!ctx.state.getControlReorderWhose()) {
      const chooseText = "Choose whose protocols to reorder, or skip:";
      noteStatus("control-reorder-instruction", chooseText);
      addHud(scene.add.text(L.btnCx, L.resetY - 99, chooseText, {
        fontSize: "11px", fontFamily: "monospace", color: "#ccbbaa", align: "center",
        wordWrap: { width: L.focusPanelW - 14 },
      }).setOrigin(0.5, 0));

      const mkBtn = (label: string, by: number, color: number, textColor: string, cb: () => void) => {
        const bg = scene.add.rectangle(L.btnCx, by, 180, 38, color)
          .setStrokeStyle(2, 0xffcc00).setInteractive({ useHandCursor: true });
        bg.on("pointerover", () => bg.setAlpha(0.75));
        bg.on("pointerout", () => bg.setAlpha(1));
        bg.on("pointerdown", cb);
        addHud(bg);
        addHud(scene.add.text(L.btnCx, by, label, {
          fontSize: "13px", fontFamily: "monospace", color: textColor, fontStyle: "bold",
        }).setOrigin(0.5));
      };

      mkBtn("REORDER OWN", L.resetY, 0x2a1400, "#ffcc00", () => {
        ctx.state.setControlReorderWhose("self");
        ctx.state.setControlReorderPicks([]);
        ctx.renderAll();
      });
      mkBtn("REORDER OPP", L.resetY + 44, 0x14002a, "#cc88ff", () => {
        ctx.state.setControlReorderWhose("opponent");
        ctx.state.setControlReorderPicks([]);
        ctx.renderAll();
      });
      mkBtn("SKIP", L.resetY + 88, 0x0d1a0d, "#558866", () => {
        ctx.emitResolveControlReorder({});
      });
    } else {
      const isOpp = ctx.state.getControlReorderWhose() === "opponent";
      const rawProtos = isOpp ? view.opponentProtocols : view.protocols;
      const sortedProtos = [...rawProtos].sort((a, b) => a.lineIndex - b.lineIndex);

      const reorderText = `Reorder ${isOpp ? "OPPONENT" : "OWN"} protocols — click in desired Line 0 → 1 → 2 order:`;
      noteStatus("control-reorder-instruction", reorderText);
      addHud(scene.add.text(L.btnCx, L.resetY - 99, reorderText, {
        fontSize: "11px", fontFamily: "monospace", color: isOpp ? "#cc88ff" : "#ffcc00", align: "center",
        wordWrap: { width: L.focusPanelW - 14 },
      }).setOrigin(0.5, 0));

      const picks = ctx.state.getControlReorderPicks();
      const pickNames = picks.map(id => PROTOCOL_NAMES_CLIENT.get(id) ?? id);
      const preview = [0, 1, 2].map(i => `${i}: ${pickNames[i] ?? "—"}`).join("   ");
      noteStatus("control-reorder-preview", preview);
      addHud(scene.add.text(L.btnCx, L.resetY - 70, preview, {
        fontSize: "11px", fontFamily: "monospace", color: "#aaddcc", align: "center",
        wordWrap: { width: L.focusPanelW - 14 },
      }).setOrigin(0.5));

      const btnW = 180;
      const btnH = 38;
      const btnY = 614;
      sortedProtos.forEach((proto, i) => {
        const name = PROTOCOL_NAMES_CLIENT.get(proto.protocolId) ?? proto.protocolId;
        const protoNameColor = ctx.complementaryProtoColor(proto.protocolId);
        const isPicked = picks.includes(proto.protocolId);
        const bx = L.W / 2 + (i - 1) * 200;
        const bg = scene.add.rectangle(bx, btnY, btnW, btnH,
          isPicked ? 0x111111 : (isOpp ? 0x200030 : 0x2a1400))
          .setStrokeStyle(2, isPicked ? 0x333333 : (isOpp ? 0xcc88ff : 0xffcc00))
          .setAlpha(isPicked ? 0.5 : 1);
        if (!isPicked) {
          bg.setInteractive({ useHandCursor: true });
          bg.on("pointerover", () => bg.setAlpha(0.7));
          bg.on("pointerout", () => bg.setAlpha(1));
          bg.on("pointerdown", () => {
            ctx.state.setControlReorderPicks([...ctx.state.getControlReorderPicks(), proto.protocolId]);
            ctx.renderAll();
          });
        }
        addHud(bg);
        const slotLabel = isPicked ? `↳ slot ${ctx.state.getControlReorderPicks().indexOf(proto.protocolId)}` : name;
        addHud(scene.add.text(bx, btnY, slotLabel, {
          fontSize: "13px", fontFamily: "monospace",
          color: isPicked ? "#444444" : protoNameColor,
          fontStyle: "bold",
        }).setOrigin(0.5));
      });

      const allPicked = ctx.state.getControlReorderPicks().length === 3;
      if (allPicked) {
        const confirmBg = scene.add.rectangle(L.btnCx, L.resetY, 180, 38, 0x002a14)
          .setStrokeStyle(2, ctx.hudAccentNum).setInteractive({ useHandCursor: true });
        confirmBg.on("pointerover", () => confirmBg.setAlpha(0.75));
        confirmBg.on("pointerout", () => confirmBg.setAlpha(1));
        confirmBg.on("pointerdown", () => {
          ctx.emitResolveControlReorder({
            whose: ctx.state.getControlReorderWhose()!,
            newProtocolOrder: [...ctx.state.getControlReorderPicks()],
          });
          ctx.state.setControlReorderWhose(null);
          ctx.state.setControlReorderPicks([]);
        });
        addHud(confirmBg);
        addHud(scene.add.text(L.btnCx, L.resetY, "▶  CONFIRM", {
          fontSize: "13px", fontFamily: "monospace", color: ctx.hudAccentColor, fontStyle: "bold",
        }).setOrigin(0.5));
      }

      const backY = allPicked ? L.resetY + 44 : L.resetY;
      const skipY = allPicked ? L.resetY + 88 : L.resetY + 44;

      const backBg = scene.add.rectangle(L.btnCx, backY, 180, 38, 0x1a1a00)
        .setStrokeStyle(2, 0x886600).setInteractive({ useHandCursor: true });
      backBg.on("pointerover", () => backBg.setAlpha(0.75));
      backBg.on("pointerout", () => backBg.setAlpha(1));
      backBg.on("pointerdown", () => {
        ctx.state.setControlReorderWhose(null);
        ctx.state.setControlReorderPicks([]);
        ctx.renderAll();
      });
      addHud(backBg);
      addHud(scene.add.text(L.btnCx, backY, "◀  BACK", {
        fontSize: "13px", fontFamily: "monospace", color: "#886600", fontStyle: "bold",
      }).setOrigin(0.5));

      const skipBg = scene.add.rectangle(L.btnCx, skipY, 180, 38, 0x0d1a0d)
        .setStrokeStyle(2, 0x558866).setInteractive({ useHandCursor: true });
      skipBg.on("pointerover", () => skipBg.setAlpha(0.75));
      skipBg.on("pointerout", () => skipBg.setAlpha(1));
      skipBg.on("pointerdown", () => {
        ctx.emitResolveControlReorder({});
        ctx.state.setControlReorderWhose(null);
        ctx.state.setControlReorderPicks([]);
      });
      addHud(skipBg);
      addHud(scene.add.text(L.btnCx, skipY, "SKIP", {
        fontSize: "13px", fontFamily: "monospace", color: "#558866", fontStyle: "bold",
      }).setOrigin(0.5));
    }
  }

  if (view.opponentHandRevealed || view.opponentRevealedHandCard) {
    const msg = view.opponentHandRevealed
      ? `OPP HAND REVEALED: ${view.opponentHandRevealed.map(c => CLIENT_CARD_DEFS.get(c.defId)?.name ?? c.defId).join(", ") || "(empty)"}`
      : `OPP REVEALED: ${CLIENT_CARD_DEFS.get(view.opponentRevealedHandCard!.defId)?.name ?? view.opponentRevealedHandCard!.defId} (val ${CLIENT_CARD_DEFS.get(view.opponentRevealedHandCard!.defId)?.value ?? "?"}) — see panel →`;
    noteStatus("opponent-reveal-banner", msg);
    addHud(scene.add.text(L.W / 2, 68, msg, {
      fontSize: "11px", fontFamily: "monospace", color: "#ffaa44", wordWrap: { width: 500 },
    }).setOrigin(0.5));
  }
}
