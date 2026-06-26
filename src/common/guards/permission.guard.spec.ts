import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { AuditLogService } from '../services/audit-log.service';

function createContext(user: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user, path: '/portal/usg' }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  let reflector: Reflector;
  let auditLog: AuditLogService;
  let guard: PermissionGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    auditLog = { record: jest.fn() } as unknown as AuditLogService;
    guard = new PermissionGuard(reflector, auditLog);
  });

  it('allows the request when no permission is required', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

    await expect(
      guard.canActivate(createContext({ id: 'u1', canViewUsg: false })),
    ).resolves.toBe(true);
  });

  it('allows the request when the user has the required permission flag', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue('canViewUsg');

    await expect(
      guard.canActivate(createContext({ id: 'u1', canViewUsg: true })),
    ).resolves.toBe(true);
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('denies and audits the request when the permission flag is false', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue('canViewInvoices');

    await expect(
      guard.canActivate(createContext({ id: 'u1', clinicId: 'c1', canViewInvoices: false })),
    ).rejects.toThrow(ForbiddenException);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u1',
        clinicId: 'c1',
        action: 'ACCESS_DENIED',
        metadata: expect.objectContaining({ permission: 'canViewInvoices' }),
      }),
    );
  });

  it('denies the request when the permission flag is missing entirely', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue('canViewUsg');

    await expect(guard.canActivate(createContext({ id: 'u1' }))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
