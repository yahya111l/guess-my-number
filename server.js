const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.static(path.join(__dirname, "public")));

// --- State ---
const waitingQueue = []; // [{ socketId, socket }]
const rooms = {}; // roomCode -> Room
const playerRoom = {}; // socketId -> roomCode

// --- Room factory ---
function createRoom(code, mode) {
  return {
    code,
    mode, // 'random' | 'private'
    players: [], // [{ id, socket, name, secretNumber, ready }]
    state: "waiting", // waiting | setup | playing | ended
    currentTurn: null, // socketId whose turn it is to GUESS
    guessHistory: [], // [{ guesser, guess, response }]
    rematchVotes: new Set(),
  };
}

function getRoomPlayer(room, socketId) {
  return room.players.find((p) => p.id === socketId);
}

function getOpponent(room, socketId) {
  return room.players.find((p) => p.id !== socketId);
}

function broadcastRoomState(room) {
  room.players.forEach((p) => {
    const opponent = getOpponent(room, p.id);
    p.socket.emit("room_state", {
      roomCode: room.code,
      state: room.state,
      yourTurn: room.currentTurn === p.id,
      opponentName: opponent ? opponent.name : null,
      opponentReady: opponent ? opponent.ready : false,
      youReady: p.ready,
      guessHistory: room.guessHistory,
      currentTurn: room.currentTurn,
    });
  });
}

// --- Socket logic ---
io.on("connection", (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── Random Match ──────────────────────────────────────────────
  socket.on("find_match", ({ name }) => {
    if (playerRoom[socket.id]) return;

    // Remove stale entries from queue
    for (let i = waitingQueue.length - 1; i >= 0; i--) {
      if (!io.sockets.sockets.get(waitingQueue[i].socketId)) {
        waitingQueue.splice(i, 1);
      }
    }

    if (waitingQueue.length > 0) {
      const peer = waitingQueue.shift();
      const code = crypto.randomBytes(3).toString("hex").toUpperCase();
      const room = createRoom(code, "random");

      room.players.push({ id: peer.socketId, socket: peer.socket, name: peer.name, secretNumber: null, ready: false });
      room.players.push({ id: socket.id, socket, name, secretNumber: null, ready: false });
      room.state = "setup";

      rooms[code] = room;
      playerRoom[peer.socketId] = code;
      playerRoom[socket.id] = code;

      peer.socket.join(code);
      socket.join(code);

      broadcastRoomState(room);
      console.log(`[Room ${code}] Matched: ${peer.name} vs ${name}`);
    } else {
      waitingQueue.push({ socketId: socket.id, socket, name });
      socket.emit("waiting_for_match");
      console.log(`[Queue] ${name} is waiting…`);
    }
  });

  socket.on("cancel_match", () => {
    const idx = waitingQueue.findIndex((e) => e.socketId === socket.id);
    if (idx !== -1) waitingQueue.splice(idx, 1);
    socket.emit("match_cancelled");
  });

  // ── Private Room ──────────────────────────────────────────────
  socket.on("create_room", ({ name }) => {
    if (playerRoom[socket.id]) return;

    const code = crypto.randomBytes(3).toString("hex").toUpperCase();
    const room = createRoom(code, "private");
    room.players.push({ id: socket.id, socket, name, secretNumber: null, ready: false });
    rooms[code] = room;
    playerRoom[socket.id] = code;
    socket.join(code);

    socket.emit("room_created", { roomCode: code });
    socket.emit("waiting_for_opponent", { roomCode: code });
    console.log(`[Room ${code}] Created by ${name}`);
  });

  socket.on("join_room", ({ name, roomCode }) => {
    const code = roomCode.toUpperCase().trim();
    const room = rooms[code];

    if (!room) return socket.emit("join_error", { message: "Room not found. Check the code and try again." });
    if (room.players.length >= 2) return socket.emit("join_error", { message: "Room is full." });
    if (room.state !== "waiting") return socket.emit("join_error", { message: "Game already in progress." });
    if (playerRoom[socket.id]) return socket.emit("join_error", { message: "You are already in a room." });

    room.players.push({ id: socket.id, socket, name, secretNumber: null, ready: false });
    room.state = "setup";
    playerRoom[socket.id] = code;
    socket.join(code);

    broadcastRoomState(room);
    console.log(`[Room ${code}] ${name} joined`);
  });

  // ── Game Flow ─────────────────────────────────────────────────
  socket.on("set_secret", ({ number }) => {
    const code = playerRoom[socket.id];
    if (!code) return;
    const room = rooms[code];
    if (!room || room.state !== "setup") return;

    const player = getRoomPlayer(room, socket.id);
    if (!player) return;

    const n = parseInt(number, 10);
    if (isNaN(n) || n < 1 || n > 100) {
      return socket.emit("error_msg", { message: "Secret must be a number between 1 and 100." });
    }

    player.secretNumber = n;
    player.ready = true;

    const allReady = room.players.length === 2 && room.players.every((p) => p.ready);
    if (allReady) {
      room.state = "playing";
      room.currentTurn = room.players[0].id;
      room.guessHistory = [];
      console.log(`[Room ${code}] Game started!`);
    }

    broadcastRoomState(room);
  });

  socket.on("make_guess", ({ guess }) => {
    const code = playerRoom[socket.id];
    if (!code) return;
    const room = rooms[code];
    if (!room || room.state !== "playing") return;
    if (room.currentTurn !== socket.id) return socket.emit("error_msg", { message: "It's not your turn." });

    const n = parseInt(guess, 10);
    if (isNaN(n) || n < 1 || n > 100) {
      return socket.emit("error_msg", { message: "Guess must be between 1 and 100." });
    }

    const guesser = getRoomPlayer(room, socket.id);
    const opponent = getOpponent(room, socket.id);

    // Notify opponent to respond
    opponent.socket.emit("respond_to_guess", {
      guess: n,
      guesserName: guesser.name,
    });

    socket.emit("guess_sent", { guess: n });
    console.log(`[Room ${code}] ${guesser.name} guessed ${n}`);
  });

  socket.on("send_response", ({ response }) => {
    const code = playerRoom[socket.id];
    if (!code) return;
    const room = rooms[code];
    if (!room || room.state !== "playing") return;

    const allowed = ["higher", "lower", "correct"];
    if (!allowed.includes(response)) return;

    const responder = getRoomPlayer(room, socket.id);
    const guesser = getOpponent(room, socket.id);

    // Find the pending guess (last in history or from guess_sent)
    // We rely on the opponent's last guess_sent event - we track it simply
    room.guessHistory.push({
      guesserId: guesser.id,
      guesserName: guesser.name,
      response,
      // guess value is echoed back via client
    });

    guesser.socket.emit("got_response", { response, responderName: responder.name });

    if (response === "correct") {
      room.state = "ended";
      room.players.forEach((p) => {
        p.socket.emit("game_over", {
          winnerId: guesser.id,
          winnerName: guesser.name,
          secretNumbers: {
            [room.players[0].id]: room.players[0].secretNumber,
            [room.players[1].id]: room.players[1].secretNumber,
          },
          names: {
            [room.players[0].id]: room.players[0].name,
            [room.players[1].id]: room.players[1].name,
          },
        });
      });
      console.log(`[Room ${code}] ${guesser.name} WINS!`);
    } else {
      // Switch turn
      room.currentTurn = socket.id; // responder now guesses
      broadcastRoomState(room);
    }
  });

  // ── Rematch ───────────────────────────────────────────────────
  socket.on("request_rematch", () => {
    const code = playerRoom[socket.id];
    if (!code) return;
    const room = rooms[code];
    if (!room || room.state !== "ended") return;

    room.rematchVotes.add(socket.id);
    const opponent = getOpponent(room, socket.id);
    if (opponent) opponent.socket.emit("opponent_wants_rematch");

    if (room.rematchVotes.size === 2) {
      // Reset room
      room.state = "setup";
      room.currentTurn = null;
      room.guessHistory = [];
      room.rematchVotes = new Set();
      room.players.forEach((p) => {
        p.secretNumber = null;
        p.ready = false;
      });
      broadcastRoomState(room);
      console.log(`[Room ${code}] Rematch started`);
    }
  });

  // ── Disconnect ────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log(`[-] Disconnected: ${socket.id}`);

    // Remove from queue
    const qi = waitingQueue.findIndex((e) => e.socketId === socket.id);
    if (qi !== -1) waitingQueue.splice(qi, 1);

    const code = playerRoom[socket.id];
    if (!code) return;

    const room = rooms[code];
    if (!room) return;

    const opponent = getOpponent(room, socket.id);
    if (opponent) {
      opponent.socket.emit("opponent_disconnected");
    }

    // Cleanup room
    delete rooms[code];
    room.players.forEach((p) => delete playerRoom[p.id]);
    console.log(`[Room ${code}] Closed due to disconnect`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[+] Server running on http://localhost:${PORT}`);
});