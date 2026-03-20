import Phaser from "phaser";
import { createRandomizedMockView } from "../data/mockGameState";

export class MockGameScene extends Phaser.Scene {
  constructor() {
    super("MockGameScene");
  }

  create(): void {
    this.scene.start("GameScene", {
      initialPayload: createRandomizedMockView(),
      myIndex: 0,
      devMode: true,
    });
  }
}
