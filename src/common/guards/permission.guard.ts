import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/permissions.decorator';
import { AuditLogService } from '../services/audit-log.service';
import { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLog: AuditLogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!permission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const hasPermission = (request.user as unknown as Record<string, boolean>)[permission] === true;
    if (hasPermission) {
      return true;
    }

    await this.auditLog.record({
      actorId: request.user.id,
      clinicId: request.user.clinicId,
      action: 'ACCESS_DENIED',
      request,
      metadata: { reason: 'permission', permission, path: request.path },
    });
    throw new ForbiddenException('Nie masz uprawnień do przeglądania tych danych.');
  }
}
