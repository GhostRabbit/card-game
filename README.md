# Compile — Two-Player Card Game

## Dev Setup

### Install
```bash
npm install
```

### Run (one command)
```bash
npm run dev
```

This starts both services with labeled logs:
- `SERVER` on `http://localhost:3000`
- `CLIENT` on `http://localhost:5173`

### Run (two terminals, optional)
```bash
# Terminal 1 — game server (port 3000)
npm run dev:server

# Terminal 2 — Phaser client (port 5173)
npm run dev:client
```

### Quick server overview
```bash
npm run dev:status
```

Shows whether the client and server are currently running, their URLs, and which command to run for anything that is stopped.

### Stop both dev servers
```bash
npm run dev:stop
```

Stops processes listening on the default dev ports (`3000` for server and `5173` for client).

Open **two browser tabs** at `http://localhost:5173`:
1. Tab 1: Enter a username → click **CREATE ROOM** → copy the 6-char code shown.
2. Tab 2: Enter a username → paste the code → click **JOIN ROOM**.
3. Both tabs enter the draft. After picking 3 protocols each, the game starts.

## How to Play
See [l2p-compile.md](l2p-compile.md) for the full rules summary.

**Quick summary:**
- Draft 3 protocols; your deck = 6 cards per protocol (18 total), shuffled.
- Each turn: resolve Start effects → check Control → check Compile → take Action (play 1 card or Refresh) → Clear Cache to 5 → resolve End effects.
- Playing **face-up**: card must match that line's protocol. Playing **face-down**: any line.
- **Compile** a line when its face-up value ≥ 10 AND higher than opponent's same line. Clear the line, flip protocol to Compiled.
- First to Compile all 3 protocols wins.

## Project Structure
```
compile-game/
├── shared/          — Shared TypeScript types (SocketEvents, GameState, etc.)
├── server/          — Node.js + Express + Socket.io game server
└── client/          — Phaser.js browser game client
```
