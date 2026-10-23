import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Role } from '@campusbite/shared';
import { COOKIE_NAME, verifyToken, verifyTrackingToken } from '../../utils/token.js';
import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

const parseCookieString = (cookieHeader?: string): Record<string, string> => {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, str) => {
    const [key, value] = str.trim().split('=');
    if (key && value) acc[key] = decodeURIComponent(value);
    return acc;
  }, {} as Record<string, string>);
};

let ioInstance: SocketIOServer | null = null;
const userSocketsMap = new Map<string, Set<string>>(); // userId -> Set of socketIds

export const initSocketIO = (httpServer: HttpServer): SocketIOServer => {
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true
    }
  });

  // Socket Authentication Middleware
  io.use(async (socket: Socket, next) => {
    try {
      let token: string | undefined;

      // Extract from auth header/handshake or cookie
      if (socket.handshake.auth && socket.handshake.auth.token) {
        token = socket.handshake.auth.token;
      } else if (socket.handshake.headers.cookie) {
        const parsedCookies = parseCookieString(socket.handshake.headers.cookie);
        token = parsedCookies[COOKIE_NAME];
      }

      if (!token) {
        // Public customer tracking sockets can connect without staff token
        // They will join room via subscribe:order event with tracking token
        return next();
      }

      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, role: true, isActive: true, tokenVersion: true }
      });

      if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
        return next(new Error('Authentication failed or account deactivated'));
      }

      // Attach user to socket data
      socket.data.user = {
        id: user.id,
        role: user.role
      };

      next();
    } catch {
      next(new Error('Invalid socket authentication token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;

    if (user) {
      // Map user to socket for targeted disconnects on deactivation
      if (!userSocketsMap.has(user.id)) {
        userSocketsMap.set(user.id, new Set());
      }
      userSocketsMap.get(user.id)!.add(socket.id);

      // Join role room
      if (user.role === Role.ADMIN) {
        socket.join('staff:admin');
        socket.join('staff:counter');
        socket.join('staff:kitchen');
      } else if (user.role === Role.COUNTER) {
        socket.join('staff:counter');
      } else if (user.role === Role.KITCHEN) {
        socket.join('staff:kitchen');
      }

      logger.info(`Staff socket connected: ${user.id} (${user.role})`, 'SocketIO', { socketId: socket.id });
    }

    socket.on('disconnect', () => {
      if (user && userSocketsMap.has(user.id)) {
        userSocketsMap.get(user.id)!.delete(socket.id);
        if (userSocketsMap.get(user.id)!.size === 0) {
          userSocketsMap.delete(user.id);
        }
      }
    });

    // Customer tracking subscription (verified via tracking token)
    socket.on('subscribe:order', (data: { trackingToken: string; orderId: string }) => {
      try {
        if (!data || !data.trackingToken || !data.orderId) return;
        const payload = verifyTrackingToken(data.trackingToken);
        if (payload.orderId === data.orderId) {
          socket.join(`order:${data.orderId}`);
          logger.info(`Customer socket joined order room: ${data.orderId}`, 'SocketIO', { socketId: socket.id });
        }
      } catch {
        // invalid token ignored
      }
    });

    // Public cafeteria display board subscription
    socket.on('subscribe:board', () => {
      socket.join('board:public');
      logger.info('Display board socket subscribed', 'SocketIO', { socketId: socket.id });
    });
  });

  ioInstance = io;
  return io;
};

export const getIO = (): SocketIOServer | null => ioInstance;

/**
 * Immediately disconnect all active sockets of a deactivated or password-reset user
 */
export const disconnectUserSockets = (userId: string): void => {
  if (!ioInstance) return;
  const socketIds = userSocketsMap.get(userId);
  if (socketIds) {
    for (const socketId of socketIds) {
      const s = ioInstance.sockets.sockets.get(socketId);
      if (s) {
        s.emit('session_revoked', { message: 'Your session has been terminated by an administrator.' });
        s.disconnect(true);
      }
    }
    userSocketsMap.delete(userId);
    logger.info(`Terminated active sockets for deactivated user: ${userId}`, 'SocketIO');
  }
};
