import fs from "fs";
import path from "path";

const LOG_DIR = path.resolve(process.cwd(), "logs");

export class GameLogger {
  private readonly roomCode: string;
  private readonly lines: string[] = [];
  private readonly filePath: string;

  constructor(roomCode: string) {
    this.roomCode = roomCode;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    this.filePath = path.join(LOG_DIR, `game_${roomCode}_${ts}.log`);
    this.log("GAME_START", `Room ${roomCode} created`);
  }

  log(event: string, detail: string): void {
    const entry = `[${new Date().toISOString()}] [${this.roomCode}] ${event}: ${detail}`;
    this.lines.push(entry);
    console.log(entry);
    // Append to file (sync is fine — log volume is tiny)
    fs.appendFileSync(this.filePath, entry + "\n");
  }

  flush(): void {
    this.log("GAME_END", `Log flushed. Total events: ${this.lines.length}`);
  }
}
