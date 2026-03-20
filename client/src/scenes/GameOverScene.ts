import Phaser from "phaser";
import { getSocket } from "../network/SocketClient";

interface GameOverSceneData {
  winnerUsername: string;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super("GameOverScene");
  }

  init(data: GameOverSceneData): void {
    this._winnerUsername = data.winnerUsername;
  }

  private _winnerUsername = "";

  create(): void {
    const { width, height } = this.scale;

    this.add.text(width / 2, height * 0.3, "GAME OVER", {
      fontSize: "60px", fontFamily: "monospace", color: "#00ffcc", fontStyle: "bold",
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.46, `${this._winnerUsername} compiled all protocols!`, {
      fontSize: "24px", fontFamily: "monospace", color: "#ffffff",
    }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.65, 220, 50, 0x00ffcc)
      .setInteractive({ useHandCursor: true });
    this.add.text(width / 2, height * 0.65, "PLAY AGAIN", {
      fontSize: "20px", fontFamily: "monospace", color: "#0a0a0f",
    }).setOrigin(0.5);

    btn.on("pointerdown", () => {
      // Clean up socket listeners and go back to menu
      const socket = getSocket();
      socket.removeAllListeners();
      this.scene.start("MenuScene");
    });
  }
}
