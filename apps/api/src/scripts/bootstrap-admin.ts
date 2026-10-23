import { Role } from '@campusbite/shared';
import { prisma } from '../database/prisma.js';
import { hashPassword } from '../utils/password.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export const bootstrapAdmin = async () => {
  try {
    // Check if an admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: { role: Role.ADMIN }
    });

    if (existingAdmin) {
      logger.info(
        `Bootstrap skipped: An administrator account already exists (${existingAdmin.email}).`,
        'BootstrapAdmin'
      );
      return existingAdmin;
    }

    const email = (process.env.INITIAL_ADMIN_EMAIL || env.INITIAL_ADMIN_EMAIL).trim().toLowerCase();
    const name = process.env.INITIAL_ADMIN_NAME || env.INITIAL_ADMIN_NAME;
    const password = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;

    // Validate password strength
    if (!password || password.length < 8) {
      throw new Error('Initial admin password must be at least 8 characters long.');
    }

    const passwordHash = await hashPassword(password);

    const admin = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: Role.ADMIN,
        isActive: true
      }
    });

    logger.info(`Root administrator account successfully bootstrapped: ${admin.email}`, 'BootstrapAdmin');
    return admin;
  } catch (err) {
    logger.error('Failed to bootstrap root administrator', 'BootstrapAdmin', { error: String(err) });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

// Execute if run directly from CLI
if (process.argv[1]?.includes('bootstrap-admin')) {
  bootstrapAdmin();
}
