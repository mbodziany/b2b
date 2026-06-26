import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { RedirectException } from '../exceptions/redirect.exception';

const ABSOLUTE_SESSION_MS = (Number(process.env.SESSION_ABSOLUTE_TIMEOUT_HOURS) || 8) * 60 * 60_000;

/**
 * Confirms the session represents a fully authenticated user (password +
 * MFA both verified - see auth.service.ts) and that the account is still
 * active. Must run before RolesGuard/PermissionGuard/ClinicScopeGuard.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const userId = request.session.userId;
    if (!userId) {
      throw new RedirectException('/login');
    }

    // Absolute session lifetime - independent of the rolling idle timeout
    // configured on the cookie itself (main.ts). Forces re-authentication
    // (incl. MFA) after a fixed period even if the session stays active.
    const loginAt = request.session.loginAt;
    if (!loginAt || Date.now() - loginAt > ABSOLUTE_SESSION_MS) {
      request.session.userId = undefined;
      request.session.role = undefined;
      request.session.clinicId = undefined;
      request.session.loginAt = undefined;
      throw new RedirectException('/login');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      request.session.userId = undefined;
      request.session.role = undefined;
      request.session.clinicId = undefined;
      throw new RedirectException('/login');
    }

    if (user.clinicId) {
      const clinic = await this.prisma.clinic.findUnique({ where: { id: user.clinicId } });
      if (!clinic || !clinic.isActive) {
        throw new RedirectException('/login');
      }
    }

    (request as Request & { user: typeof user }).user = user;
    return true;
  }
}
