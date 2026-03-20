import Phaser from "phaser";
import { MenuScene } from "./scenes/MenuScene";
import { DraftScene } from "./scenes/DraftScene";
import { GameScene } from "./scenes/GameScene";
import { GameOverScene } from "./scenes/GameOverScene";
import { MockGameScene } from "./scenes/MockGameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1600,
  height: 720,
  backgroundColor: "#111820",
  parent: "game-container",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1600,
    height: 720,
  },
  scene: [MenuScene, DraftScene, GameScene, MockGameScene, GameOverScene],
};

new Phaser.Game(config);
