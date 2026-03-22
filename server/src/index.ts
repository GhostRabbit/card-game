import express from "express";
import http from "http";
import { Server } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "@compile/shared";
import { RoomManager } from "./room/RoomManager";

const app = express();
const httpServer = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] },
});

const roomManager = new RoomManager();

io.on("connection", (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  socket.on("create_room", ({ username, lobbySettings }) => {
    if (!username?.trim()) {
      socket.emit("room_error", { message: "Username required." });
      return;
    }
    roomManager.createRoom(socket, username.trim(), lobbySettings);
  });

  socket.on("join_room", ({ username, roomCode }) => {
    if (!username?.trim() || !roomCode?.trim()) {
      socket.emit("room_error", { message: "Username and room code required." });
      return;
    }
    roomManager.joinRoom(socket, username.trim(), roomCode.trim());
  });

  socket.on("draft_pick", ({ protocolId }) => {
    const room = roomManager.getRoom(socket.id);
    if (!room) return;
    room.handleDraftPick(socket, protocolId);
  });

  socket.on("play_card", ({ instanceId, face, lineIndex }) => {
    const room = roomManager.getRoom(socket.id);
    if (!room) return;
    room.handlePlayCard(socket, instanceId, face, lineIndex);
  });

  socket.on("compile_line", ({ lineIndex }) => {
    const room = roomManager.getRoom(socket.id);
    if (!room) return;
    room.handleCompileLine(socket, lineIndex);
  });

  socket.on("refresh", () => {
    const room = roomManager.getRoom(socket.id);
    if (!room) return;
    room.handleRefresh(socket);
  });

  socket.on("resolve_effect", ({ id, targetInstanceId, newProtocolOrder, swapProtocolIds, targetLineIndex, discardInstanceId }) => {
    const room = roomManager.getRoom(socket.id);
    if (!room) return;
    room.handleResolveEffect(socket, id, targetInstanceId, newProtocolOrder, swapProtocolIds, targetLineIndex, discardInstanceId);
  });

  socket.on("resolve_control_reorder", ({ whose, newProtocolOrder }) => {
    const room = roomManager.getRoom(socket.id);
    if (!room) return;
    room.handleControlReorder(socket, whose, newProtocolOrder);
  });

  socket.on("disconnect", () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    roomManager.handleDisconnect(socket.id);
  });
});

const PORT = process.env.PORT ?? 3000;
httpServer.listen(PORT, () => {
  console.log(`Compile server running on http://localhost:${PORT}`);
});
