import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClinicScopeGuard } from './clinic-scope.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../services/audit-log.service';
import { ClinicScopedMeta } from '../decorators/clinic-scoped.decorator';

function createContext(user: { id: string; role: string; clinicId: string | null }): ExecutionContext {
  return {
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user, params: { id: 'record-1' } }),
    }),
  } as unknown as ExecutionContext;
}

describe('ClinicScopeGuard', () => {
  let reflector: Reflector;
  let prisma: { invoice: { findUnique: jest.Mock }; usgExam: { findUnique: jest.Mock } };
  let auditLog: AuditLogService;
  let guard: ClinicScopeGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    prisma = {
      invoice: { findUnique: jest.fn() },
      usgExam: { findUnique: jest.fn() },
    };
    auditLog = { record: jest.fn() } as unknown as AuditLogService;
    guard = new ClinicScopeGuard(reflector, prisma as unknown as PrismaService, auditLog);
  });

  it('allows the request when the route is not clinic-scoped', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

    await expect(
      guard.canActivate(createContext({ id: 'u1', role: 'CLINIC_USER', clinicId: 'c1' })),
    ).resolves.toBe(true);
    expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
  });

  it('allows internal staff/admin to bypass the clinic-scope check', async () => {
    const meta: ClinicScopedMeta = { entity: 'invoice', param: 'id' };
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(meta);

    await expect(
      guard.canActivate(createContext({ id: 'staff-1', role: 'INTERNAL_STAFF', clinicId: null })),
    ).resolves.toBe(true);
    expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
  });

  it('allows a clinic user when the record belongs to their own clinic', async () => {
    const meta: ClinicScopedMeta = { entity: 'invoice', param: 'id' };
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(meta);
    prisma.invoice.findUnique.mockResolvedValue({ clinicId: 'c1' });

    await expect(
      guard.canActivate(createContext({ id: 'u1', role: 'CLINIC_USER', clinicId: 'c1' })),
    ).resolves.toBe(true);
    expect(prisma.invoice.findUnique).toHaveBeenCalledWith({
      where: { id: 'record-1' },
      select: { clinicId: true },
    });
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('queries usgExam when the metadata entity is usgExam', async () => {
    const meta: ClinicScopedMeta = { entity: 'usgExam', param: 'id' };
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(meta);
    prisma.usgExam.findUnique.mockResolvedValue({ clinicId: 'c1' });

    await expect(
      guard.canActivate(createContext({ id: 'u1', role: 'CLINIC_USER', clinicId: 'c1' })),
    ).resolves.toBe(true);
    expect(prisma.usgExam.findUnique).toHaveBeenCalled();
  });

  it('returns 404 (not 403) and audits when the record belongs to a different clinic', async () => {
    const meta: ClinicScopedMeta = { entity: 'invoice', param: 'id' };
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(meta);
    prisma.invoice.findUnique.mockResolvedValue({ clinicId: 'other-clinic' });

    await expect(
      guard.canActivate(createContext({ id: 'u1', role: 'CLINIC_USER', clinicId: 'c1' })),
    ).rejects.toThrow(NotFoundException);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCESS_DENIED', entityId: 'record-1' }),
    );
  });

  it('returns 404 and audits when the record does not exist at all', async () => {
    const meta: ClinicScopedMeta = { entity: 'invoice', param: 'id' };
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(meta);
    prisma.invoice.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(createContext({ id: 'u1', role: 'CLINIC_USER', clinicId: 'c1' })),
    ).rejects.toThrow(NotFoundException);
    expect(auditLog.record).toHaveBeenCalled();
  });
});
