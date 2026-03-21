import { Socket } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents, LobbySettings } from "@compile/shared";
import { Room } from "./Room";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export class RoomManager {
  private rooms = new Map<string, Room>();
  /** socket id → room code */
  private socketToRoom = new Map<string, string>();

  createRoom(socket: AppSocket, username: string, lobbySettings?: LobbySettings): void {
    const code = this.generateCode();
    const room = new Room(code);
    room.setLobbySettings(lobbySettings);
    this.rooms.set(code, room);
    room.addPlayer(socket, username);
    this.socketToRoom.set(socket.id, code);
    socket.emit("room_created", { roomCode: code, playerIndex: 0 });
  }

  joinRoom(socket: AppSocket, username: string, code: string): void {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) {
      socket.emit("room_error", { message: "Room not found." });
      return;
    }
    if (room.playerCount >= 2) {
      socket.emit("room_error", { message: "Room is full." });
      return;
    }
    const idx = room.addPlayer(socket, username);
    if (idx === null) {
      socket.emit("room_error", { message: "Could not join room." });
      return;
    }
    this.socketToRoom.set(socket.id, code.toUpperCase());
    socket.emit("room_joined", { roomCode: code.toUpperCase(), playerIndex: idx });

    // Both players present — start draft
    if (room.playerCount === 2) {
      room.startDraft();
    }
  }

  handleDisconnect(socketId: string): void {
    const code = this.socketToRoom.get(socketId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (room) {
      room.removePlayer(socketId);
      // Clean up empty rooms
      if (room.playerCount === 0) this.rooms.delete(code);
    }
    this.socketToRoom.delete(socketId);
  }

  getRoom(socketId: string): Room | undefined {
    const code = this.socketToRoom.get(socketId);
    return code ? this.rooms.get(code) : undefined;
  }

  private generateCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code: string;
    do {
      code = Array.from({ length: 6 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join("");
    } while (this.rooms.has(code));
    return code;
  }
}
