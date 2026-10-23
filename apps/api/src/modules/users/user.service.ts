import { CreateUserInput, SafeUser, Role } from '@campusbite/shared';
import { prisma } from '../../database/prisma.js';
import { hashPassword } from '../../utils/password.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { logAudit } from '../audit/audit.service.js';
import { disconnectUserSockets } from '../events/socket.js';

export const listUsers = async (): Promise<SafeUser[]> => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return users.map((u) => ({
    ...u,
    role: u.role as Role,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString()
  }));
};

export const createUser = async (
  input: CreateUserInput,
  actorId: string,
  actorRole: Role,
  ipAddress?: string
): Promise<SafeUser> => {
  const existing = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (existing) {
    throw new ConflictError('A staff member with this email address already exists.', 'EMAIL_TAKEN');
  }

  const passwordHash = await hashPassword(input.password);

  const newUser = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      isActive: true
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });

  await logAudit({
    actorId,
    actorRole,
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: newUser.id,
    metadata: { createdRole: newUser.role, email: newUser.email },
    ipAddress
  });

  return {
    ...newUser,
    role: newUser.role as Role,
    createdAt: newUser.createdAt.toISOString(),
    updatedAt: newUser.updatedAt.toISOString()
  };
};

export const updateUserStatus = async (
  userId: string,
  isActive: boolean,
  actorId: string,
  actorRole: Role,
  ipAddress?: string
): Promise<SafeUser> => {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new NotFoundError('Staff user not found.', 'USER_NOT_FOUND');
  }

  if (user.id === actorId && !isActive) {
    throw new BadRequestError('You cannot deactivate your own administrative account.', 'CANNOT_SELF_DEACTIVATE');
  }

  // If deactivating, increment tokenVersion to immediately kill all active JWT sessions
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      isActive,
      ...(isActive ? {} : { tokenVersion: { increment: 1 } })
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });

  // If deactivating, also sever any active Socket.IO connections
  if (!isActive) {
    disconnectUserSockets(userId);
  }

  await logAudit({
    actorId,
    actorRole,
    action: 'USER_STATUS_UPDATED',
    entityType: 'User',
    entityId: updatedUser.id,
    metadata: { previousStatus: user.isActive, newStatus: isActive },
    ipAddress
  });

  return {
    ...updatedUser,
    role: updatedUser.role as Role,
    createdAt: updatedUser.createdAt.toISOString(),
    updatedAt: updatedUser.updatedAt.toISOString()
  };
};

export const resetPassword = async (
  userId: string,
  newPassword: string,
  actorId: string,
  actorRole: Role,
  ipAddress?: string
): Promise<{ message: string }> => {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new NotFoundError('Staff user not found.', 'USER_NOT_FOUND');
  }

  const passwordHash = await hashPassword(newPassword);

  // Increment tokenVersion so existing sessions are revoked
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      tokenVersion: { increment: 1 }
    }
  });

  // Disconnect active sockets
  disconnectUserSockets(userId);

  await logAudit({
    actorId,
    actorRole,
    action: 'USER_PASSWORD_RESET',
    entityType: 'User',
    entityId: userId,
    ipAddress
  });

  return { message: 'Password has been successfully reset. Active sessions revoked.' };
};
