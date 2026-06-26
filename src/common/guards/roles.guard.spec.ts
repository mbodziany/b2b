import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { AuditLogService } from '../services/audit-log.service';

function createContext(user: { id: string; role: string }): ExecutionContext {
  return {
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user, path: '/internal/users' }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let auditLog: AuditLogService;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    auditLog = { record: jest.fn() } as unknown as AuditLogService;
    guard = new RolesGuard(reflector, auditLog);
  });

  it('allows the request when no roles are required', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

    await expect(guard.canActivate(createContext({ id: 'u1', role: 'CLINIC_USER' }))).resolves.toBe(
      true,
    );
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('allows the request when the user role is in the required list', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['INTERNAL_ADMIN', 'INTERNAL_STAFF']);

    await expect(
      guard.canActivate(createContext({ id: 'u1', role: 'INTERNAL_STAFF' })),
    ).resolves.toBe(true);
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('denies and audits the request when the user role is not in the required list', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['INTERNAL_ADMIN']);

    await expect(
      guard.canActivate(createContext({ id: 'u1', role: 'CLINIC_USER' })),
    ).rejects.toThrow(ForbiddenException);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'u1', action: 'ACCESS_DENIED' }),
    );
  });
});
