import { Server } from 'socket.io';

let io;

function initSocket(server) {
  const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    // Join an order-scoped chat room
    socket.on('join:order', (orderId) => {
      socket.join(`order:${orderId}`);
    });

    socket.on('disconnect', () => {});
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

export { getIO };
export default initSocket;
