import Phaser from "phaser";
import { MenuScene } from "./scenes/MenuScene";
import { DraftScene } from "./scenes/DraftScene";
import { GameScene } from "./scenes/GameScene";
import { GameOverScene } from "./scenes/GameOverScene";
import { MockGameScene } from "./scenes/MockGameScene";
import { CardPreviewScene } from "./scenes/CardPreviewScene";

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
  scene: [MenuScene, DraftScene, GameScene, MockGameScene, CardPreviewScene, GameOverScene],
};

const game = new Phaser.Game(config);

// Expose Phaser game instance for testing (E2E tests need this to control scene transitions)
(window as any).__PHASER_GAME__ = game;

// Check for test mode query parameter
const urlParams = new URLSearchParams(window.location.search);
const isTestMode = urlParams.has('test') && urlParams.get('test') === '1';
const isPreviewMode = urlParams.has('preview') && urlParams.get('preview') === '1';

// Override the scene startup based on test mode
if (isPreviewMode) {
  game.events.once('ready', () => {
    if (game.scene.isActive('MenuScene')) {
      game.scene.stop('MenuScene');
    }
    game.scene.start('CardPreviewScene');
  });
} else if (isTestMode) {
  // In test mode, stop the auto-started MenuScene and start MockGameScene instead
  game.events.once('ready', () => {
    if (game.scene.isActive('MenuScene')) {
      game.scene.stop('MenuScene');
    }
    game.scene.start('MockGameScene');
  });
} else {
  // Normal mode: ensure MenuScene is started (it should auto-start anyway)
  game.events.once('ready', () => {
    if (!game.scene.isActive('MenuScene')) {
      game.scene.start('MenuScene');
    }
  });
}
