import { Socket } from "socket.io";
import {
  DraftState,
  ClientToServerEvents,
  ServerToClientEvents,
  ProtocolStatus,
  LobbySettings,
  DraftVariant,
} from "@compile/shared";
import {
  createInitialDraftState,
  createRandomThreeDraftState,
  DEFAULT_LOBBY_SETTINGS,
  normalizeLobbySettings,
  applyDraftPick,
  buildDeck,
} from "../game/DraftEngine";
import {
  createServerGameState,
  playCard,
  refresh,
  chooseCompile,
  processAutoPhases,
  resolveNextEffect,
  continueAfterEffects,
  resolveControlReorder,
  endTurn,
  finishTurn,
  drawCards,
  discardFromHand,
  ServerGameState,
} from "../game/GameEngine";
import { buildPlayerView } from "../game/StateView";
import { enqueueEffectsFromCard } from "../game/CardEffects";
import { CARD_MAP } from "../data/cards";
import { CardInstance, CardFace, TurnPhase } from "@compile/shared";
import { GameLogger } from "../Logger";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface PlayerSlot {
  socket: AppSocket;
  username: string;
  index: 0 | 1;
}

const PHASE_HIGHLIGHT_MS = 500;

export type RoomPhaseType = "waiting" | "draft" | "game" | "over";

export class Room {
  readonly code: string;
  private players: [PlayerSlot | null, PlayerSlot | null] = [null, null];
  private phase: RoomPhaseType = "waiting";
  private draftState: DraftState | null = null;
  private gameState: ServerGameState | null = null;
  private logger: GameLogger | null = null;
  private lobbySettings: LobbySettings = DEFAULT_LOBBY_SETTINGS;
  private phaseSequenceTimers: Array<ReturnType<typeof setTimeout>> = [];
  private phaseSequenceRunning = false;

  constructor(code: string) {
    this.code = code;
  }

  get playerCount(): number {
    return this.players.filter(Boolean).length;
  }

  addPlayer(socket: AppSocket, username: string): 0 | 1 | null {
    if (this.players[0] === null) {
      this.players[0] = { socket, username, index: 0 };
      return 0;
    }
    if (this.players[1] === null) {
      this.players[1] = { socket, username, index: 1 };
      return 1;
    }
    return null; // room full
  }

  removePlayer(socketId: string): void {
    this.clearPhaseSequence();
    for (let i = 0; i < 2; i++) {
      if (this.players[i]?.socket.id === socketId) {
        this.players[i] = null;
      }
    }
    // notify remaining player
    for (let i = 0; i < 2; i++) {
      this.players[i]?.socket.emit("opponent_disconnected");
    }
  }

  setLobbySettings(settings?: LobbySettings): void {
    this.lobbySettings = normalizeLobbySettings(settings);
  }

  startDraft(settings?: LobbySettings): void {
    this.phase = "draft";
    this.lobbySettings = normalizeLobbySettings(settings ?? this.lobbySettings);

    if (this.lobbySettings.draftVariant === DraftVariant.Random3) {
      const randomDraft = createRandomThreeDraftState(this.lobbySettings);
      if ("error" in randomDraft) {
        for (let i = 0; i < 2; i++) {
          this.players[i]?.socket.emit("room_error", { message: randomDraft.error });
        }
        return;
      }
      this.startGame(randomDraft);
      return;
    }

    this.draftState = createInitialDraftState(this.lobbySettings);
    for (let i = 0; i < 2; i++) {
      this.players[i]?.socket.emit("game_starting", { draftState: this.draftState });
    }
  }

  handleDraftPick(socket: AppSocket, protocolId: string): void {
    if (!this.draftState) return;
    const slot = this.players.find((p) => p?.socket.id === socket.id);
    if (!slot) return;

    const result = applyDraftPick(this.draftState, slot.index, protocolId);
    if ("error" in result) {
      socket.emit("action_rejected", { reason: result.error });
      return;
    }
    this.draftState = result;
    this.logger?.log("DRAFT_PICK", `P${slot.index} (${slot.username}) picked ${protocolId}`);

    if (result.done) {
      for (const p of this.players) p?.socket.emit("draft_done", { draftState: result });
      this.startGame(result);
    } else {
      for (const p of this.players) p?.socket.emit("draft_updated", { draftState: result });
    }
  }

  private startGame(draftState: DraftState): void {
    this.phase = "game";
    this.logger = new GameLogger(this.code);
    const p0 = this.players[0]?.username ?? "P0";
    const p1 = this.players[1]?.username ?? "P1";
    this.logger.log("PLAYERS", `P0=${p0}, P1=${p1}`);
    const picks0 = draftState.picks.filter(p => p.playerIndex === 0).map(p => p.protocolId).join(", ");
    const picks1 = draftState.picks.filter(p => p.playerIndex === 1).map(p => p.protocolId).join(", ");
    const setSummary = draftState.lobbySettings.selectedProtocolSets.join(", ");
    this.logger.log("GAME_MODE", `${draftState.lobbySettings.draftVariant} | sets: [${setSummary}]`);
    this.logger.log("DRAFT_RESULT", `P0: [${picks0}] | P1: [${picks1}]`);

    // Build decks first, then construct player states drawing from those decks
    const decks: [CardInstance[], CardInstance[]] = [
      buildDeck(draftState.picks, 0),
      buildDeck(draftState.picks, 1),
    ];

    const playerStates = ([0, 1] as const).map((i) => {
      const deck = decks[i];
      const hand = deck.splice(0, 5);
      hand.forEach((c) => (c.face = CardFace.FaceUp)); // hand cards are always face-up
      const playerProtocols = draftState.picks
        .filter((p) => p.playerIndex === i)
        .map((p, idx) => ({
          protocolId: p.protocolId,
          status: ProtocolStatus.Loading,
          lineIndex: idx as 0 | 1 | 2,
        }));
      return {
        id: this.players[i]!.socket.id,
        username: this.players[i]!.username,
        protocols: playerProtocols,
        hand,
        deckSize: deck.length,
        trashSize: 0,
        lines: [{ cards: [] }, { cards: [] }, { cards: [] }] as [import("@compile/shared").LineState, import("@compile/shared").LineState, import("@compile/shared").LineState],
        hasControl: false,
      };
    }) as [import("@compile/shared").PlayerState, import("@compile/shared").PlayerState];

    this.gameState = createServerGameState(playerStates, decks);
    processAutoPhases(this.gameState);
    this.logger?.log("TURN", `Turn 1 — active: P0 (${this.players[0]?.username})`);
    this.broadcastStartTurnPhases(this.gameState);
  }

  /** Flush any pending effect/draw logs from the game state to the logger. */
  private flushEffectLogs(): void {
    if (!this.gameState || !this.logger) return;
    for (const entry of this.gameState.pendingLogs) {
      this.logger.log("EFFECT", entry);
    }
    this.gameState.pendingLogs = [];
  }

  handlePlayCard(socket: AppSocket, instanceId: string, face: import("@compile/shared").CardFace, lineIndex: number): void {
    if (!this.gameState) return;
    const slot = this.players.find((p) => p?.socket.id === socket.id);
    if (!slot) return;
    if (this.phaseSequenceRunning) {
      socket.emit("action_rejected", { reason: "Phase transition in progress." });
      return;
    }

    const result = playCard(this.gameState, slot.index, instanceId, face, lineIndex);
    if (!result.success) {
      const rejectedCard = this.gameState.players[slot.index].hand.find((c) => c.instanceId === instanceId);
      const rejectedLabel = rejectedCard ? rejectedCard.defId : instanceId;
      this.logger?.log("REJECTED", `P${slot.index} play_card ${rejectedLabel} face=${face} line=${lineIndex} reason=${result.reason}`);
      socket.emit("action_rejected", { reason: result.reason ?? "Action rejected." });
      return;
    }
    const playedCard = this.gameState.players[slot.index].lines[lineIndex].cards.find((c) => c.instanceId === instanceId);
    const cardLabel = playedCard ? playedCard.defId : instanceId;
    this.logger?.log("PLAY_CARD", `P${slot.index} (${slot.username}) played ${cardLabel} face=${face} line=${lineIndex} | turn=${this.gameState.turnNumber}`);
    this.flushEffectLogs();
    if (this.gameState.turnPhase !== TurnPhase.EffectResolution) {
      this.checkWin();
      if (this.gameState) {
        const next = this.gameState.activePlayerIndex;
        this.logger?.log("TURN", `Turn ${this.gameState.turnNumber} — active: P${next} (${this.players[next]?.username})`);
      }
    }
    this.broadcastState();
  }

  handleCompileLine(socket: AppSocket, lineIndex: number): void {
    if (!this.gameState) return;
    const slot = this.players.find((p) => p?.socket.id === socket.id);
    if (!slot) return;
    if (this.phaseSequenceRunning) {
      socket.emit("action_rejected", { reason: "Phase transition in progress." });
      return;
    }

    const result = chooseCompile(this.gameState, slot.index, lineIndex);
    if (!result.success) {
      this.logger?.log("REJECTED", `P${slot.index} compile_line line=${lineIndex} reason=${result.reason}`);
      socket.emit("action_rejected", { reason: result.reason ?? "Action rejected." });
      return;
    }
    this.logger?.log("COMPILE", `P${slot.index} (${slot.username}) compiled line=${lineIndex} | turn=${this.gameState.turnNumber - 1}`);
    this.flushEffectLogs();
    if (this.gameState.turnPhase !== TurnPhase.EffectResolution) {
      this.checkWin();
      if (this.gameState) {
        const next = this.gameState.activePlayerIndex;
        this.logger?.log("TURN", `Turn ${this.gameState.turnNumber} — active: P${next} (${this.players[next]?.username})`);
      }
    }
    this.broadcastState();
  }

  handleRefresh(socket: AppSocket): void {
    if (!this.gameState) return;
    const slot = this.players.find((p) => p?.socket.id === socket.id);
    if (!slot) return;
    if (this.phaseSequenceRunning) {
      socket.emit("action_rejected", { reason: "Phase transition in progress." });
      return;
    }

    const handBefore = this.gameState.players[slot.index].hand.length;
    const result = refresh(this.gameState, slot.index);
    if (!result.success) {
      this.logger?.log("REJECTED", `P${slot.index} refresh reason=${result.reason}`);
      socket.emit("action_rejected", { reason: result.reason ?? "Action rejected." });
      return;
    }
    const handAfter = this.gameState.players[slot.index].hand.length;
    this.logger?.log("RESET", `P${slot.index} (${slot.username}) reset: hand ${handBefore}→${handAfter} | turn=${this.gameState.turnNumber - 1}`);
    this.flushEffectLogs();
    if (this.gameState.turnPhase !== TurnPhase.EffectResolution) {
      this.checkWin();
      if (this.gameState) {
        const next = this.gameState.activePlayerIndex;
        this.logger?.log("TURN", `Turn ${this.gameState.turnNumber} — active: P${next} (${this.players[next]?.username})`);
      }
    }
    this.broadcastState();
  }

  handleControlReorder(socket: AppSocket, whose?: "self" | "opponent", newProtocolOrder?: string[]): void {
    if (!this.gameState) return;
    const slot = this.players.find((p) => p?.socket.id === socket.id);
    if (!slot) return;

    const result = resolveControlReorder(this.gameState, slot.index, whose, newProtocolOrder);
    if (!result.success) {
      this.logger?.log("REJECTED", `P${slot.index} resolve_control_reorder reason=${result.reason}`);
      socket.emit("action_rejected", { reason: result.reason ?? "Action rejected." });
      return;
    }
    this.logger?.log("CTRL", `P${slot.index} (${slot.username}) control reorder${whose ? `: ${whose} [${newProtocolOrder?.join(",")}]` : ": skipped"}`);
    this.flushEffectLogs();
    this.checkWin();
    if (this.gameState) {
      const next = this.gameState.activePlayerIndex;
      this.logger?.log("TURN", `Turn ${this.gameState.turnNumber} — active: P${next} (${this.players[next]?.username})`);
    }
    this.broadcastState();
  }

  handleResolveEffect(socket: AppSocket, effectId: string, targetInstanceId?: string, newProtocolOrder?: string[], swapProtocolIds?: string[], targetLineIndex?: number, discardInstanceId?: string): void {
    if (!this.gameState) return;
    const slot = this.players.find((p) => p?.socket.id === socket.id);
    if (!slot) return;

    const state = this.gameState;
    if (state.turnPhase !== TurnPhase.EffectResolution) {
      socket.emit("action_rejected", { reason: "No effect pending." });
      return;
    }
    const next = state.effectQueue[0];
    if (!next || next.ownerIndex !== slot.index || next.id !== effectId) {
      socket.emit("action_rejected", { reason: "Not your effect to resolve." });
      return;
    }

    // Validate targetInstanceId for discard: must be in the player's hand
    if (next.type === "discard") {
      if (!targetInstanceId && state.players[slot.index].hand.length > 0) {
        socket.emit("action_rejected", { reason: "Choose a card to discard." });
        return;
      }
      if (targetInstanceId) {
        const inHand = state.players[slot.index].hand.some((c) => c.instanceId === targetInstanceId);
        if (!inHand) {
          socket.emit("action_rejected", { reason: "That card is not in your hand." });
          return;
        }
      }
    }

    this.logger?.log("EFFECT", `P${slot.index} confirmed [${next.trigger}] ${next.type} from ${next.cardDefId}${targetInstanceId ? ` target=${targetInstanceId}` : ""}${discardInstanceId ? ` discard=${discardInstanceId}` : ""}${newProtocolOrder ? ` order=[${newProtocolOrder.join(",")}]` : ""}${swapProtocolIds ? ` swap=[${swapProtocolIds.join(",")}]` : ""}`);
    resolveNextEffect(state, targetInstanceId, newProtocolOrder, swapProtocolIds, targetLineIndex, discardInstanceId);
    this.flushEffectLogs();

    if (state.effectQueue.length > 0) {
      // More effects in the queue — stay in EffectResolution
      this.broadcastState();
      return;
    }

    // Queue drained — resume the turn flow
    const ctx = state.effectQueueContext;
    state.effectQueueContext = null;
    
    if (ctx === "immediate") {
      if (state.pendingBonusPlay) {
        state.turnPhase = TurnPhase.Action;
        this.broadcastState();
        return;
      }
      // Schedule phase-by-phase broadcast for CACHE, END, START
      this.broadcastEndTurnPhases(state);
    } else if (ctx === "cache") {
      // Cache discards finished; continue with cache passives and END/START sequence.
      this.broadcastEndTurnPhases(state);
    } else if (ctx === "end") {
      // Already resolved END effects
      finishTurn(state);
      this.flushEffectLogs();
      if (state.turnPhase !== TurnPhase.EffectResolution) {
        this.checkWin();
        if (this.gameState) {
          const nextPlayer = this.gameState.activePlayerIndex;
          this.logger?.log("TURN", `Turn ${this.gameState.turnNumber} — active: P${nextPlayer} (${this.players[nextPlayer]?.username})`);
        }
      }
      this.broadcastState();
    } else if (ctx === "start") {
      processAutoPhases(state);
      if (state.turnPhase !== TurnPhase.EffectResolution) {
        this.checkWin();
        const nextPlayer = state.activePlayerIndex;
        this.logger?.log("TURN", `Turn ${state.turnNumber} — active: P${nextPlayer} (${this.players[nextPlayer]?.username})`);
        this.broadcastStartTurnPhases(state);
        return;
      }
      this.broadcastState();
    }
  }

  private broadcastEndTurnPhases(state: ServerGameState): void {
    this.clearPhaseSequence();

    // Step 1: Show CACHE phase
    state.turnPhase = TurnPhase.ClearCache;
    const pi = state.activePlayerIndex;
    
    // Execute cache logic
    if (state.skipCheckCache) {
      state.skipCheckCache = false;
      state.pendingLogs.push("  skip_check_cache: clear-cache discard skipped");
    } else {
      const over5 = state.players[pi].hand.length - 5;
      if (over5 > 0) {
        for (let i = 0; i < over5; i++) {
          state.effectQueue.push({
            id: `${Date.now()}-cache-${i}`,
            cardDefId: "cache_discard",
            cardName: "Cache",
            type: "discard",
            description: "Choose a card to discard for Cache.",
            ownerIndex: pi,
            trigger: "immediate",
            payload: { reason: "cache" },
          });
        }
        state.effectQueueContext = "cache";
        state.turnPhase = TurnPhase.EffectResolution;
        this.broadcastState();
        return;
      }
    }
    
    // Trigger after_clear_cache_draw passives
    for (const line of state.players[pi].lines) {
      for (const card of line.cards) {
        if (card.face !== CardFace.FaceUp) continue;
        const def = CARD_MAP.get(card.defId);
        if (!def) continue;
        for (const eff of def.effects) {
          if (eff.trigger === "passive" && eff.type === "after_clear_cache_draw") {
            const amount = typeof eff.payload?.amount === "number" ? eff.payload.amount : 1;
            state.pendingLogs.push(`  after_clear_cache_draw (${card.defId}): drawing ${amount}`);
            drawCards(state, pi, amount);
          }
        }
      }
    }
    
    this.flushEffectLogs();
    this.broadcastState();
    
    // Step 2: After 500ms, show END phase
    const endTimer = setTimeout(() => {
      state.turnPhase = TurnPhase.End;
      
      // Enqueue END effects
      for (const line of state.players[pi].lines) {
        for (const card of line.cards) {
          if (card.face === CardFace.FaceUp) {
            enqueueEffectsFromCard(state, pi, card.defId, "end", card.instanceId);
          }
        }
      }
      
      this.flushEffectLogs();
      
      if (state.effectQueue.length > 0) {
        // End effects need resolution
        state.effectQueueContext = "end";
        state.turnPhase = TurnPhase.EffectResolution;
        this.broadcastState();
        return;
      }
      
      this.broadcastState();
      
      // Step 3: After another 500ms, show opponent's START phase
      const startTimer = setTimeout(() => {
        finishTurn(state);
        this.flushEffectLogs();
        
        if (state.turnPhase !== TurnPhase.EffectResolution) {
          this.checkWin();
          if (this.gameState) {
            const nextPlayer = this.gameState.activePlayerIndex;
            this.logger?.log("TURN", `Turn ${this.gameState.turnNumber} — active: P${nextPlayer} (${this.players[nextPlayer]?.username})`);
          }
          this.broadcastStartTurnPhases(state);
          return;
        }
        this.broadcastState();
      }, PHASE_HIGHLIGHT_MS);
      this.phaseSequenceTimers.push(startTimer);
    }, PHASE_HIGHLIGHT_MS);
    this.phaseSequenceTimers.push(endTimer);
  }

  private clearPhaseSequence(): void {
    for (const timer of this.phaseSequenceTimers) clearTimeout(timer);
    this.phaseSequenceTimers = [];
    this.phaseSequenceRunning = false;
  }

  private broadcastStartTurnPhases(state: ServerGameState): void {
    this.clearPhaseSequence();

    if (state.turnPhase === TurnPhase.EffectResolution) {
      this.broadcastState();
      return;
    }

    const finalPhase = state.turnPhase;
    const phases: TurnPhase[] = [
      TurnPhase.Start,
      TurnPhase.CheckControl,
      TurnPhase.CheckCompile,
      finalPhase,
    ];

    this.phaseSequenceRunning = true;

    phases.forEach((phase, index) => {
      const emitPhase = () => {
        state.turnPhase = phase;
        this.broadcastState();
        if (index === phases.length - 1) {
          this.phaseSequenceRunning = false;
        }
      };

      if (index === 0) {
        emitPhase();
        return;
      }

      const timer = setTimeout(emitPhase, PHASE_HIGHLIGHT_MS * index);
      this.phaseSequenceTimers.push(timer);
    });
  }

  private checkWin(): void {
    if (!this.gameState?.winner) return;
    this.phase = "over";
    const winnerId = this.gameState.winner;
    const winnerSlot = this.players.find((p) => p?.socket.id === winnerId);
    const winnerUsername = winnerSlot?.username ?? "Unknown";
    this.logger?.log("GAME_OVER", `Winner: ${winnerUsername}`);
    this.logger?.flush();
    for (const p of this.players) p?.socket.emit("game_over", { winnerUsername });
  }

  private broadcastState(): void {
    if (!this.gameState) return;
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      if (!p) continue;
      const payload = buildPlayerView(this.gameState, i as 0 | 1);
      p.socket.emit("state_sync", payload);
    }
  }
}
