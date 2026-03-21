import Phaser from "phaser";
import { getSocket } from "../network/SocketClient";
import { DraftVariant, LobbySettings, ProtocolSet } from "@compile/shared";
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
    const selectedSets = new Set<ProtocolSet>([
      ProtocolSet.MainUnit1,
      ProtocolSet.MainUnit2,
      ProtocolSet.Aux1,
      ProtocolSet.Aux2,
    ]);
    let selectedVariant: DraftVariant = DraftVariant.Limited9;

    const currentLobbySettings = (): LobbySettings => ({
      selectedProtocolSets: [
        ProtocolSet.MainUnit1,
        ProtocolSet.MainUnit2,
        ProtocolSet.Aux1,
        ProtocolSet.Aux2,
      ].filter((setId) => selectedSets.has(setId)),
      draftVariant: selectedVariant,
    });

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
    this.add.text(width / 2 - 230, height * 0.36, "USERNAME", {
      fontSize: "14px", fontFamily: "monospace", color: "#aaaacc",
    }).setOrigin(0.5);
    const usernameBox = this.add.rectangle(width / 2 + 30, height * 0.36, 320, 40, 0x112233).setStrokeStyle(1, 0x3366aa);
    const usernameText = this.add.text(width / 2 + 30, height * 0.36, "", {
      fontSize: "18px", fontFamily: "monospace", color: "#ffffff",
    }).setOrigin(0.5);
    let username = "";

    if ((import.meta as any).env?.DEV) {
      username = `P${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      usernameText.setText(username);
    }

    // Room Code (for joining)
    this.add.text(width / 2 - 230, height * 0.44, "ROOM CODE", {
      fontSize: "14px", fontFamily: "monospace", color: "#aaaacc",
    }).setOrigin(0.5);
    const codeBox = this.add.rectangle(width / 2 + 30, height * 0.44, 320, 40, 0x112233).setStrokeStyle(1, 0x3366aa);
    const codeText = this.add.text(width / 2 + 30, height * 0.44, "", {
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
    const statusText = this.add.text(width / 2, height * 0.30, "", {
      fontSize: "16px", fontFamily: "monospace", color: "#ff6666",
    }).setOrigin(0.5);

    // Copy button for room code — positioned to the right of code textfield
    const copyCodeBtn = this.add.text(width / 2 + 180, height * 0.44, "⧉", {
      fontSize: "20px", fontFamily: "monospace", color: "#00ffcc",
      backgroundColor: "#112233", padding: { x: 6, y: 4 },
    }).setOrigin(0.5).setVisible(false).setInteractive({ useHandCursor: true });
    copyCodeBtn.on("pointerover", () => copyCodeBtn.setColor("#ffffff"));
    copyCodeBtn.on("pointerout", () => copyCodeBtn.setColor("#00ffcc"));
    copyCodeBtn.on("pointerdown", () => {
      if (!generatedRoomCode) return;
      navigator.clipboard.writeText(generatedRoomCode).then(() => {
        copyCodeBtn.setText("✓");
        this.time.delayedCall(1500, () => copyCodeBtn.setText("⧉"));
      });
    });

    // Protocol set selector
    this.add.text(width / 2, height * 0.66, "AVAILABLE PROTOCOL SETS", {
      fontSize: "12px", fontFamily: "monospace", color: "#556677",
    }).setOrigin(0.5);
    const setItems: { setId: ProtocolSet; label: string }[] = [
      { setId: ProtocolSet.MainUnit1, label: "Main Unit 1" },
      { setId: ProtocolSet.MainUnit2, label: "Main Unit 2" },
      { setId: ProtocolSet.Aux1, label: "Aux 1" },
      { setId: ProtocolSet.Aux2, label: "Aux 2" },
    ];
    const setBoxes: Phaser.GameObjects.Rectangle[] = [];
    const setLabels: Phaser.GameObjects.Text[] = [];
    const setW = 138, setH = 30, setGap = 10;
    const totalSetW = setItems.length * setW + (setItems.length - 1) * setGap;
    const setStartX = width / 2 - totalSetW / 2 + setW / 2;

    const refreshSetButtons = () => {
      setItems.forEach(({ setId }, i) => {
        const selected = selectedSets.has(setId);
        setBoxes[i].setFillStyle(selected ? 0x003322 : 0x0a1520)
          .setStrokeStyle(1, selected ? 0x00ffcc : 0x223344);
        setLabels[i].setColor(selected ? "#00ffcc" : "#445566");
      });
    };

    setItems.forEach(({ setId, label }, i) => {
      const x = setStartX + i * (setW + setGap);
      const box = this.add.rectangle(x, height * 0.70, setW, setH, 0x0a1520)
        .setStrokeStyle(1, 0x223344)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(x, height * 0.70, label, {
        fontSize: "11px", fontFamily: "monospace", color: "#445566",
      }).setOrigin(0.5);

      box.on("pointerover", () => box.setStrokeStyle(1, 0x4488aa));
      box.on("pointerout", () => refreshSetButtons());
      box.on("pointerdown", () => {
        const isSelected = selectedSets.has(setId);
        if (isSelected) {
          if (setId === ProtocolSet.MainUnit1 && !selectedSets.has(ProtocolSet.MainUnit2)) {
            statusText.setText("At least one Main Unit must remain selected.");
            return;
          }
          if (setId === ProtocolSet.MainUnit2 && !selectedSets.has(ProtocolSet.MainUnit1)) {
            statusText.setText("At least one Main Unit must remain selected.");
            return;
          }
          selectedSets.delete(setId);
        } else {
          selectedSets.add(setId);
        }
        refreshSetButtons();
      });

      setBoxes.push(box);
      setLabels.push(txt);
    });
    refreshSetButtons();

    // Draft variant selector
    this.add.text(width / 2, height * 0.78, "DRAFT VARIANT", {
      fontSize: "12px", fontFamily: "monospace", color: "#556677",
    }).setOrigin(0.5);
    const variantItems: { variant: DraftVariant; label: string; desc: string }[] = [
      { variant: DraftVariant.Full, label: "Full", desc: "All selected sets are available in the draft." },
      { variant: DraftVariant.Limited9, label: "Limited 9", desc: "Randomly choose 9 from selected sets for the draft." },
      { variant: DraftVariant.Random3, label: "Random 3", desc: "Skip draft and randomize 3 protocols per player." },
    ];
    const variantBoxes: Phaser.GameObjects.Rectangle[] = [];
    const variantLabels: Phaser.GameObjects.Text[] = [];
    const variantDescs: Phaser.GameObjects.Text[] = [];
    let draftVariantLocked = false;
    const variantY0 = height * 0.83;
    const variantGapY = 0.07;

    const refreshVariantButtons = () => {
      variantItems.forEach(({ variant }, i) => {
        const selected = selectedVariant === variant;
        variantBoxes[i].setFillStyle(selected ? 0x00263d : 0x0a1520)
          .setStrokeStyle(1, selected ? 0x33bbff : 0x223344)
          .setAlpha(draftVariantLocked ? 0.55 : 1);
        variantLabels[i].setColor(selected ? "#33bbff" : "#557799");
        variantDescs[i].setColor(selected ? "#9fd9ff" : "#446077");
      });
    };

    variantItems.forEach(({ variant, label, desc }, i) => {
      const y = variantY0 + i * (height * variantGapY);
      const box = this.add.rectangle(width / 2, y, 560, 44, 0x0a1520)
        .setStrokeStyle(1, 0x223344)
        .setInteractive({ useHandCursor: true });
      const title = this.add.text(width / 2 - 250, y - 10, label, {
        fontSize: "13px", fontFamily: "monospace", color: "#557799", fontStyle: "bold",
      }).setOrigin(0, 0.5);
      const detail = this.add.text(width / 2 - 250, y + 10, desc, {
        fontSize: "10px", fontFamily: "monospace", color: "#446077",
      }).setOrigin(0, 0.5);

      box.on("pointerover", () => {
        if (!draftVariantLocked) box.setStrokeStyle(1, 0x4488aa);
      });
      box.on("pointerout", () => refreshVariantButtons());
      box.on("pointerdown", () => {
        if (draftVariantLocked) {
          statusText.setText("Draft variant is locked after room creation.");
          return;
        }
        selectedVariant = variant;
        refreshVariantButtons();
      });

      variantBoxes.push(box);
      variantLabels.push(title);
      variantDescs.push(detail);
    });
    refreshVariantButtons();

    // Buttons
    const btnStyle = { fontSize: "18px", fontFamily: "monospace", color: "#0a0a0f" };

    const createBtn = this.add.rectangle(width / 2 - 100, height * 0.58, 180, 44, 0x00ffcc)
      .setInteractive({ useHandCursor: true });
    this.add.text(width / 2 - 100, height * 0.58, "CREATE ROOM", btnStyle).setOrigin(0.5);

    const joinBtn = this.add.rectangle(width / 2 + 100, height * 0.58, 180, 44, 0x3399ff)
      .setInteractive({ useHandCursor: true });
    this.add.text(width / 2 + 100, height * 0.58, "JOIN ROOM", btnStyle).setOrigin(0.5);

    createBtn.on("pointerdown", () => {
      if (!username.trim()) { statusText.setText("Enter a username first."); return; }
      socket.emit("create_room", { username: username.trim(), lobbySettings: currentLobbySettings() });
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
      codeText.setText(roomCode);
      copyCodeBtn.setVisible(true);
      draftVariantLocked = true;
      refreshVariantButtons();
      statusText.setText("Waiting for opponent…");
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

    socket.on("state_sync", (payload) => {
      this.scene.start("GameScene", { initialPayload: payload, myIndex: myPlayerIndex });
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
      socket.emit("create_room", { username, lobbySettings: currentLobbySettings() });

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
