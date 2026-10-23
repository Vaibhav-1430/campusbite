import http from 'http';
import { createApp } from './app.js';
import { initSocketIO } from './modules/events/socket.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { prisma } from './database/prisma.js';

const app = createApp();
const server = http.createServer(app);

// Initialize Socket.IO with server
initSocketIO(server);

server.listen(env.PORT, () => {
  logger.info(`CampusBite API server running in ${env.NODE_ENV} mode on port ${env.PORT}`, 'Server');
});

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`, 'Server');
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Database disconnected and server closed.', 'Server');
    process.exit(0);
  });

  // Force close after 10s if stuck
  setTimeout(() => {
    logger.error('Force closing server after timeout.', 'Server');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
