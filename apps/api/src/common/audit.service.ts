import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthContext } from './guards';

export interface AuditEvent {
  action: string;
  entityType: string;
  entityId?: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async tenant(auth: AuthContext, event: AuditEvent): Promise<void> {
    await this.prisma.db.auditLog.create({
      data: {
        tenantId: auth.tenantId!,
        actorId: auth.userId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        reason: event.reason,
        before: (event.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (event.after ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: event.ip,
      },
    });
  }

  async platform(
    actorUserId: string | null,
    event: AuditEvent & { tenantId?: string; reason?: string },
  ): Promise<void> {
    await this.prisma.adminAudit.create({
      data: {
        actorUserId,
        action: event.action,
        targetType: event.entityType,
        targetId: event.entityId,
        tenantId: event.tenantId,
        reason: event.reason,
        before: (event.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (event.after ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: event.ip,
      },
    });
  }
}
