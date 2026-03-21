import Phaser from "phaser";
import { TurnPhase } from "@compile/shared";
import { createRandomizedMockView, createMockViewForEffect } from "../data/mockGameState";

export class MockGameScene extends Phaser.Scene {
  constructor() {
    super("MockGameScene");
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    const effectType = params.get("effect");

    const payload = effectType
      ? createMockViewForEffect(effectType)
      : createRandomizedMockView();

    // For dedicated effect test URLs, start in ACTION first and let GameScene
    // promote to EffectResolution. This mirrors when effects normally appear.
    const initialPayload = effectType
      ? { view: payload.view, turnPhase: TurnPhase.Action }
      : payload;

    this.scene.start("GameScene", {
      initialPayload,
      myIndex: 0,
      devMode: true,
      mockEffectType: effectType ?? undefined,
    });
  }
}
