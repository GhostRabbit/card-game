import Phaser from "phaser";
import { CardView, CardFace } from "@compile/shared";
import { ClientCardDef, protocolColorFromDefId, protocolAccentFromDefId } from "../data/cardDefs";

export type CardClickCallback = (card: CardView) => void;

const CARD_W = 99;
const CARD_H = 139;

/** Value a face-down card always contributes to line value */
const FACE_DOWN_VALUE = 2;

export class CardSprite extends Phaser.GameObjects.Container {
  readonly cardData: CardView;
  private bg!: Phaser.GameObjects.Rectangle;
  private selected = false;
  private readonly isFaceDown: boolean;
  private readonly cardDefs: Map<string, ClientCardDef>;
  private readonly protoColor: number;
  private readonly fillNormal: number;
  private readonly fillHover: number;
  private readonly cardW: number;
  private readonly cardH: number;
  private readonly uiScale: number;
  private effectPulseTween: Phaser.Tweens.Tween | null = null;

  private px(base: number, min = 1): number {
    return Math.max(min, Math.round(base * this.uiScale));
  }

  private fpx(base: number, min = 1): string {
    return `${this.px(base, min)}px`;
  }

  private static shadeColor(color: number, factor: number): number {
    const r = Math.max(0, Math.min(255, Math.floor(((color >> 16) & 0xff) * factor)));
    const g = Math.max(0, Math.min(255, Math.floor(((color >> 8) & 0xff) * factor)));
    const b = Math.max(0, Math.min(255, Math.floor((color & 0xff) * factor)));
    return (r << 16) | (g << 8) | b;
  }

  private static blendColors(a: number, b: number, t: number): number {
    const r = Math.round(((a >> 16) & 0xff) * (1 - t) + ((b >> 16) & 0xff) * t);
    const g = Math.round(((a >> 8) & 0xff) * (1 - t) + ((b >> 8) & 0xff) * t);
    const bl = Math.round((a & 0xff) * (1 - t) + (b & 0xff) * t);
    return (r << 16) | (g << 8) | bl;
  }

  private static complementCss(color: number): string {
    const comp = (~color) & 0xffffff;
    return `#${comp.toString(16).padStart(6, "0")}`;
  }

  private static oppositeHueCss(color: number): string {
    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >> 8) & 0xff) / 255;
    const b = (color & 0xff) / 255;
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
    const outS = Math.max(0.45, s);
    const outL = l < 0.5 ? 0.86 : 0.34;

    const c = (1 - Math.abs(2 * outL - 1)) * outS;
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

    const m = outL - c / 2;
    const outR = Math.round((rr + m) * 255);
    const outG = Math.round((gg + m) * 255);
    const outB = Math.round((bb + m) * 255);
    const out = (outR << 16) | (outG << 8) | outB;
    return `#${out.toString(16).padStart(6, "0")}`;
  }

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    card: CardView,
    cardDefs: Map<string, ClientCardDef>,
    /** True when another card sits on top of this one in the stack */
    covered = false,
    /** Scales card frame size while preserving font sizes */
    sizeScale = 1
  ) {
    super(scene, x, y);
    this.cardData = card;
    this.cardDefs = cardDefs;
    this.uiScale = sizeScale;
    this.cardW = Math.round(CARD_W * sizeScale);
    this.cardH = Math.round(CARD_H * sizeScale);

    const isHidden  = "hidden" in card;
    this.isFaceDown = isHidden || (!isHidden && (card as any).face === CardFace.FaceDown);
    const defId     = !isHidden ? (card as any).defId as string : undefined;
    const def       = defId ? cardDefs.get(defId) : undefined;
    const protoColor  = defId ? protocolColorFromDefId(defId) : 0x1a3a5c;
    const accentColor = defId ? protocolAccentFromDefId(defId) : 0x4488cc;
    this.protoColor  = this.isFaceDown ? 0x666666 : protoColor;
    this.fillNormal  = this.isFaceDown ? 0x2e2e2e : CardSprite.shadeColor(accentColor, 0.7);
    this.fillHover   = this.isFaceDown ? 0x3a3a3a : CardSprite.shadeColor(accentColor, 0.82);

    // ── BackFound ─────────────────────────────────────────────────────────
    const outerStroke = scene.add.rectangle(0, 0, this.cardW + this.px(2), this.cardH + this.px(2), 0x000000, 0)
      .setStrokeStyle(this.px(2), 0xffffff, 0.85);
    this.add(outerStroke);

    const bgFill   = this.fillNormal;
    const bgStroke = this.protoColor;
    this.bg = scene.add.rectangle(0, 0, this.cardW, this.cardH, bgFill)
      .setStrokeStyle(Math.max(1, 1.5 * this.uiScale), bgStroke);
    this.add(this.bg);

    if (this.isFaceDown) {
      this.buildFaceDown(scene);
    } else if (def) {
      const cardTextColor = CardSprite.oppositeHueCss(this.fillNormal);
      this.buildFaceUp(scene, def, covered, protoColor, accentColor, this.fillNormal, cardTextColor);
    }

    // Covered face-down cards still use a full overlay to show stack depth.
    // Face-up covered cards are handled in buildFaceUp with a partial overlay,
    // keeping header + top section visible while obscuring lower sections.
    if (covered && this.isFaceDown) {
      this.add(
        scene.add.rectangle(0, 0, this.cardW, this.cardH, 0x000000)
          .setAlpha(0.45)
      );
    }

    scene.add.existing(this);
  }

  // ── Face-down ─────────────────────────────────────────────────────────────
  private buildFaceDown(scene: Phaser.Scene): void {
    const stripeDx = this.px(22);

    // Stripe pattern
    const stripe = (dx: number) =>
      scene.add.text(dx, 0, "║", {
        fontSize: this.fpx(80), fontFamily: "monospace", color: "#484848",
      }).setOrigin(0.5).setAlpha(0.6);
    this.add(stripe(-stripeDx));
    this.add(stripe(0));
    this.add(stripe(stripeDx));

    // Value chip — always 2 when face-down
    this.add(this.valueChip(scene, FACE_DOWN_VALUE, "#cccccc", 0x3a3a3a, true));

    // "FACE DOWN" label
    this.add(scene.add.text(0, this.cardH / 2 - this.px(9), "FACE DOWN", {
      fontSize: this.fpx(8), fontFamily: "monospace", color: "#888888",
    }).setOrigin(0.5, 1));
  }

  // ── Face-up ──────────────────────────────────────────────────────────────
  private buildFaceUp(
    scene: Phaser.Scene,
    def: ClientCardDef,
    covered: boolean,
    protoColor: number,
    accentColor: number,
    cardBgFill: number,
    cardTextColor: string
  ): void {
    const hH = this.cardH / 2;
    const hW = this.cardW / 2;
    const nameBarFill = protoColor;
    const titleTextColor = CardSprite.oppositeHueCss(nameBarFill);
    const nameBarH = this.px(22);
    const namePadX = this.px(6);
    const valueInset = this.px(11);

    // Name bar — use the same title fill color as protocol names on the board lines.
    this.add(scene.add.rectangle(0, -hH + nameBarH / 2, this.cardW, nameBarH, nameBarFill));
    this.add(scene.add.text(-hW + namePadX, -hH + nameBarH / 2, def.name, {
      fontSize: this.fpx(9),
      fontFamily: "monospace",
      color: titleTextColor,
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: this.px(2),
      shadow: { offsetX: this.px(1), offsetY: this.px(1), color: "#000000", blur: 0, stroke: false, fill: true },
      wordWrap: { width: this.cardW - this.px(22) },
      align: "left",
    }).setOrigin(0, 0.5));


    // Value chip — top-right corner
    this.add(this.valueChip(scene, def.value, titleTextColor, CardSprite.shadeColor(cardBgFill, 0.6), false, true));

    // Dynamic section layout (top / mid / bot). Empty sections render as '-'.
    const allSections = [
      { tag: def.topTag ?? "START", text: def.top },
      { tag: def.midTag ?? "IMMEDIATE", text: def.mid },
      { tag: def.botTag ?? "END", text: def.bot },
    ] as const;
    const sections = covered ? allSections.slice(0, 1) : allSections;

    const sectionGap = this.px(3);
    const sectionWidth = this.cardW - this.px(6);
    const sectionInnerPadX = this.px(4, 2);
    const sectionInnerPadY = this.px(3);
    const sectionTop = -hH + this.px(24);
    const sectionBottom = hH - this.px(5);
    const availableHeight = Math.max(this.px(20), sectionBottom - sectionTop);

    const measured = sections.map((s) => {
      const hasText = !!s.text && s.text.trim().length > 0;
      const inline = hasText ? s.text!.trim() : "-";
      const probe = scene.add
        .text(-9999, -9999, inline, {
          fontSize: this.fpx(8),
          fontFamily: "monospace",
          fontStyle: "normal",
          color: cardTextColor, 
          wordWrap: { width: sectionWidth - sectionInnerPadX * 2 },
          align: "left",
        })
        .setVisible(false);

      const naturalHeight = Math.max(
        this.px(16),
        Math.ceil(probe.height + sectionInnerPadY * 2 + 1),
      );

      probe.destroy();

      const adjustedHeight = hasText
        ? naturalHeight
        : Math.max(this.px(8), Math.floor(naturalHeight * 0.5));

      return { ...s, inline, hasText, naturalHeight: adjustedHeight, minHeight: hasText ? this.px(16) : this.px(8) };
    });

    const totalGap = sectionGap * Math.max(0, measured.length - 1);
    const maxForSections = Math.max(this.px(18), availableHeight - totalGap);
    const totalNatural = measured.reduce((sum, s) => sum + s.naturalHeight, 0);
    const scale = totalNatural > maxForSections ? maxForSections / totalNatural : 1;

    const sectionHeights = measured.map((s) =>
      Math.max(s.minHeight, Math.floor(s.naturalHeight * scale))
    );
    const usedHeight = sectionHeights.reduce((sum, h) => sum + h, 0);
    let remainingHeight = maxForSections - usedHeight;

    if (!covered && remainingHeight > 0 && sectionHeights.length > 0) {
      const evenAdd = Math.floor(remainingHeight / sectionHeights.length);
      const remainder = remainingHeight % sectionHeights.length;

      for (let i = 0; i < sectionHeights.length; i += 1) {
        sectionHeights[i] += evenAdd + (i < remainder ? 1 : 0);
      }
      remainingHeight = 0;
    }

    let yCursor = sectionTop;
    for (let i = 0; i < measured.length; i += 1) {
      const s = measured[i];
      const h = sectionHeights[i];
      const sectionTextColor = s.hasText ? "#ffffff" : cardTextColor;
      const sectionFill = s.hasText ? CardSprite.blendColors(0x000000, cardBgFill, 0.25) : CardSprite.shadeColor(cardBgFill, 0.9);

      const bg = scene.add.graphics();
      bg.fillStyle(sectionFill, s.hasText ? 0.85 : 0.5);
      bg.lineStyle(this.px(1), this.protoColor, 0.95);
      bg.fillRoundedRect(-sectionWidth / 2, yCursor, sectionWidth, h, this.px(5));
      bg.strokeRoundedRect(-sectionWidth / 2, yCursor, sectionWidth, h, this.px(5));
      this.add(bg);

      const bodyY = yCursor + sectionInnerPadY;
      const bodyX = -sectionWidth / 2 + sectionInnerPadX;
      const bodyText = scene.add
        .text(bodyX, bodyY, s.inline, {
          fontSize: this.fpx(8),
          fontFamily: "monospace",
          fontStyle: "normal",
          strokeThickness: 0,   
          color: sectionTextColor,
          wordWrap: { width: sectionWidth - sectionInnerPadX * 2 },
          align: "left",
        })
        .setOrigin(0, 0);
      this.add(bodyText);

      const colonIdx = s.hasText ? s.inline.indexOf(":") : -1;
      if (colonIdx > 0) {
        const wrapWidth = sectionWidth - sectionInnerPadX * 2;
        const triggerText = s.inline.slice(0, colonIdx);
        const triggerProbe = scene.add.text(-9999, -9999, triggerText, {
          fontSize: this.fpx(8),
          fontFamily: "monospace",
          fontStyle: "normal",
          color: sectionTextColor,
          wordWrap: { width: wrapWidth },
          align: "left",
        }).setVisible(false);

        const wrappedTriggerLines = triggerProbe.getWrappedText(triggerText);
        const lineHeight = wrappedTriggerLines.length > 0
          ? triggerProbe.height / wrappedTriggerLines.length
          : triggerProbe.height;

        const underline = scene.add.graphics();
        underline.lineStyle(this.px(1), Number.parseInt(sectionTextColor.slice(1), 16), 1);
        let drewAnyUnderline = false;
        for (let lineIdx = 0; lineIdx < wrappedTriggerLines.length; lineIdx += 1) {
          const line = wrappedTriggerLines[lineIdx];
          if (!line || line.trim().length === 0) continue;

          const lineProbe = scene.add.text(-9999, -9999, line, {
            fontSize: this.fpx(8),
            fontFamily: "monospace",
            fontStyle: "normal",
            color: sectionTextColor,
          }).setVisible(false);

          const lineWidth = Math.min(lineProbe.width, wrapWidth);
          lineProbe.destroy();

          const underlineY = bodyY + Math.floor((lineIdx + 1) * lineHeight) - 1;
          underline.beginPath();
          underline.moveTo(bodyX, underlineY);
          underline.lineTo(bodyX + lineWidth, underlineY);
          underline.strokePath();
          drewAnyUnderline = true;
        }

        triggerProbe.destroy();
        if (!drewAnyUnderline) {
          underline.destroy();
        } else {
          this.add(underline);
        }
      }

      yCursor += h + sectionGap;
    }

    if (covered) {
      const coverStartY = Math.max(sectionTop, yCursor - sectionGap);
      const coverHeight = hH - coverStartY;
      if (coverHeight > 0) {
        const cover = scene.add.graphics();
        cover.fillStyle(0x000000, 0.55);
        cover.fillRect(-hW, coverStartY, this.cardW, coverHeight);
        this.add(cover);
      }
    }
  }

  // ── Shared value chip (top-right corner) ────────────────────────────────
  private valueChip(
    scene: Phaser.Scene,
    value: number,
    textColor: string,
    bgColor: number,
    muted: boolean,
    titleStyle = false
  ): Phaser.GameObjects.Container {
    const chipInset = this.px(11);
    const chipRadius = this.px(10);
    const chip = scene.add.container(this.cardW / 2 - chipInset, -this.cardH / 2 + chipInset);
    chip.add(scene.add.circle(0, 0, chipRadius, bgColor));
    chip.add(scene.add.text(0, 0, String(value), {
      fontSize: muted ? this.fpx(11) : this.fpx(13),
      fontFamily: "monospace",
      color: textColor,
      fontStyle: "bold",
      stroke: titleStyle ? "#000000" : undefined,
      strokeThickness: titleStyle ? this.px(2) : 0,
      shadow: titleStyle
        ? { offsetX: this.px(1), offsetY: this.px(1), color: "#000000", blur: 0, stroke: false, fill: true }
        : undefined,
    }).setOrigin(0.5));
    return chip;
  }

  // ── Selection state ──────────────────────────────────────────────────────
  setSelected(sel: boolean): void {
    this.selected = sel;
    this.bg.setStrokeStyle(sel ? this.px(3) : Math.max(1, 1.5 * this.uiScale), this.protoColor);
    this.setY(this.y + (sel ? -this.px(10) : this.px(10)));
  }

  makeInteractive(onClick: CardClickCallback): void {
    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on("pointerover",  () => this.bg.setFillStyle(this.fillHover));
    this.bg.on("pointerout",   () => this.bg.setFillStyle(this.fillNormal));
    this.bg.on("pointerdown",  () => onClick(this.cardData));
  }

  /** Like makeInteractive but with a teal highlight indicating a valid effect target. */
  makeEffectTarget(onClick: CardClickCallback): void {
    this.bg.setStrokeStyle(2, 0x00ffcc);
    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on("pointerover",  () => { this.bg.setFillStyle(this.fillHover); this.bg.setStrokeStyle(2.5, 0x00ffcc); });
    this.bg.on("pointerout",   () => { this.bg.setFillStyle(this.fillNormal); this.bg.setStrokeStyle(2, 0x00ffcc); });
    this.bg.on("pointerdown",  () => onClick(this.cardData));
  }

  /**
   * Registers a focus-hover callback: fires with the card when the pointer
   * enters this sprite, and with null when the pointer leaves. Use this to
   * drive a scene-level focus-panel rather than spawning local previews.
   * Safe to call after makeInteractive / makeEffectTarget (adds extra listeners).
   */
  addFocusHover(onHover: (card: CardView | null) => void): void {
    if (!this.bg.input) this.bg.setInteractive();
    this.bg.on("pointerover", () => onHover(this.cardData));
    this.bg.on("pointerout",  () => onHover(null));
  }

  /**
   * Reports whether the primary pointer is currently pressed on this card.
   * Useful for temporary preview states (for example hold-to-peek behaviors).
   */
  addPressHold(onHoldChange: (isHolding: boolean) => void): void {
    if (!this.bg.input) this.bg.setInteractive();
    const stopHold = () => onHoldChange(false);
    this.bg.on("pointerdown", () => onHoldChange(true));
    this.bg.on("pointerup", stopHold);
    this.bg.on("pointerupoutside", stopHold);
    this.bg.on("pointerout", stopHold);
  }

  /** Highlights the card as an active-effect source with a slow pulse animation. */
  setEffectPulse(active: boolean): void {
    if (this.effectPulseTween) {
      this.effectPulseTween.stop();
      this.effectPulseTween = null;
    }

    if (!active) {
      this.setScale(1);
      return;
    }

    this.effectPulseTween = this.scene.tweens.add({
      targets: this,
      scaleX: 1.04,
      scaleY: 1.04,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
  }

  override destroy(fromScene?: boolean): void {
    if (this.effectPulseTween) {
      this.effectPulseTween.stop();
      this.effectPulseTween = null;
    }
    super.destroy(fromScene);
  }

  static get WIDTH():  number { return CARD_W; }
  static get HEIGHT(): number { return CARD_H; }
  static get FACE_DOWN_VALUE(): number { return FACE_DOWN_VALUE; }
  /**
   * Unscaled local-coordinate height of the portion of a covered card that
   * peeks out above its covering card: name bar (22px) + TOP section (28px).
   * Multiply by cardScale to get the screen-space step between card centres.
   */
  static get COVERED_STEP(): number { return 50; }
}


