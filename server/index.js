const path = require("path");

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

// CORS middleware'ini önce tanımla
app.use(cors());

// Sağlık kontrolü veya test için "/" rotası
app.get("/", (req, res) => {
  res.send("Socket.io sunucusu çalışıyor.");
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

let rooms = {};

io.on("connection", (socket) => {
  console.log("Bağlandı:", socket.id);

  socket.on("create-room", ({ username }, callback) => {
    const roomCode = Math.random().toString(36).substring(2, 7);
    rooms[roomCode] = {
      host: socket.id,
      players: [{ id: socket.id, username, locations: [], roles: [] }],
      gameStarted: false,
      currentAsker: null,
      currentAnswerer: null,
      votes: {},
      turnTimeout: null,
    };
    socket.join(roomCode);
    callback(roomCode);
    io.to(roomCode).emit("update-room", rooms[roomCode]);
  });

  socket.on("join-room", ({ roomCode, username }, callback) => {
    const room = rooms[roomCode];
    if (!room) return callback("Oda yok.");
    if (room.gameStarted) return callback("Oyun başladı.");
    room.players.push({ id: socket.id, username, locations: [], roles: [] });
    socket.join(roomCode);
    io.to(roomCode).emit("update-room", room);
    callback(null);
  });

  socket.on("submit-locations-roles", ({ roomCode, locations, roles }) => {
    const room = rooms[roomCode];
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.locations = locations;
      player.roles = roles;
    }
    io.to(roomCode).emit("update-room", room);
  });

  socket.on("start-game", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    let allLocations = room.players.flatMap(p => p.locations);
    let allRoles = room.players.flatMap(p => p.roles);

    const chosenLocation = allLocations[Math.floor(Math.random() * allLocations.length)];
    const chosenRole = allRoles[Math.floor(Math.random() * allRoles.length)];
    const spyIndex = Math.floor(Math.random() * room.players.length);

    room.players = room.players.map((player, i) => ({
      ...player,
      assignedLocation: i === spyIndex ? "???" : chosenLocation,
      assignedRole: i === spyIndex ? "???" : chosenRole,
      isSpy: i === spyIndex,
    }));

    room.gameStarted = true;
    room.spyId = room.players[spyIndex].id;
    room.currentAsker = room.players[Math.floor(Math.random() * room.players.length)].id;
    room.votes = {};

    io.to(roomCode).emit("game-started", room);

    io.to(roomCode).emit("question-turn", {
      asker: room.currentAsker,
      answerer: null,
    });

    room.turnTimeout = setTimeout(() => {
      const otherPlayers = room.players.filter(p => p.id !== room.currentAsker);
      if (otherPlayers.length === 0) return;
      const newAsker = otherPlayers[Math.floor(Math.random() * otherPlayers.length)].id;
      room.currentAsker = newAsker;
      io.to(roomCode).emit("question-turn", {
        asker: room.currentAsker,
        answerer: null,
      });
    }, 30000);
  });

  socket.on("send-message", ({ roomCode, username, message }) => {
    io.to(roomCode).emit("new-message", { username, message });
  });

  socket.on("ask-question", ({ roomCode, toId }) => {
    const room = rooms[roomCode];
    if (!room) return;
    clearTimeout(room.turnTimeout);
    room.currentAnswerer = toId;
    io.to(roomCode).emit("question-turn", {
      asker: room.currentAsker,
      answerer: room.currentAnswerer,
    });
  });

  socket.on("end-answer", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    room.currentAsker = room.currentAnswerer;
    room.currentAnswerer = null;

    io.to(roomCode).emit("question-turn", {
      asker: room.currentAsker,
      answerer: null,
    });

    clearTimeout(room.turnTimeout);
    room.turnTimeout = setTimeout(() => {
      const otherPlayers = room.players.filter(p => p.id !== room.currentAsker);
      if (otherPlayers.length === 0) return;
      const newAsker = otherPlayers[Math.floor(Math.random() * otherPlayers.length)].id;
      room.currentAsker = newAsker;
      io.to(roomCode).emit("question-turn", {
        asker: room.currentAsker,
        answerer: null,
      });
    }, 30000);
  });

  socket.on("vote", ({ roomCode, votedId }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.votes[socket.id] = votedId;
    io.to(roomCode).emit("votes-update", room.votes);
    if (Object.keys(room.votes).length === room.players.length) {
      io.to(roomCode).emit("game-ended", {
        spyId: room.spyId,
        votes: room.votes,
        players: room.players,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("Ayrıldı:", socket.id);
    for (const code in rooms) {
      const room = rooms[code];
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        clearTimeout(room.turnTimeout);
        delete rooms[code];
      } else {
        io.to(code).emit("update-room", room);
      }
    }
  });
});

// Port 3001 (Render'da PORT env değişkeni kullanılmalı)
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
