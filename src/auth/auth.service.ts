import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/services/crypto.service';
import { AuditLogService } from '../common/services/audit-log.service';

const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MINUTES = 15;
const MFA_ISSUER = 'Portal B2B Przychodni';

export type LoginOutcome =
  | { status: 'invalid-credentials' }
  | { status: 'locked'; lockedUntil: Date }
  | { status: 'must-change-password'; userId: string }
  | { status: 'must-enroll-mfa'; userId: string }
  | { status: 'must-verify-mfa'; userId: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly auditLog: AuditLogService,
  ) {}

  async login(email: string, password: string, request: Request): Promise<LoginOutcome> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (!user || !user.isActive) {
      await this.auditLog.record({ action: 'LOGIN_FAILURE', request, metadata: { email } });
      return { status: 'invalid-credentials' };
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.auditLog.record({
        actorId: user.id,
        action: 'LOGIN_FAILURE',
        request,
        metadata: { reason: 'locked' },
      });
      return { status: 'locked', lockedUntil: user.lockedUntil };
    }

    const passwordValid = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!passwordValid) {
      await this.recordFailedAttempt(user, request);
      return { status: 'invalid-credentials' };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    if (user.mustChangePassword) {
      return { status: 'must-change-password', userId: user.id };
    }
    if (!user.mfaEnabled) {
      return { status: 'must-enroll-mfa', userId: user.id };
    }
    return { status: 'must-verify-mfa', userId: user.id };
  }

  private async recordFailedAttempt(user: User, request: Request): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= LOCK_THRESHOLD;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60_000) : null,
      },
    });
    await this.auditLog.record({
      actorId: user.id,
      action: shouldLock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILURE',
      request,
      metadata: { attempts },
    });
  }

  async changePassword(userId: string, newPassword: string, request: Request): Promise<void> {
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    await this.auditLog.record({ actorId: userId, action: 'PASSWORD_CHANGED', request });
  }

  /** Generates (but does not persist) a fresh TOTP secret for enrollment. */
  generateMfaSecret(): string {
    return authenticator.generateSecret();
  }

  async buildMfaQrCodeDataUrl(email: string, secret: string): Promise<string> {
    const otpauthUrl = authenticator.keyuri(email, MFA_ISSUER, secret);
    return qrcode.toDataURL(otpauthUrl);
  }

  async confirmMfaEnrollment(
    userId: string,
    secret: string,
    token: string,
    request: Request,
  ): Promise<boolean> {
    const valid = authenticator.verify({ token, secret });
    if (!valid) {
      await this.auditLog.record({ actorId: userId, action: 'MFA_FAILED', request });
      return false;
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaSecretEncrypted: this.crypto.encrypt(secret) },
    });
    await this.auditLog.record({ actorId: userId, action: 'MFA_ENROLLED', request });
    return true;
  }

  async verifyMfa(userId: string, token: string, request: Request): Promise<boolean> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecretEncrypted) {
      throw new UnauthorizedException('MFA nie zostało skonfigurowane.');
    }
    const secret = this.crypto.decrypt(user.mfaSecretEncrypted);
    const valid = authenticator.verify({ token, secret });

    if (!valid) {
      await this.recordFailedAttempt(user, request);
      return false;
    }

    await this.auditLog.record({
      actorId: userId,
      action: 'LOGIN_SUCCESS',
      request,
      clinicId: user.clinicId,
    });
    return true;
  }

  async logout(userId: string, request: Request): Promise<void> {
    await this.auditLog.record({ actorId: userId, action: 'LOGOUT', request });
  }
}
