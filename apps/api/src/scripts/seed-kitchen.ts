import { prisma } from '../database/prisma.js';
import { hashPassword } from '../utils/password.js';
import { Role } from '@campusbite/shared';
import { getSanitizedConnectionInfo } from '../database/connection-url.js';
import { isProhibitedProductionHost } from '../database/safety-guard.js';
import { env } from '../config/env.js';

async function main() {
  const dbInfo = getSanitizedConnectionInfo(env.DATABASE_URL);
  if (isProhibitedProductionHost(dbInfo.host) || dbInfo.isNeon || env.NODE_ENV === 'production') {
    console.error(
      `CRITICAL SAFETY ABORT: Refusing to run kitchen seed against production target "${dbInfo.host}/${dbInfo.database}".`
    );
    process.exit(1);
  }

  const users = await prisma.user.findMany();
  console.log(`Existing users in ${dbInfo.database}:`, users.map((u) => ({ email: u.email, role: u.role, name: u.name })));

  const kitchenUser = users.find((u) => u.role === Role.KITCHEN);
  if (!kitchenUser) {
    const passwordHash = await hashPassword('KitchenPassword123!');
    const created = await prisma.user.create({
      data: {
        name: 'Suresh Chef',
        email: 'chef.suresh@campusbite.internal',
        passwordHash,
        role: Role.KITCHEN,
        isActive: true
      }
    });
    console.log('Created kitchen staff:', created.email);
  }

  const counterUser = users.find((u) => u.role === Role.COUNTER);
  if (!counterUser) {
    const passwordHash = await hashPassword('CounterPassword123!');
    const created = await prisma.user.create({
      data: {
        name: 'Ramesh Sharma',
        email: 'ramesh@campusbite.internal',
        passwordHash,
        role: Role.COUNTER,
        isActive: true
      }
    });
    console.log('Created counter staff:', created.email);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
