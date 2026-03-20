import Phaser from "phaser";
import { CardView, CardFace } from "@compile/shared";
import { ClientCardDef, protocolColorFromDefId } from "../data/cardDefs";

export type CardClickCallback = (card: CardView) => void;

const CARD_W = 90;
const CARD_H = 126;

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

  private static shadeColor(color: number, factor: number): number {
    const r = Math.max(0, Math.min(255, Math.floor(((color >> 16) & 0xff) * factor)));
    const g = Math.max(0, Math.min(255, Math.floor(((color >> 8) & 0xff) * factor)));
    const b = Math.max(0, Math.min(255, Math.floor((color & 0xff) * factor)));
    return (r << 16) | (g << 8) | b;
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
    const outL = l < 0.5 ? 0.72 : 0.28;

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
    covered = false
  ) {
    super(scene, x, y);
    this.cardData = card;
    this.cardDefs = cardDefs;

    const isHidden  = "hidden" in card;
    this.isFaceDown = isHidden || (!isHidden && (card as any).face === CardFace.FaceDown);
    const defId     = !isHidden ? (card as any).defId as string : undefined;
    const def       = defId ? cardDefs.get(defId) : undefined;
    const protoColor = defId ? protocolColorFromDefId(defId) : 0x1a3a5c;
    this.protoColor  = this.isFaceDown ? 0x666666 : protoColor;
    this.fillNormal  = this.isFaceDown ? 0x2e2e2e : CardSprite.shadeColor(protoColor, 0.7);
    this.fillHover   = this.isFaceDown ? 0x3a3a3a : CardSprite.shadeColor(protoColor, 0.82);

    // ── Background ─────────────────────────────────────────────────────────
    const outerStroke = scene.add.rectangle(0, 0, CARD_W + 2, CARD_H + 2, 0x000000, 0)
      .setStrokeStyle(2, 0xffffff, 0.85);
    this.add(outerStroke);

    const bgFill   = this.fillNormal;
    const bgStroke = this.protoColor;
    this.bg = scene.add.rectangle(0, 0, CARD_W, CARD_H, bgFill)
      .setStrokeStyle(1.5, bgStroke);
    this.add(this.bg);

    if (this.isFaceDown) {
      this.buildFaceDown(scene);
    } else if (def) {
      const cardTextColor = CardSprite.complementCss(this.fillNormal);
      this.buildFaceUp(scene, def, covered, protoColor, this.fillNormal, cardTextColor);
    }

    // Covered cards get a dark translucent overlay to show depth
    if (covered) {
      this.add(
        scene.add.rectangle(0, 0, CARD_W, CARD_H, 0x000000)
          .setAlpha(0.45)
      );
    }

    scene.add.existing(this);
  }

  // ── Face-down ─────────────────────────────────────────────────────────────
  private buildFaceDown(scene: Phaser.Scene): void {
    // Stripe pattern
    const stripe = (dx: number) =>
      scene.add.text(dx, 0, "║", {
        fontSize: "80px", fontFamily: "monospace", color: "#484848",
      }).setOrigin(0.5).setAlpha(0.6);
    this.add(stripe(-22));
    this.add(stripe(0));
    this.add(stripe(22));

    // Value chip — always 2 when face-down
    this.add(this.valueChip(scene, FACE_DOWN_VALUE, "#cccccc", 0x3a3a3a, true));

    // "FACE DOWN" label
    this.add(scene.add.text(0, CARD_H / 2 - 9, "FACE DOWN", {
      fontSize: "8px", fontFamily: "monospace", color: "#888888",
    }).setOrigin(0.5, 1));
  }

  // ── Face-up ──────────────────────────────────────────────────────────────
  private buildFaceUp(
    scene: Phaser.Scene,
    def: ClientCardDef,
    covered: boolean,
    protoColor: number,
    cardBgFill: number,
    cardTextColor: string
  ): void {
    const hH = CARD_H / 2;   // 63
    const hW = CARD_W / 2;   // 45
    const titleTextColor = CardSprite.oppositeHueCss(protoColor);

    // Name bar — top 22px strip, coloured by protocol
    this.add(scene.add.rectangle(0, -hH + 11, CARD_W, 22, protoColor));
    this.add(scene.add.text(0, -hH + 11, def.name, {
      fontSize: "11px", fontFamily: "monospace", color: titleTextColor, fontStyle: "bold",
      wordWrap: { width: CARD_W - 24 }, align: "center",
    }).setOrigin(0.5));


    // Value chip — top-right corner
    this.add(this.valueChip(scene, def.value, cardTextColor, CardSprite.shadeColor(cardBgFill, 0.6), false));

    // Section dividers
    const allSections = [
      { tag: "START", text: def.top, y0: -41 },
      { tag: "PLAY",  text: def.mid, y0: -13 },
      { tag: "END",   text: def.bot, y0:  15 },
    ] as const;
    const sections = covered ? allSections.slice(0, 1) : allSections;

    const dividerYs = covered ? [-41] : [-41, -13, 15, 43];
    for (const lineY of dividerYs) {
      this.add(scene.add.rectangle(0, lineY, CARD_W, 1, this.protoColor));
    }

    for (const { tag, text, y0 } of sections) {
      if (!text) continue;
      // Trigger label
      this.add(scene.add.text(-hW + 3, y0 + 3, tag, {
        fontSize: "7px", fontFamily: "monospace", color: cardTextColor,
      }).setOrigin(0, 0));
      // Effect text
      this.add(scene.add.text(0, y0 + 13, text, {
        fontSize: "9px", fontFamily: "monospace", color: cardTextColor,
        wordWrap: { width: CARD_W - 8 }, align: "center",
      }).setOrigin(0.5, 0));
    }
  }

  // ── Shared value chip (top-right corner) ────────────────────────────────
  private valueChip(
    scene: Phaser.Scene,
    value: number,
    textColor: string,
    bgColor: number,
    muted: boolean
  ): Phaser.GameObjects.Container {
    const chip = scene.add.container(CARD_W / 2 - 11, -CARD_H / 2 + 11);
    chip.add(scene.add.circle(0, 0, 10, bgColor));
    chip.add(scene.add.text(0, 0, String(value), {
      fontSize: muted ? "13px" : "15px",
      fontFamily: "monospace",
      color: textColor,
      fontStyle: "bold",
    }).setOrigin(0.5));
    return chip;
  }

  // ── Selection state ──────────────────────────────────────────────────────
  setSelected(sel: boolean): void {
    this.selected = sel;
    this.bg.setStrokeStyle(sel ? 3 : 1.5, this.protoColor);
    this.setY(this.y + (sel ? -10 : 10));
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

  override destroy(fromScene?: boolean): void {
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


