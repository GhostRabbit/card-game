import Phaser from "phaser";
import { getSocket } from "../network/SocketClient";
import { GameMode } from "@compile/shared";
import { createMockView } from "../data/mockGameState";

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("MenuScene");
  }

  create(): void {
    const { width, height } = this.scale;
    const socket = getSocket();
    let myPlayerIndex: 0 | 1 = 0;
    let generatedRoomCode = "";
    let selectedMode: GameMode = GameMode.AllProtocols;

    // Title
    this.add.text(width / 2, height * 0.12, "COMPILE", {
      fontSize: "64px",
      fontFamily: "monospace",
      color: "#00ffcc",
      fontStyle: "bold",
    }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.22, "A Two-Player Card Game", {
      fontSize: "20px",
      fontFamily: "monospace",
      color: "#6688aa",
    }).setOrigin(0.5);

    // Username
    this.add.text(width / 2 - 160, height * 0.36, "USERNAME", {
      fontSize: "14px", fontFamily: "monospace", color: "#aaaacc",
    }).setOrigin(0.5);
    const usernameBox = this.add.rectangle(width / 2, height * 0.36, 320, 40, 0x112233).setStrokeStyle(1, 0x3366aa);
    const usernameText = this.add.text(width / 2, height * 0.36, "", {
      fontSize: "18px", fontFamily: "monospace", color: "#ffffff",
    }).setOrigin(0.5);
    let username = "";

    // Room Code (for joining)
    this.add.text(width / 2 - 160, height * 0.50, "ROOM CODE", {
      fontSize: "14px", fontFamily: "monospace", color: "#aaaacc",
    }).setOrigin(0.5);
    const codeBox = this.add.rectangle(width / 2, height * 0.50, 320, 40, 0x112233).setStrokeStyle(1, 0x3366aa);
    const codeText = this.add.text(width / 2, height * 0.50, "", {
      fontSize: "18px", fontFamily: "monospace", color: "#ffdd88",
    }).setOrigin(0.5);
    let roomInput = "";
    let activeInput: "username" | "code" = "username";

    // Highlight active input
    const updateHighlight = () => {
      usernameBox.setStrokeStyle(1, activeInput === "username" ? 0x00ffcc : 0x3366aa);
      codeBox.setStrokeStyle(1, activeInput === "code" ? 0x00ffcc : 0x3366aa);
    };
    usernameBox.setInteractive().on("pointerdown", () => { activeInput = "username"; updateHighlight(); });
    codeBox.setInteractive().on("pointerdown", () => { activeInput = "code"; updateHighlight(); });
    updateHighlight();

    // Keyboard input
    // Native paste handler — fires before Phaser sees the key, so we read the clipboard directly
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") ?? "";
      if (activeInput === "username") {
        username = (username + text).slice(0, 16);
        usernameText.setText(username);
      } else {
        roomInput = (roomInput + text).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
        codeText.setText(roomInput);
      }
      e.preventDefault();
    };
    window.addEventListener("paste", onPaste);
    // Clean up when scene shuts down
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener("paste", onPaste));

    this.input.keyboard!.on("keydown", (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        activeInput = activeInput === "username" ? "code" : "username";
        updateHighlight();
        return;
      }
      if (event.key === "Backspace") {
        if (activeInput === "username") { username = username.slice(0, -1); usernameText.setText(username); }
        else { roomInput = roomInput.slice(0, -1); codeText.setText(roomInput); }
        return;
      }
      // Ignore Ctrl/Cmd+V — handled by the paste event above
      if (event.key === "v" && (event.ctrlKey || event.metaKey)) return;
      if (event.key.length === 1) {
        if (activeInput === "username" && username.length < 16) {
          username += event.key;
          usernameText.setText(username);
        } else if (activeInput === "code" && roomInput.length < 6) {
          roomInput += event.key.toUpperCase();
          codeText.setText(roomInput);
        }
      }
    });

    // Status text
    const statusText = this.add.text(width / 2, height * 0.68, "", {
      fontSize: "16px", fontFamily: "monospace", color: "#ff6666",
    }).setOrigin(0.5);

    // Generated code display + copy button
    const generatedCodeLabel = this.add.text(width / 2 - 160, height * 0.78, "", {
      fontSize: "22px", fontFamily: "monospace", color: "#00ffcc",
    }).setOrigin(0, 0.5);

    const copyBtn = this.add.text(width / 2 + 180, height * 0.78, "", {
      fontSize: "20px", fontFamily: "monospace", color: "#00ffcc",
      backgroundColor: "#112233", padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setVisible(false);
    copyBtn.on("pointerover", () => copyBtn.setColor("#ffffff"));
    copyBtn.on("pointerout", () => copyBtn.setColor("#00ffcc"));
    copyBtn.on("pointerdown", () => {
      if (!generatedRoomCode) return;
      navigator.clipboard.writeText(generatedRoomCode).then(() => {
        copyBtn.setText("✓");
        this.time.delayedCall(1500, () => copyBtn.setText("⧉"));
      });
    });

    // Game mode selector (shown to host only — join side inherits the host's choice)
    const modes: { mode: GameMode; label: string; desc: string }[] = [
      { mode: GameMode.AllProtocols, label: "All Protocols",  desc: "All available protocols (grows with new units)" },
      { mode: GameMode.MainUnit1,    label: "Main Unit 1",    desc: "15 original protocols only" },
      { mode: GameMode.MainUnit2,    label: "Main Unit 2",    desc: "Coming soon — 15 new protocols" },
      { mode: GameMode.Random9,      label: "Random 9",       desc: "9 protocols chosen at random" },
    ];
    this.add.text(width / 2, height * 0.635, "GAME MODE", {
      fontSize: "11px", fontFamily: "monospace", color: "#556677",
    }).setOrigin(0.5);
    const modeBoxes: Phaser.GameObjects.Rectangle[] = [];
    const modeLabels: Phaser.GameObjects.Text[] = [];
    const modeW = 148, modeH = 28, modeGap = 6;
    const totalModeW = modes.length * modeW + (modes.length - 1) * modeGap;
    const modeStartX = width / 2 - totalModeW / 2 + modeW / 2;
    modes.forEach(({ mode, label }, i) => {
      const mx = modeStartX + i * (modeW + modeGap);
      const selected = mode === selectedMode;
      const box = this.add.rectangle(mx, height * 0.67, modeW, modeH,
        selected ? 0x003322 : 0x0a1520)
        .setStrokeStyle(1, selected ? 0x00ffcc : 0x223344)
        .setInteractive({ useHandCursor: true });
      const lbl = this.add.text(mx, height * 0.67, label, {
        fontSize: "11px", fontFamily: "monospace",
        color: selected ? "#00ffcc" : "#445566",
      }).setOrigin(0.5);
      box.on("pointerover", () => { if (mode !== selectedMode) box.setStrokeStyle(1, 0x4488aa); });
      box.on("pointerout",  () => { if (mode !== selectedMode) box.setStrokeStyle(1, 0x223344); });
      box.on("pointerdown", () => {
        selectedMode = mode;
        modeBoxes.forEach((b, j) => {
          const sel = modes[j].mode === selectedMode;
          b.setFillStyle(sel ? 0x003322 : 0x0a1520).setStrokeStyle(1, sel ? 0x00ffcc : 0x223344);
          modeLabels[j].setColor(sel ? "#00ffcc" : "#445566");
        });
      });
      modeBoxes.push(box);
      modeLabels.push(lbl);
    });

    // Buttons
    const btnStyle = { fontSize: "18px", fontFamily: "monospace", color: "#0a0a0f" };

    const createBtn = this.add.rectangle(width / 2 - 100, height * 0.60, 180, 44, 0x00ffcc)
      .setInteractive({ useHandCursor: true });
    this.add.text(width / 2 - 100, height * 0.60, "CREATE ROOM", btnStyle).setOrigin(0.5);

    const joinBtn = this.add.rectangle(width / 2 + 100, height * 0.60, 180, 44, 0x3399ff)
      .setInteractive({ useHandCursor: true });
    this.add.text(width / 2 + 100, height * 0.60, "JOIN ROOM", btnStyle).setOrigin(0.5);

    createBtn.on("pointerdown", () => {
      if (!username.trim()) { statusText.setText("Enter a username first."); return; }
      socket.emit("create_room", { username: username.trim(), gameMode: selectedMode });
    });
    joinBtn.on("pointerdown", () => {
      if (!username.trim()) { statusText.setText("Enter a username first."); return; }
      if (roomInput.length !== 6) { statusText.setText("Room code must be 6 characters."); return; }
      socket.emit("join_room", { username: username.trim(), roomCode: roomInput });
    });

    // Socket events
    socket.on("room_created", ({ roomCode, playerIndex }) => {
      myPlayerIndex = playerIndex;
      generatedRoomCode = roomCode;
      statusText.setText("Waiting for opponent…");
      generatedCodeLabel.setText(`Share this code: ${roomCode}`);
      copyBtn.setText("⧉").setVisible(true).setInteractive({ useHandCursor: true });
    });

    socket.on("room_joined", ({ playerIndex }) => {
      myPlayerIndex = playerIndex;
      statusText.setText("Joined! Starting draft…");
    });

    socket.on("room_error", ({ message }) => {
      statusText.setText(message);
    });

    socket.on("game_starting", ({ draftState }) => {
      this.scene.start("DraftScene", { draftState, myIndex: myPlayerIndex });
    });

    // ── DEV shortcut ───────────────────────────────────────────────────────
    const devBtn = this.add.text(width - 12, height - 12,
      "[DEV] Fixed Mock", {
        fontSize: "12px", fontFamily: "monospace",
        color: "#334455",
        backgroundColor: "#0a1520",
        padding: { x: 6, y: 3 },
      }).setOrigin(1, 1).setInteractive({ useHandCursor: true });
    devBtn.on("pointerover", () => devBtn.setColor("#00ffcc"));
    devBtn.on("pointerout",  () => devBtn.setColor("#334455"));
    devBtn.on("pointerdown", () => {
      this.scene.start("GameScene", {
        initialPayload: createMockView(),
        myIndex: 0,
        devMode: true,
      });
    });

    const devRandomBtn = this.add.text(width - 12, height - 36,
      "[DEV] Random Mock", {
        fontSize: "12px", fontFamily: "monospace",
        color: "#334455",
        backgroundColor: "#0a1520",
        padding: { x: 6, y: 3 },
      }).setOrigin(1, 1).setInteractive({ useHandCursor: true });
    devRandomBtn.on("pointerover", () => devRandomBtn.setColor("#00ffcc"));
    devRandomBtn.on("pointerout",  () => devRandomBtn.setColor("#334455"));
    devRandomBtn.on("pointerdown", () => {
      this.scene.start("MockGameScene");
    });

    // ── Two-tab server test via URL params ─────────────────────────────────
    // ?host        → auto-create a room as "P0"
    // ?join=CODE   → auto-join room CODE as "P1"
    const params = new URLSearchParams(window.location.search);
    if (params.has("host")) {
      username = "P0";
      usernameText.setText(username);
      socket.emit("create_room", { username, gameMode: selectedMode });

      // After room is created, show a "Open tab 2" link that auto-joins
      socket.once("room_created", ({ roomCode }) => {
        const joinUrl = `${window.location.origin}${window.location.pathname}?join=${roomCode}`;
        const linkLabel = this.add.text(width / 2, height * 0.88,
          `Tab 2: ${joinUrl}`, {
            fontSize: "11px", fontFamily: "monospace", color: "#00ffcc",
            backgroundColor: "#0a1520", padding: { x: 6, y: 4 },
          }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        linkLabel.on("pointerdown", () => {
          navigator.clipboard.writeText(joinUrl);
          window.open(joinUrl, "_blank");
        });
        linkLabel.on("pointerover", () => linkLabel.setColor("#ffffff"));
        linkLabel.on("pointerout",  () => linkLabel.setColor("#00ffcc"));
        this.add.text(width / 2, height * 0.94,
          "(click to open tab 2 + copy URL)", {
            fontSize: "10px", fontFamily: "monospace", color: "#445566",
          }).setOrigin(0.5);
      });
    } else if (params.has("join")) {
      const code = params.get("join")!.toUpperCase();
      username = "P1";
      usernameText.setText(username);
      roomInput = code;
      codeText.setText(code);
      socket.emit("join_room", { username, roomCode: code });
    }
  }
}
