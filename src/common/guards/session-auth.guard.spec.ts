import { ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from './session-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { RedirectException } from '../exceptions/redirect.exception';

function createContext(session: Record<string, unknown>): { context: ExecutionContext; request: Request } {
  const request = { session } as unknown as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('SessionAuthGuard', () => {
  let prisma: { user: { findUnique: jest.Mock }; clinic: { findUnique: jest.Mock } };
  let guard: SessionAuthGuard;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      clinic: { findUnique: jest.fn() },
    };
    guard = new SessionAuthGuard(prisma as unknown as PrismaService);
  });

  it('redirects to /login when there is no userId on the session', async () => {
    const { context } = createContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(RedirectException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('redirects and clears the session when loginAt is missing', async () => {
    const { context, request } = createContext({ userId: 'u1' });

    await expect(guard.canActivate(context)).rejects.toThrow(RedirectException);
    expect(request.session.userId).toBeUndefined();
  });

  it('redirects and clears the session once the absolute session lifetime is exceeded', async () => {
    const nineHoursAgo = Date.now() - 9 * 60 * 60_000;
    const { context, request } = createContext({ userId: 'u1', loginAt: nineHoursAgo });

    await expect(guard.canActivate(context)).rejects.toThrow(RedirectException);
    expect(request.session.userId).toBeUndefined();
    expect(request.session.loginAt).toBeUndefined();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('redirects when the account backing the session is no longer active', async () => {
    const oneHourAgo = Date.now() - 60 * 60_000;
    const { context, request } = createContext({ userId: 'u1', loginAt: oneHourAgo });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', isActive: false, clinicId: null });

    await expect(guard.canActivate(context)).rejects.toThrow(RedirectException);
    expect(request.session.userId).toBeUndefined();
  });

  it('redirects when the user belongs to a clinic that has been blocked', async () => {
    const oneHourAgo = Date.now() - 60 * 60_000;
    const { context } = createContext({ userId: 'u1', loginAt: oneHourAgo });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', isActive: true, clinicId: 'c1' });
    prisma.clinic.findUnique.mockResolvedValue({ id: 'c1', isActive: false });

    await expect(guard.canActivate(context)).rejects.toThrow(RedirectException);
  });

  it('allows the request and attaches the user when the session is valid', async () => {
    const oneHourAgo = Date.now() - 60 * 60_000;
    const { context, request } = createContext({ userId: 'u1', loginAt: oneHourAgo });
    const user = { id: 'u1', isActive: true, clinicId: 'c1' };
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.clinic.findUnique.mockResolvedValue({ id: 'c1', isActive: true });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((request as Request & { user: unknown }).user).toBe(user);
  });

  it('allows internal users without a clinicId without checking the clinic table', async () => {
    const oneHourAgo = Date.now() - 60 * 60_000;
    const { context } = createContext({ userId: 'staff-1', loginAt: oneHourAgo });
    prisma.user.findUnique.mockResolvedValue({ id: 'staff-1', isActive: true, clinicId: null });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.clinic.findUnique).not.toHaveBeenCalled();
  });
});
