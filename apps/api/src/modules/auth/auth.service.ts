import { LoginInput, AuthSessionUser, Role } from '@campusbite/shared';
import { prisma } from '../../database/prisma.js';
import { comparePassword } from '../../utils/password.js';
import { generateToken } from '../../utils/token.js';
import { UnauthorizedError, ForbiddenError } from '../../utils/errors.js';
import { logAudit } from '../audit/audit.service.js';

export const login = async (
  input: LoginInput,
  ipAddress?: string
): Promise<{ token: string; user: AuthSessionUser }> => {
  const user = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password combination.', 'INVALID_CREDENTIALS');
  }

  const isPasswordValid = await comparePassword(input.password, user.passwordHash);
  if (!isPasswordValid) {
    throw new UnauthorizedError('Invalid email or password combination.', 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw new ForbiddenError(
      'Your staff account has been deactivated. Please contact an administrator.',
      'ACCOUNT_DEACTIVATED'
    );
  }

  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role as Role,
    tokenVersion: user.tokenVersion
  });

  const sessionUser: AuthSessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role
  };

  // Record login in audit log
  await logAudit({
    actorId: user.id,
    actorRole: user.role as Role,
    action: 'USER_LOGIN',
    entityType: 'User',
    entityId: user.id,
    ipAddress
  });

  return { token, user: sessionUser };
};
