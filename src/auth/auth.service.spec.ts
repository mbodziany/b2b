import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/services/crypto.service';
import { AuditLogService } from '../common/services/audit-log.service';

jest.mock('argon2');
jest.mock('otplib', () => ({
  authenticator: { verify: jest.fn(), generateSecret: jest.fn(), keyuri: jest.fn() },
}));

const request = { headers: {} } as unknown as Request;

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'clinic@example.com',
    passwordHash: 'hash',
    isActive: true,
    lockedUntil: null,
    failedLoginAttempts: 0,
    mustChangePassword: false,
    mfaEnabled: true,
    mfaSecretEncrypted: 'encrypted-secret',
    clinicId: 'c1',
    ...overrides,
  };
}

describe('AuthService', () => {
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; findUniqueOrThrow: jest.Mock };
  };
  let crypto: CryptoService;
  let auditLog: AuditLogService;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };
    crypto = { decrypt: jest.fn().mockReturnValue('plain-secret') } as unknown as CryptoService;
    auditLog = { record: jest.fn() } as unknown as AuditLogService;
    service = new AuthService(prisma as unknown as PrismaService, crypto, auditLog);
  });

  describe('login', () => {
    it('reports invalid-credentials and audits LOGIN_FAILURE when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.login('missing@example.com', 'whatever', request);

      expect(result).toEqual({ status: 'invalid-credentials' });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN_FAILURE' }),
      );
    });

    it('reports invalid-credentials when the account is deactivated', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ isActive: false }));

      const result = await service.login('clinic@example.com', 'whatever', request);

      expect(result).toEqual({ status: 'invalid-credentials' });
    });

    it('reports locked status without checking the password while the lockout window is active', async () => {
      const lockedUntil = new Date(Date.now() + 5 * 60_000);
      prisma.user.findUnique.mockResolvedValue(baseUser({ lockedUntil }));

      const result = await service.login('clinic@example.com', 'whatever', request);

      expect(result).toEqual({ status: 'locked', lockedUntil });
      expect(argon2.verify).not.toHaveBeenCalled();
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN_FAILURE', metadata: { reason: 'locked' } }),
      );
    });

    it('increments failedLoginAttempts without locking below the threshold', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ failedLoginAttempts: 3 }));
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      const result = await service.login('clinic@example.com', 'wrong-password', request);

      expect(result).toEqual({ status: 'invalid-credentials' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { failedLoginAttempts: 4, lockedUntil: null },
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN_FAILURE', metadata: { attempts: 4 } }),
      );
    });

    it('locks the account once failed attempts reach the threshold of 5', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ failedLoginAttempts: 4 }));
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await service.login('clinic@example.com', 'wrong-password', request);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: expect.any(Date),
        },
      });
      const updateCall = prisma.user.update.mock.calls[0][0];
      const minutesUntilUnlock =
        (updateCall.data.lockedUntil.getTime() - Date.now()) / 60_000;
      expect(minutesUntilUnlock).toBeGreaterThan(14);
      expect(minutesUntilUnlock).toBeLessThanOrEqual(15);
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ACCOUNT_LOCKED' }),
      );
    });

    it('resets the failure counter and returns must-change-password when required', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ mustChangePassword: true }));
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const result = await service.login('clinic@example.com', 'correct-password', request);

      expect(result).toEqual({ status: 'must-change-password', userId: 'u1' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: expect.any(Date) },
      });
    });

    it('returns must-enroll-mfa when MFA has not been set up yet', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ mfaEnabled: false }));
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const result = await service.login('clinic@example.com', 'correct-password', request);

      expect(result).toEqual({ status: 'must-enroll-mfa', userId: 'u1' });
    });

    it('returns must-verify-mfa once password is correct and MFA is already enabled', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser());
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const result = await service.login('clinic@example.com', 'correct-password', request);

      expect(result).toEqual({ status: 'must-verify-mfa', userId: 'u1' });
    });
  });

  describe('verifyMfa', () => {
    it('throws when the user has never completed MFA enrollment', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(baseUser({ mfaSecretEncrypted: null }));

      await expect(service.verifyMfa('u1', '123456', request)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('records a failed attempt and returns false for an invalid token', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(baseUser());
      (authenticator.verify as jest.Mock).mockReturnValue(false);

      const result = await service.verifyMfa('u1', '000000', request);

      expect(result).toBe(false);
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('audits LOGIN_SUCCESS and returns true for a valid token', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(baseUser());
      (authenticator.verify as jest.Mock).mockReturnValue(true);

      const result = await service.verifyMfa('u1', '123456', request);

      expect(result).toBe(true);
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN_SUCCESS', clinicId: 'c1' }),
      );
    });
  });
});
