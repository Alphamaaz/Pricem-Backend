import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt.js';
import User from '../modules/users/user.model.js';

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

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Not authenticated'));
      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.id).select('_id isActive');
      if (!user?.isActive) return next(new Error('Not authenticated'));
      socket.userId = String(user._id);
      return next();
    } catch {
      return next(new Error('Not authenticated'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
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

function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export { emitToUser, getIO };
export default initSocket;
