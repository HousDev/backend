// // socket.js
// const { Server } = require("socket.io");

// let io = null;

// /** Init once with HTTP server instance */
// function initSocket(httpServer) {
//   io = new Server(httpServer, {
//     cors: {
//       origin: process.env.CORS_ORIGIN,
//       credentials: true,
//     },
//     path: "/socket.io",
//   });

//   // Authentication-lite: query/userId OR token se parse kijiye (prod me JWT verify karein)
//   io.on("connection", (socket) => {
//     const { userId } = socket.handshake.query || {};
//     // TODO: yahan JWT verify karke userId nikaal sakte ho
//     if (!userId) {
//       console.warn("Socket connected without userId, disconnecting.");
//       socket.disconnect(true);
//       return;
//     }

//     const room = `user:${userId}`;
//     socket.join(room);
    

//     socket.on("disconnect", () => {
     
//     });
//   });

//   return io;
// }

// function getIO() {
//   if (!io) throw new Error("Socket.io not initialized yet!");
//   return io;
// }

// function emitToUser(userId, event, payload) {
//   if (!io) return;
//   const room = `user:${userId}`;
//   io.to(room).emit(event, payload);
// }

// module.exports = { initSocket, getIO, emitToUser };


// utils/socket.js
const { Server } = require("socket.io");

let io = null;

/** Init once with HTTP server instance */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      credentials: true,
    },
    path: "/socket.io",
  });

  io.on("connection", (socket) => {
    const { userId } = socket.handshake.query || {};
    
    if (!userId) {
      console.warn("Socket connected without userId, disconnecting.");
      socket.disconnect(true);
      return;
    }

    // ✅ Join user room
    const userRoom = `user:${userId}`;
    socket.join(userRoom);
    console.log(`✅ User ${userId} connected to room: ${userRoom}`);

    // ✅ Join specific contact room for real-time chat
    socket.on("join_contact_room", (contactId) => {
      const contactRoom = `contact:${contactId}`;
      socket.join(contactRoom);
      console.log(`✅ User ${userId} joined contact room: ${contactRoom}`);
    });

    // ✅ Leave specific contact room
    socket.on("leave_contact_room", (contactId) => {
      const contactRoom = `contact:${contactId}`;
      socket.leave(contactRoom);
      console.log(`📤 User ${userId} left contact room: ${contactRoom}`);
    });

    // ✅ Handle new message event (broadcast to other users in same contact room)
    socket.on("new_message", (data) => {
      const { contactId, message, senderId } = data;
      const contactRoom = `contact:${contactId}`;
      
      // Broadcast to everyone in the contact room EXCEPT the sender
      socket.to(contactRoom).emit("chat_update", {
        contact_id: contactId,
        text: message.text,
        message_id: message.id,
        direction: "in",
        timestamp: new Date().toISOString(),
      });
      
      console.log(`📤 Message broadcasted to contact room: ${contactRoom}`);
    });

    socket.on("disconnect", () => {
      console.log(`❌ User ${userId} disconnected`);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error("Socket.io not initialized yet!");
  return io;
}

// ✅ Emit to specific user
function emitToUser(userId, event, payload) {
  if (!io) return;
  const room = `user:${userId}`;
  io.to(room).emit(event, payload);
  console.log(`📤 Emitted ${event} to user: ${userId}`);
}

// ✅ Emit to specific contact room (for real-time chat)
function emitToContactRoom(contactId, event, payload) {
  if (!io) return;
  const room = `contact:${contactId}`;
  io.to(room).emit(event, payload);
  console.log(`📤 Emitted ${event} to contact room: ${contactId}`);
}

module.exports = { initSocket, getIO, emitToUser, emitToContactRoom };