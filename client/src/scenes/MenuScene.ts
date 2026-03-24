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

    const theme = {
      bgTop: 0x060912,
      bgBottom: 0x0b1322,
      panel: 0x0d1626,
      panelStroke: 0x2f5e7c,
      accentPrimary: 0x1ac7a1,
      accentSecondary: 0x4fb3ff,
      textMain: "#eaf4ff",
      textMuted: "#89a6bf",
      inputBg: 0x111f31,
      inputStrokeIdle: 0x356284,
      inputStrokeActive: 0x39f0c9,
    };

    const login = {
      panelCx: width / 2,
      panelCy: Math.round(height * 0.37),
      panelW: 760,
      panelH: 300,
      titleY: Math.round(height * 0.10),
      subtitleY: Math.round(height * 0.17),
      statusY: Math.round(height * 0.25),
      userY: Math.round(height * 0.33),
      codeY: Math.round(height * 0.42),
      buttonY: Math.round(height * 0.52),
      labelX: width / 2 - 205,
      inputX: width / 2 + 70,
      inputW: 360,
      inputH: 44,
    };

    const currentLobbySettings = (): LobbySettings => ({
      selectedProtocolSets: [
        ProtocolSet.MainUnit1,
        ProtocolSet.MainUnit2,
        ProtocolSet.Aux1,
        ProtocolSet.Aux2,
      ].filter((setId) => selectedSets.has(setId)),
      draftVariant: selectedVariant,
    });

    // Atmospheric background + login panel
    this.add.rectangle(width / 2, height / 2, width, height, theme.bgBottom);
    this.add.circle(width * 0.2, height * 0.18, 220, 0x12314f, 0.22);
    this.add.circle(width * 0.82, height * 0.22, 200, 0x0b5f63, 0.17);
    this.add.rectangle(width / 2, height / 2, width, 220, theme.bgTop, 0.35);

    const loginPanel = this.add.rectangle(login.panelCx, login.panelCy, login.panelW, login.panelH, theme.panel, 0.9)
      .setStrokeStyle(2, theme.panelStroke);
    this.add.rectangle(login.panelCx, login.panelCy - login.panelH / 2 + 28, login.panelW - 6, 48, 0x0f2233, 0.95)
      .setStrokeStyle(1, 0x2a7a8f);
    this.add.rectangle(login.panelCx - login.panelW / 2 + 4, login.panelCy, 4, login.panelH - 8, theme.accentPrimary, 0.9);
    this.add.rectangle(login.panelCx + login.panelW / 2 - 4, login.panelCy, 4, login.panelH - 8, theme.accentSecondary, 0.9);
    loginPanel.setAlpha(0.95);

    this.add.text(width / 2, login.titleY, "COMPILE", {
      fontSize: "64px",
      fontFamily: "monospace",
      color: "#cffff0",
      fontStyle: "bold",
      stroke: "#05181a",
      strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(width / 2, login.subtitleY, "A Two-Player Card Game", {
      fontSize: "20px",
      fontFamily: "monospace",
      color: "#95b7d8",
      fontStyle: "bold",
    }).setOrigin(0.5);

    // Username
    this.add.text(login.labelX, login.userY, "USERNAME", {
      fontSize: "14px", fontFamily: "monospace", color: theme.textMain, fontStyle: "bold",
    }).setOrigin(0.5);
    const usernameBox = this.add.rectangle(login.inputX, login.userY, login.inputW, login.inputH, theme.inputBg)
      .setStrokeStyle(2, theme.inputStrokeIdle);
    const usernameText = this.add.text(login.inputX, login.userY, "", {
      fontSize: "18px", fontFamily: "monospace", color: "#ffffff", fontStyle: "bold",
    }).setOrigin(0.5);
    let username = "";

    if ((import.meta as any).env?.DEV) {
      username = `P${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      usernameText.setText(username);
    }

    // Room Code (for joining)
    this.add.text(login.labelX, login.codeY, "ROOM CODE", {
      fontSize: "14px", fontFamily: "monospace", color: theme.textMain, fontStyle: "bold",
    }).setOrigin(0.5);
    const codeBox = this.add.rectangle(login.inputX, login.codeY, login.inputW, login.inputH, theme.inputBg)
      .setStrokeStyle(2, theme.inputStrokeIdle);
    const codeText = this.add.text(login.inputX, login.codeY, "", {
      fontSize: "18px", fontFamily: "monospace", color: "#ffe3a0", fontStyle: "bold",
    }).setOrigin(0.5);
    let roomInput = "";
    let activeInput: "username" | "code" = "username";

    // Highlight active input
    const updateHighlight = () => {
      usernameBox.setStrokeStyle(2, activeInput === "username" ? theme.inputStrokeActive : theme.inputStrokeIdle);
      codeBox.setStrokeStyle(2, activeInput === "code" ? theme.inputStrokeActive : theme.inputStrokeIdle);
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
    const statusText = this.add.text(width / 2, login.statusY, "", {
      fontSize: "16px", fontFamily: "monospace", color: "#ff8f80", fontStyle: "bold",
    }).setOrigin(0.5);

    // Copy button for room code — positioned to the right of code textfield
    const copyCodeBtn = this.add.text(width / 2 + 210, login.codeY, "⧉", {
      fontSize: "20px", fontFamily: "monospace", color: "#c3fff1",
      backgroundColor: "#163044", padding: { x: 7, y: 5 },
    }).setOrigin(0.5).setVisible(false).setInteractive({ useHandCursor: true });
    copyCodeBtn.on("pointerover", () => copyCodeBtn.setColor("#ffffff"));
    copyCodeBtn.on("pointerout", () => copyCodeBtn.setColor("#c3fff1"));
    copyCodeBtn.on("pointerdown", () => {
      if (!generatedRoomCode) return;
      navigator.clipboard.writeText(generatedRoomCode).then(() => {
        copyCodeBtn.setText("✓");
        this.time.delayedCall(1500, () => copyCodeBtn.setText("⧉"));
      });
    });

    // Protocol set selector
    this.add.text(width / 2, height * 0.64, "AVAILABLE PROTOCOL SETS", {
      fontSize: "12px", fontFamily: "monospace", color: theme.textMuted,
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
      const box = this.add.rectangle(x, height * 0.68, setW, setH, 0x0a1520)
        .setStrokeStyle(1, 0x223344)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(x, height * 0.68, label, {
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
    this.add.text(width / 2, height * 0.75, "DRAFT VARIANT", {
      fontSize: "12px", fontFamily: "monospace", color: theme.textMuted,
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
    const variantY0 = height * 0.79;
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
    const btnStyle = { fontSize: "18px", fontFamily: "monospace", color: "#041114", fontStyle: "bold" };

    const createBtn = this.add.rectangle(width / 2 - 110, login.buttonY, 200, 48, 0x26d7af)
      .setInteractive({ useHandCursor: true });
    createBtn.setStrokeStyle(2, 0x8fffe7);
    this.add.text(width / 2 - 110, login.buttonY, "CREATE ROOM", btnStyle).setOrigin(0.5);

    const joinBtn = this.add.rectangle(width / 2 + 110, login.buttonY, 200, 48, 0x49a8ff)
      .setInteractive({ useHandCursor: true });
    joinBtn.setStrokeStyle(2, 0x9fd2ff);
    this.add.text(width / 2 + 110, login.buttonY, "JOIN ROOM", btnStyle).setOrigin(0.5);

    createBtn.on("pointerover", () => createBtn.setFillStyle(0x36e9c1));
    createBtn.on("pointerout", () => createBtn.setFillStyle(0x26d7af));
    joinBtn.on("pointerover", () => joinBtn.setFillStyle(0x62bbff));
    joinBtn.on("pointerout", () => joinBtn.setFillStyle(0x49a8ff));

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
