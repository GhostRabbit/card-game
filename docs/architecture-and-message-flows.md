# Compile Architecture And Message Flows

This document is a practical map of how the project is structured today: which classes/modules own each responsibility, how the main runtime flows work, and what messages move across the socket boundary.

It is intentionally narrower than [docs/TECHNICAL.md](c:\code\compile-game\docs\TECHNICAL.md): this file focuses on structure, flow, and network behavior rather than setup.

## 1. Overall Structure

The codebase is split into three main packages:

| Package | Role | Main responsibility |
|---|---|---|
| `shared/` | Contract layer | Types, enums, view models, and socket event signatures used by both client and server |
| `server/` | Authoritative rules engine | Owns room lifecycle, draft, game state, effect resolution, validation, and win detection |
| `client/` | Phaser presentation layer | Sends player intent, renders the masked server view, and manages scene/UI interaction |

The design is deliberately server-authoritative:

- The client never computes the true game state.
- The client sends intent such as `play_card`, `draft_pick`, or `resolve_effect`.
- The server validates the action, mutates the state, derives a per-player masked view, and pushes `state_sync` back to each player.

## 2. Main Classes And Modules

### Shared contract

The shared package is the source of truth for the network boundary and the game-view model.

Core file:

- [shared/src/index.ts](c:\code\compile-game\shared\src\index.ts)

Important exported concepts:

- `ServerToClientEvents` and `ClientToServerEvents`: the typed socket API.
- `DraftState`: the full draft UI model.
- `PlayerView`: the masked gameplay view each player receives.
- `PendingEffect`: the effect-resolution unit shown in the HUD and acted on by the owning player.
- `TurnPhase`, `ProtocolStatus`, `CardFace`, `DraftVariant`, `ProtocolSet`: enums that keep both sides aligned.

Why it matters:

- The server and client compile against the same payload types.
- A new field on `PlayerView` or a new socket event must be updated once in `shared/` and then handled on both sides.

### Server side

#### Socket bootstrap

Core file:

- [server/src/index.ts](c:\code\compile-game\server\src\index.ts)

Responsibility:

- Starts Express and Socket.io.
- Listens for socket events.
- Finds the current room for a socket and delegates to the room instance.

This file is intentionally thin. It is transport wiring, not rules logic.

#### RoomManager

Core file:

- [server/src/room/RoomManager.ts](c:\code\compile-game\server\src\room\RoomManager.ts)

Responsibility:

- Creates room codes.
- Tracks `socket.id -> roomCode`.
- Creates and looks up `Room` instances.
- Handles join failures and empty-room cleanup on disconnect.

Think of `RoomManager` as the multiplayer directory service.

#### Room

Core file:

- [server/src/room/Room.ts](c:\code\compile-game\server\src\room\Room.ts)

Responsibility:

- Owns one match from lobby to game over.
- Holds the two player slots.
- Starts the draft or direct random-3 game.
- Receives player actions and calls into the game engine.
- Broadcasts per-player `state_sync` payloads.
- Schedules visible turn-phase transitions.
- Emits `game_over` when a winner is set.

This is the main orchestration class on the server. It is the boundary between network/session behavior and pure game-state mutation.

Key patterns inside `Room`:

- Validation failures emit `action_rejected` immediately.
- Successful mutations are followed by `broadcastState()` or a timed phase sequence.
- `buildPlayerView(...)` is called separately for each player before `state_sync` is emitted.

#### DraftEngine

Primary usage is imported into `Room` from:

- `server/src/game/DraftEngine.ts`

Responsibility:

- Creates draft pools.
- Applies picks in the enforced pick order.
- Builds the final deck from protocol picks.
- Shuffles deck contents.

This module is a state transformer, not a network component.

#### GameEngine

Core file:

- [server/src/game/GameEngine.ts](c:\code\compile-game\server\src\game\GameEngine.ts)

Responsibility:

- Defines the full authoritative in-memory state via `ServerGameState`.
- Applies core actions such as `playCard`, `refresh`, and compile selection.
- Computes line values and passive effects.
- Advances turn phases.
- Manages internal effect-resolution stack/context.
- Draws, discards, and updates player state.

Important internal state beyond the shared `GameState`:

- Full hidden decks and trashes.
- `effectQueue`: queued active effects waiting to execute or be confirmed.
- `resolutionStack`: explicit resume stack for nested effect/phase flow.
- `pendingBonusPlay`, `pendingControlReorder`, reveal flags, and compile-related flags.

#### CardEffects

Core file:

- [server/src/game/CardEffects.ts](c:\code\compile-game\server\src\game\CardEffects.ts)

Responsibility:

- Converts card data into queued `PendingEffect` entries.
- Executes active effect handlers.
- Triggers cover-related hooks.
- Resolves effect chains in a deterministic order.

This module is the rules dispatcher for card text.

Current design pattern:

- Triggered effects are queued.
- Non-interactive effects can resolve immediately.
- Interactive effects switch the game into `TurnPhase.EffectResolution` and wait for a `resolve_effect` message.
- Passive effects are not queued; they are evaluated at specific rule hook points such as `lineValue(...)` or play validation.

#### StateView

Core file:

- [server/src/game/StateView.ts](c:\code\compile-game\server\src\game\StateView.ts)

Responsibility:

- Converts `ServerGameState` into a `PlayerView` for one player.
- Masks opponent face-down cards as `{ instanceId, hidden: true }`.
- Exposes only the current player-facing pending effect while still providing observer info through `opponentPendingEffect`.
- Limits visible trash history to a recent window while keeping exact sizes.

This file is the security and UX projection layer between the server's real state and the client's allowed knowledge.

### Client side

#### main.ts

Core file:

- [client/src/main.ts](c:\code\compile-game\client\src\main.ts)

Responsibility:

- Boots Phaser.
- Registers scenes.
- Switches into normal menu mode, test mode, or preview mode based on URL query parameters.

#### SocketClient

Core file:

- [client/src/network/SocketClient.ts](c:\code\compile-game\client\src\network\SocketClient.ts)

Responsibility:

- Provides a singleton typed Socket.io client.
- Keeps the client-side network entry simple: scenes call `getSocket()` and then emit/listen.

#### MenuScene

Core file:

- [client/src/scenes/MenuScene.ts](c:\code\compile-game\client\src\scenes\MenuScene.ts)

Responsibility:

- Collects username and room code.
- Lets the player choose protocol sets and draft variant.
- Emits `create_room` or `join_room`.
- Transitions into `DraftScene` or directly into game flow based on server events.

#### DraftScene

Core file:

- [client/src/scenes/DraftScene.ts](c:\code\compile-game\client\src\scenes\DraftScene.ts)

Responsibility:

- Renders the draft pool and pick order.
- Receives `draft_updated` and `draft_done`.
- Emits `draft_pick` when the local player chooses a protocol.
- Starts `GameScene` when the first `state_sync` arrives.

#### GameScene

Core file:

- [client/src/scenes/GameScene.ts](c:\code\compile-game\client\src\scenes\GameScene.ts)

Responsibility:

- Renders the full board, hand, piles, focus panel, status lane, and effect HUD.
- Tracks the local transient selection state needed to build player intents.
- Emits `play_card`, `compile_line`, `refresh`, `resolve_effect`, and `resolve_control_reorder`.
- Re-renders entirely from the latest server `PlayerView`.

This is the main client scene, but it is still a view/controller layer. It does not own authoritative rules.

#### Reusable client renderers

Representative files:

- [client/src/objects/CardSprite.ts](c:\code\compile-game\client\src\objects\CardSprite.ts)
- `client/src/scenes/ui/effectResolutionRenderer.ts`
- `client/src/scenes/ui/focusPanelRenderers.ts`

Responsibility:

- Encapsulate rendering for cards, focus panels, and effect-resolution HUD fragments.
- Keep `GameScene` from becoming even larger while preserving a single server-driven state model.

## 3. Runtime Ownership Model

The most important structural rule in the codebase is this:

- `Room` owns the match lifecycle.
- `GameEngine` owns the authoritative mutable game state.
- `CardEffects` owns card-effect execution semantics.
- `StateView` owns what each player is allowed to see.
- `GameScene` owns rendering and local click-selection state.
- `shared/` owns the contract between both sides.

If a bug is about legality, hidden information, or effect order, the fix usually belongs on the server. If a bug is about selection UX or display, the fix usually belongs on the client. If both sides disagree about payload shape, the fix belongs in `shared/` first.

## 4. Main Flows

### Flow A: Create room and start match

1. The browser loads Phaser through [client/src/main.ts](c:\code\compile-game\client\src\main.ts).
2. `MenuScene` collects username and lobby settings.
3. The client emits `create_room` or `join_room`.
4. [server/src/index.ts](c:\code\compile-game\server\src\index.ts) routes the event to `RoomManager`.
5. `RoomManager` creates or finds a `Room`.
6. Once two players are present, `Room.startDraft()` begins the draft or skips directly to `startGame()` for the random-3 variant.

### Flow B: Draft

1. The server emits `game_starting { draftState }`.
2. `DraftScene` renders available protocols and whose pick it is.
3. A player emits `draft_pick { protocolId }`.
4. `Room.handleDraftPick(...)` calls `applyDraftPick(...)`.
5. The server emits either:
   - `draft_updated { draftState }` after intermediate picks, or
   - `draft_done { draftState }` after the last pick.
6. `Room.startGame(...)` builds decks, deals opening hands, creates `ServerGameState`, runs `processAutoPhases(...)`, and starts broadcasting `state_sync`.

### Flow C: Normal action turn

1. The active player sees an `Action` phase in `GameScene`.
2. The client emits one of:
   - `play_card`
   - `compile_line`
   - `refresh`
3. `Room` validates socket ownership and phase-sequence status.
4. `GameEngine` mutates the authoritative state.
5. If an effect prompt is created, the server switches to `EffectResolution` and broadcasts immediately.
6. Otherwise, `Room` runs the visible end-turn phase sequence:
   - `ClearCache`
   - `End`
   - next player's `Start`
   - `CheckControl`
   - `CheckCompile`
   - final action/compile state
7. Each visible phase step is pushed via `state_sync` so the client can animate the turn flow.

### Flow D: Effect resolution

1. A card play, start trigger, end trigger, cover trigger, or compile side effect enqueues one or more effects.
2. If the next effect needs player input, the server sets `TurnPhase.EffectResolution`.
3. `StateView` exposes:
   - `pendingEffect` to the player who must act
   - `opponentPendingEffect` to the observing player
4. `GameScene` renders the effect HUD and target-selection affordances from that payload.
5. The acting player emits `resolve_effect` with the effect id and chosen target data.
6. `Room.handleResolveEffect(...)` validates ownership and required target data, then calls `resolveNextEffect(...)`.
7. If the queue still contains more work, the server stays in `EffectResolution` and emits another `state_sync`.
8. If the queue is empty, `Room` resumes the correct phase based on `resolutionStack` context.

### Flow E: State projection

Every time `Room.broadcastState()` runs:

1. The room loops over both players.
2. `buildPlayerView(state, playerIndex)` is called separately for each side.
3. Hidden opponent face-down cards are masked.
4. Server-only arrays such as full decks never leave memory.
5. The server emits `state_sync` to each player's socket with that personalized payload.

This means the two players often receive similar but not identical payloads at the same moment.

## 5. Detailed End-To-End Example

This example uses the most common interactive path: a player plays a face-up card that produces a discard prompt for the opponent.

### Situation

- It is player 0's action phase.
- Player 0 has a hand card with an immediate opponent-discard effect.
- Both clients are currently displaying the latest `state_sync` view.

### Sequence

1. Player 0 clicks the card and a legal line in `GameScene`.
2. The client emits:

```ts
play_card {
  instanceId: "card-123",
  face: "FaceUp",
  lineIndex: 1
}
```

3. `server/src/index.ts` forwards the event to `Room.handlePlayCard(...)`.
4. `Room.handlePlayCard(...)` calls `playCard(...)` in `GameEngine`.
5. `GameEngine` removes the card from hand, adds it to the line, and invokes effect enqueueing.
6. `CardEffects` turns the card rule into a queued `PendingEffect` owned by player 1.
7. Because the next effect requires a choice, the server sets `turnPhase = EffectResolution`.
8. `Room.broadcastState()` emits two personalized `state_sync` payloads:
   - Player 0 receives `opponentPendingEffect` populated and `pendingEffect = null`.
   - Player 1 receives `pendingEffect` populated and `opponentPendingEffect = null`.
9. Player 1's `GameScene` highlights their hand as the valid discard area and shows the confirm UI.
10. Player 1 clicks a hand card.
11. The client emits:

```ts
resolve_effect {
  id: "eff-987",
  targetInstanceId: "hand-card-4"
}
```

12. `Room.handleResolveEffect(...)` confirms:
   - the room is in `EffectResolution`
   - the queued effect id matches
   - player 1 owns that effect
   - the chosen card is actually in player 1's hand
13. `resolveNextEffect(...)` executes the discard.
14. If more effects remain, another `state_sync` is broadcast in `EffectResolution`.
15. If the queue is empty, `Room` resumes the prior turn context from `resolutionStack`.
16. The server then either:
   - returns to `Action`, or
   - continues end-turn/start-turn sequencing depending on where the effect was triggered.

### Why this example matters

It demonstrates the core architectural rule: the client drives selection, but the server decides who is allowed to act, what the pending effect is, and when normal turn flow resumes.

## 6. Message Catalogue

### Client to server

Defined in [shared/src/index.ts](c:\code\compile-game\shared\src\index.ts).

| Event | Sent from | Purpose | Typical payload |
|---|---|---|---|
| `create_room` | MenuScene | Create a room and set lobby settings | `{ username, lobbySettings? }` |
| `join_room` | MenuScene | Join an existing room | `{ username, roomCode }` |
| `draft_pick` | DraftScene | Select a protocol during draft | `{ protocolId }` |
| `play_card` | GameScene | Play a hand card to a line | `{ instanceId, face, lineIndex }` |
| `compile_line` | GameScene | Choose a required compile line | `{ lineIndex }` |
| `refresh` | GameScene | Refresh the current hand | no payload |
| `resolve_effect` | GameScene | Resolve an interactive queued effect | `{ id, targetInstanceId?, targetLineIndex?, newProtocolOrder?, swapProtocolIds?, discardInstanceId? }` |
| `resolve_control_reorder` | GameScene | Resolve the control-token reorder bonus | `{ whose?, newProtocolOrder? }` |

### Server to client

Also defined in [shared/src/index.ts](c:\code\compile-game\shared\src\index.ts).

| Event | Sent from | Purpose | Typical payload |
|---|---|---|---|
| `room_created` | RoomManager | Confirms room creation | `{ roomCode, playerIndex }` |
| `room_joined` | RoomManager | Confirms join success | `{ roomCode, playerIndex }` |
| `room_error` | RoomManager or Room | Reject invalid room operations | `{ message }` |
| `game_starting` | Room | Starts draft UI | `{ draftState }` |
| `draft_updated` | Room | Broadcasts intermediate draft state | `{ draftState }` |
| `draft_done` | Room | Final draft result before gameplay | `{ draftState }` |
| `state_sync` | Room | Main gameplay sync event | `{ view, turnPhase }` |
| `action_rejected` | Room | Rejects illegal actions or invalid effect inputs | `{ reason }` |
| `game_over` | Room | Announces winner | `{ winnerUsername }` |
| `opponent_disconnected` | Room | Tells remaining player the match ended early | no payload |

## 7. Message Frequency And Approximate Payload Size

The transport is event-driven, not a fixed-tick realtime stream. There is no constant 20 Hz or 60 Hz snapshot flood.

### Low-frequency lifecycle messages

These are sent rarely, usually once or a few times per match:

- `room_created`, `room_joined`, `room_error`, `game_over`, `opponent_disconnected`
- Approximate payload: tiny, usually a short string plus one or two fields.
- Rough shape: tens of bytes to a few hundred bytes once serialized.

### Draft messages

Draft traffic is predictable and light:

- `game_starting`: once per match that uses the visible draft flow.
- `draft_updated`: once per non-final pick.
- `draft_done`: once at the end.

Approximate payload:

- Moderate.
- Includes the protocol pool, pick history, current picker, and lobby settings.
- Usually much smaller than a full gameplay `state_sync` because it does not include lines, hands, effect stack, or discard piles.

### Gameplay `state_sync`

`state_sync` is the dominant message.

When it is sent:

- After almost every successful action.
- During each visible phase step in `broadcastStartTurnPhases(...)`.
- During the visible end-turn sequence in `broadcastEndTurnPhases(...)`.
- After each effect-resolution step when the queue changes.
- After any server-side automatic phase progression that changes what the player should see.

Practical frequency:

- Usually a small burst around actions rather than a continuous stream.
- A simple action with no effect may produce several `state_sync` messages because turn phases are shown explicitly.
- An effect-heavy turn can produce additional bursts as each queued effect resolves.

Approximate payload contents:

- Always includes `turnPhase`.
- Includes one personalized `PlayerView` with:
  - own hand cards
  - own and opponent visible lines
  - protocol states
  - deck/trash counts
  - recent visible trash slices
  - pending effect or opponent pending effect
  - optional reveal data
  - effect stack summary
  - computed line totals

Approximate payload size:

- Small board state: typically modest JSON, often well under a large media-style payload.
- Mid-game board state: likely the largest regular message in the system.
- Still bounded because:
  - decks are sent as counts, not full arrays
  - hidden face-down opponent cards are masked
  - trash visibility is capped to a recent window
  - effect stack entries are summarized rather than sending full rule definitions

In practical terms, `state_sync` is best thought of as a compact personalized snapshot, not a replay log and not a frame-by-frame stream.

### `action_rejected`

Frequency:

- Only when the player sends an illegal or mistimed action.

Payload:

- Very small, just a short human-readable reason string.

## 8. What Changes Usually Belong Where

Use this as a maintenance shortcut:

- Add or change a rule text/effect type: update card data plus `CardEffects`, and often tests.
- Change hidden-information rules: update `StateView`.
- Change turn sequencing or compile behavior: update `GameEngine` and possibly `Room` sequencing.
- Change button behavior, click affordances, or HUD visuals: update `GameScene` or extracted UI renderers.
- Change payload shape or add a new event: update `shared/src/index.ts` first, then both server and client consumers.

## 9. Summary

The project uses a clean division of labor:

- `shared/` defines the contract.
- `server/` decides truth.
- `client/` renders truth.

Most runtime complexity lives in three places:

- `Room` for orchestration and broadcasting,
- `GameEngine` for turn-state mutation,
- `CardEffects` for card text execution.

Everything the player sees in-game is a projection of those server decisions through `StateView` and then `GameScene`.