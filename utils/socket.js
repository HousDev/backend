// socket.js
const { Server } = require("socket.io");

let io = null;

/** Init once with HTTP server instance */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN,
      credentials: true,
    },
    path: "/socket.io",
  });

  // Authentication-lite: query/userId OR token se parse kijiye (prod me JWT verify karein)
  io.on("connection", (socket) => {
    const { userId } = socket.handshake.query || {};
    // TODO: yahan JWT verify karke userId nikaal sakte ho
    if (!userId) {
      console.warn("Socket connected without userId, disconnecting.");
      socket.disconnect(true);
      return;
    }

    const room = `user:${userId}`;
    socket.join(room);
    // optional logs
    // console.log(`✅ Socket joined room ${room} — ${socket.id}`);

    socket.on("disconnect", () => {
      // console.log(`❌ Socket disconnected ${socket.id}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error("Socket.io not initialized yet!");
  return io;
}

function emitToUser(userId, event, payload) {
  if (!io) return;
  const room = `user:${userId}`;
  io.to(room).emit(event, payload);
}

module.exports = { initSocket, getIO, emitToUser };
