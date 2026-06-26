import { Request } from 'express';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuditLogService', () => {
  let prisma: { auditLog: { create: jest.Mock } };
  let service: AuditLogService;

  beforeEach(() => {
    prisma = { auditLog: { create: jest.fn() } };
    service = new AuditLogService(prisma as unknown as PrismaService);
  });

  it('creates an append-only entry with actorId/clinicId defaulted to null when absent', async () => {
    await service.record({ action: 'LOGIN_FAILURE', metadata: { email: 'x@example.com' } });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: null,
        clinicId: null,
        action: 'LOGIN_FAILURE',
        ipAddress: undefined,
        userAgent: undefined,
      }),
    });
  });

  it('extracts the IP address from request.ip when present', async () => {
    const request = { ip: '203.0.113.5', headers: { 'user-agent': 'test-agent' }, socket: {} } as unknown as Request;

    await service.record({ action: 'LOGIN_SUCCESS', actorId: 'u1', request });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ipAddress: '203.0.113.5', userAgent: 'test-agent' }),
    });
  });

  it('falls back to the socket remote address when request.ip is unavailable', async () => {
    const request = {
      ip: undefined,
      headers: {},
      socket: { remoteAddress: '198.51.100.9' },
    } as unknown as Request;

    await service.record({ action: 'LOGIN_SUCCESS', actorId: 'u1', request });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ipAddress: '198.51.100.9' }),
    });
  });

  it('falls back to "unknown" when neither request.ip nor the socket address is available', async () => {
    const request = { ip: undefined, headers: {}, socket: {} } as unknown as Request;

    await service.record({ action: 'LOGIN_SUCCESS', actorId: 'u1', request });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ipAddress: 'unknown' }),
    });
  });
});
