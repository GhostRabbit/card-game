import Phaser from "phaser";
import { CardFace, CardInstance } from "@compile/shared";
import { CARD_DEFS_CLIENT, PROTOCOL_NAMES_CLIENT } from "../data/cardDefs";
import { CardSprite } from "../objects/CardSprite";

type ProtocolEntry = { protocolId: string; name: string; prefix: string };

export class CardPreviewScene extends Phaser.Scene {
  private sidebarWidth = 250;
  private contentGroup!: Phaser.GameObjects.Container;
  private contentHeight = 0;
  private scrollY = 0;

  constructor() {
    super("CardPreviewScene");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#0f1722");

    const protocols = this.getSortedProtocols();
    const params = new URLSearchParams(window.location.search);
    const requestedProtocolId = params.get("protocol") ?? protocols[0]?.protocolId;
    const selected = protocols.find((p) => p.protocolId === requestedProtocolId) ?? protocols[0];

    if (!selected) {
      this.add.text(30, 30, "No protocols found.", {
        fontSize: "20px",
        fontFamily: "monospace",
        color: "#ffffff",
      });
      return;
    }

    this.renderChrome(selected.name);
    this.renderSidebar(protocols, selected.protocolId);
    this.renderTable(selected);
    this.enableScroll();
  }

  private renderChrome(protocolName: string): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(this.sidebarWidth / 2, h / 2, this.sidebarWidth, h, 0x111827).setStrokeStyle(1, 0x334155);
    this.add.rectangle((w + this.sidebarWidth) / 2, h / 2, w - this.sidebarWidth, h, 0x0b1220);

    this.add.text(16, 14, "Card Preview Pages", {
      fontSize: "18px",
      fontFamily: "monospace",
      color: "#f8fafc",
      fontStyle: "bold",
    });

    this.add.text(this.sidebarWidth + 24, 14, `Protocol: ${protocolName}`, {
      fontSize: "18px",
      fontFamily: "monospace",
      color: "#e2e8f0",
      fontStyle: "bold",
    });

    this.add.text(this.sidebarWidth + 24, 42, "Columns: protocol cards | Rows: Zoomed / In hand / Played in line", {
      fontSize: "12px",
      fontFamily: "monospace",
      color: "#94a3b8",
    });
  }

  private renderSidebar(protocols: ProtocolEntry[], selectedProtocolId: string): void {
    this.add.text(16, 52, "Index (A-Z)", {
      fontSize: "14px",
      fontFamily: "monospace",
      color: "#cbd5e1",
      fontStyle: "bold",
    });

    protocols.forEach((p, i) => {
      const y = 80 + i * 20;
      const isActive = p.protocolId === selectedProtocolId;
      const label = `${p.name} (${p.prefix.toUpperCase()})`;
      const link = this.add.text(16, y, label, {
        fontSize: "12px",
        fontFamily: "monospace",
        color: isActive ? "#22d3ee" : "#93c5fd",
        fontStyle: isActive ? "bold" : "normal",
      });

      if (!isActive) {
        link.setInteractive({ useHandCursor: true });
        link.on("pointerover", () => link.setColor("#ffffff"));
        link.on("pointerout", () => link.setColor("#93c5fd"));
        link.on("pointerdown", () => {
          const next = new URLSearchParams(window.location.search);
          next.set("preview", "1");
          next.set("protocol", p.protocolId);
          window.location.search = next.toString();
        });
      }
    });
  }

  private renderTable(selected: ProtocolEntry): void {
    const contentX = this.sidebarWidth + 24;
    const topY = 80;
    const rightPad = 24;
    const tableW = this.scale.width - contentX - rightPad;

    const cardIds = [...CARD_DEFS_CLIENT.keys()]
      .filter((id) => id.startsWith(`${selected.prefix}_`))
      .sort((a, b) => {
        const av = Number(a.split("_")[1]);
        const bv = Number(b.split("_")[1]);
        return av - bv;
      });

    const rows = [
      { label: "Zoomed card", scale: 1.5, height: 230 },
      { label: "In hand card", scale: 1.0, height: 190 },
      { label: "Played in line card", scale: 0.52, height: 190 },
    ] as const;

    const colMode = 150;
    const cardCol = Math.max(150, Math.floor((tableW - colMode) / Math.max(cardIds.length, 1)));
    const actualTableW = colMode + cardCol * cardIds.length;

    this.contentGroup = this.add.container(0, 0);

    const g = this.add.graphics();
    g.lineStyle(1, 0x334155, 1);
    g.fillStyle(0x0f1a2d, 0.9);

    g.fillRect(contentX, topY, actualTableW, 34);
    g.strokeRect(contentX, topY, actualTableW, 34);

    this.contentGroup.add(this.add.text(contentX + 8, topY + 9, "Mode", {
      fontSize: "12px",
      fontFamily: "monospace",
      color: "#e2e8f0",
      fontStyle: "bold",
    }));

    cardIds.forEach((id, idx) => {
      const def = CARD_DEFS_CLIENT.get(id);
      const x = contentX + colMode + idx * cardCol;
      g.lineBetween(x, topY, x, topY + 34);
      this.contentGroup.add(this.add.text(x + 8, topY + 9, `${id} (${def?.value ?? "?"})`, {
        fontSize: "12px",
        fontFamily: "monospace",
        color: "#e2e8f0",
        fontStyle: "bold",
      }));
    });

    const endX = contentX + actualTableW;
    g.lineBetween(endX, topY, endX, topY + 34);

    const startRowsY = topY + 34;
    let yOffset = 0;
    rows.forEach((row, rowIdx) => {
      const rowTop = startRowsY + yOffset;
      g.strokeRect(contentX, rowTop, actualTableW, row.height);
      g.lineBetween(contentX + colMode, rowTop, contentX + colMode, rowTop + row.height);

      this.contentGroup.add(this.add.text(contentX + 8, rowTop + 10, row.label, {
        fontSize: "12px",
        fontFamily: "monospace",
        color: "#cbd5e1",
      }));

      cardIds.forEach((id, idx) => {
        const colLeft = contentX + colMode + idx * cardCol;
        g.lineBetween(colLeft, rowTop, colLeft, rowTop + row.height);

        const card = this.makeCardInstance(`${id}-${row.label}-${idx}`, id);
        const cx = colLeft + cardCol / 2;
        const cy = rowTop + row.height / 2 + 6;
        const sprite = new CardSprite(this, cx, cy, card, CARD_DEFS_CLIENT, false, row.scale);
        this.contentGroup.add(sprite);
      });

      g.lineBetween(endX, rowTop, endX, rowTop + row.height);
      yOffset += row.height;
    });

    this.contentGroup.add(g);

    this.contentHeight = startRowsY + yOffset + 20;
  }

  private enableScroll(): void {
    const viewportTop = 80;
    const viewportBottom = this.scale.height - 12;
    const maxScroll = Math.max(0, this.contentHeight - viewportBottom + 10);

    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _dx: number, dy: number) => {
      this.scrollY = Phaser.Math.Clamp(this.scrollY + dy * 0.5, 0, maxScroll);
      this.contentGroup.setY(-this.scrollY);
    });

    if (maxScroll > 0) {
      this.add.text(this.sidebarWidth + 24, this.scale.height - 18, "Mouse wheel to scroll", {
        fontSize: "11px",
        fontFamily: "monospace",
        color: "#64748b",
      }).setOrigin(0, 1);
    }
  }

  private makeCardInstance(instanceId: string, defId: string): CardInstance {
    return {
      instanceId,
      defId,
      face: CardFace.FaceUp,
    };
  }

  private getSortedProtocols(): ProtocolEntry[] {
    const entries = [...PROTOCOL_NAMES_CLIENT.entries()].map(([protocolId, name]) => ({
      protocolId,
      name,
      prefix: protocolId.replace(/^proto_/, ""),
    }));

    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
  }
}
