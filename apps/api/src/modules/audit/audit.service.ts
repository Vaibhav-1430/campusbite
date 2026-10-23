import { Role } from '@campusbite/shared';
import { prisma } from '../../database/prisma.js';
import { logger } from '../../utils/logger.js';

export interface LogAuditParams {
  actorId: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string;
}

export const logAudit = async (params: LogAuditParams): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        metadataJson: (params.metadata as any) ?? undefined,
        ipAddress: params.ipAddress
      }
    });
  } catch (err) {
    logger.error('Failed to write audit log entry', 'AuditService', { error: String(err) });
  }
};
