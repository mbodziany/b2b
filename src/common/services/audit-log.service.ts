import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuditAction } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntryInput {
  actorId?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  clinicId?: string | null;
  request?: Request;
  metadata?: Record<string, unknown>;
}

/**
 * Audit log is append-only by design: this service only ever creates rows,
 * there is no update/delete path exposed anywhere in the application.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntryInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        clinicId: entry.clinicId ?? null,
        ipAddress: entry.request ? this.extractIp(entry.request) : undefined,
        userAgent: entry.request?.headers['user-agent'],
        metadata: entry.metadata as never,
      },
    });
  }

  private extractIp(request: Request): string {
    return request.ip ?? request.socket.remoteAddress ?? 'unknown';
  }
}
