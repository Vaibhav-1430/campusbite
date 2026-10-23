import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../app.js';
import { initSocketIO } from '../modules/events/socket.js';
import { cleanDatabase, createTestUser } from './test-helper.js';
import { Role } from '@campusbite/shared';
import { prisma } from '../database/prisma.js';
import * as userService from '../modules/users/user.service.js';

describe('Socket.IO Real-Time Authentication & Revocation Gate', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll(async () => {
    await cleanDatabase();
    const app = createApp();
    server = http.createServer(app);
    initSocketIO(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 5001;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  });

  it('should authenticate valid staff socket and join designated room', async () => {
    const { token } = await createTestUser({ role: Role.COUNTER });

    const clientSocket: ClientSocket = Client(`http://localhost:${serverPort}`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true
    });

    await new Promise<void>((resolve, reject) => {
      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        clientSocket.disconnect();
        resolve();
      });
      clientSocket.on('connect_error', (err) => {
        reject(err);
      });
    });
  });

  it('should reject socket connection when token is invalid or expired', async () => {
    const clientSocket: ClientSocket = Client(`http://localhost:${serverPort}`, {
      auth: { token: 'invalid_malformed_token' },
      transports: ['websocket'],
      forceNew: true
    });

    await new Promise<void>((resolve) => {
      clientSocket.on('connect_error', (err) => {
        expect(err.message).toContain('Invalid socket authentication token');
        clientSocket.disconnect();
        resolve();
      });
    });
  });

  it('should disconnect active socket immediately when staff user is deactivated and reject reconnects', async () => {
    const { user: adminUser } = await createTestUser({ role: Role.ADMIN });
    const { user: counterUser, token: counterToken } = await createTestUser({ role: Role.COUNTER });

    const clientSocket: ClientSocket = Client(`http://localhost:${serverPort}`, {
      auth: { token: counterToken },
      transports: ['websocket'],
      forceNew: true
    });

    // 1. Wait for socket to connect
    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        resolve();
      });
    });

    // 2. Set up listener for session_revoked event and disconnect BEFORE triggering deactivation
    let sessionRevokedReceived = false;
    clientSocket.on('session_revoked', () => {
      sessionRevokedReceived = true;
    });

    const disconnectPromise = new Promise<void>((resolve) => {
      clientSocket.on('disconnect', () => {
        resolve();
      });
    });

    // 3. Admin deactivates staff member
    await userService.updateUserStatus(counterUser.id, false, adminUser.id, Role.ADMIN);

    // 4. Await the disconnect event
    await disconnectPromise;
    expect(sessionRevokedReceived).toBe(true);
    expect(clientSocket.connected).toBe(false);

    // 5. Attempting to reconnect with the old token MUST be rejected
    const reconnectSocket = Client(`http://localhost:${serverPort}`, {
      auth: { token: counterToken },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    });

    await new Promise<void>((resolve) => {
      reconnectSocket.on('connect_error', (err) => {
        expect(err.message).toContain('Authentication failed or account deactivated');
        reconnectSocket.disconnect();
        resolve();
      });
    });
  });
});
