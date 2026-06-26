import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../services/audit-log.service';
import { CLINIC_SCOPED_KEY, ClinicScopedMeta } from '../decorators/clinic-scoped.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Hard tenant-isolation boundary: a CLINIC_USER may only reach records that
 * belong to their own clinic. A mismatch and a "does not exist" both yield
 * 404 (never 403) so an attacker probing other clinics' ids cannot tell the
 * two cases apart. This is intentionally redundant with the clinicId filter
 * applied again in the service query - two independent layers.
 */
@Injectable()
export class ClinicScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<ClinicScopedMeta | undefined>(
      CLINIC_SCOPED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user.role !== 'CLINIC_USER') {
      return true;
    }

    const recordId = String(request.params[meta.param]);
    const record = await this.findRecordClinicId(meta.entity, recordId);

    if (!record || record.clinicId !== request.user.clinicId) {
      await this.auditLog.record({
        actorId: request.user.id,
        clinicId: request.user.clinicId,
        action: 'ACCESS_DENIED',
        request,
        entityType: meta.entity,
        entityId: recordId,
        metadata: { reason: 'clinic-scope' },
      });
      throw new NotFoundException('Nie znaleziono zasobu.');
    }

    return true;
  }

  private async findRecordClinicId(
    entity: ClinicScopedMeta['entity'],
    id: string,
  ): Promise<{ clinicId: string } | null> {
    if (entity === 'invoice') {
      return this.prisma.invoice.findUnique({ where: { id }, select: { clinicId: true } });
    }
    return this.prisma.usgExam.findUnique({ where: { id }, select: { clinicId: true } });
  }
}
