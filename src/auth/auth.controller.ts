import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { MfaTokenDto } from './dto/mfa-token.dto';

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('login')
  showLogin(@Res() res: Response): void {
    res.render('auth/login', { error: null });
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res() res: Response): Promise<void> {
    const outcome = await this.authService.login(dto.email, dto.password, req);

    switch (outcome.status) {
      case 'invalid-credentials':
        res.render('auth/login', { error: 'Nieprawidłowy e-mail lub hasło.' });
        return;
      case 'locked':
        res.render('auth/login', {
          error: `Konto zostało tymczasowo zablokowane po serii nieudanych logowań. Spróbuj po ${outcome.lockedUntil.toLocaleTimeString('pl-PL')}.`,
        });
        return;
      case 'must-change-password':
        req.session.pendingPasswordChangeUserId = outcome.userId;
        res.redirect('/change-password');
        return;
      case 'must-enroll-mfa':
        this.startMfaEnrollment(outcome.userId, req);
        res.redirect('/mfa/enroll');
        return;
      case 'must-verify-mfa':
        req.session.pendingMfaUserId = outcome.userId;
        res.redirect('/mfa/verify');
        return;
    }
  }

  @Get('change-password')
  showChangePassword(@Req() req: Request, @Res() res: Response): void {
    if (!req.session.pendingPasswordChangeUserId) {
      res.redirect('/login');
      return;
    }
    res.render('auth/change-password', { error: null });
  }

  @Post('change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.session.pendingPasswordChangeUserId;
    if (!userId) {
      res.redirect('/login');
      return;
    }
    if (dto.newPassword !== dto.confirmPassword) {
      res.render('auth/change-password', { error: 'Podane hasła nie są identyczne.' });
      return;
    }

    await this.authService.changePassword(userId, dto.newPassword, req);
    req.session.pendingPasswordChangeUserId = undefined;

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaEnabled) {
      this.startMfaEnrollment(userId, req);
      res.redirect('/mfa/enroll');
    } else {
      req.session.pendingMfaUserId = userId;
      res.redirect('/mfa/verify');
    }
  }

  @Get('mfa/enroll')
  async showMfaEnroll(@Req() req: Request, @Res() res: Response): Promise<void> {
    const secret = req.session.pendingMfaEnrollmentSecret;
    const userId = req.session.pendingMfaUserId;
    if (!userId || !secret) {
      res.redirect('/login');
      return;
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const qrCodeDataUrl = await this.authService.buildMfaQrCodeDataUrl(user.email, secret);
    res.render('auth/mfa-enroll', { qrCodeDataUrl, secret, error: null });
  }

  @Post('mfa/enroll')
  async confirmMfaEnroll(
    @Body() dto: MfaTokenDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const userId = req.session.pendingMfaUserId;
    const secret = req.session.pendingMfaEnrollmentSecret;
    if (!userId || !secret) {
      res.redirect('/login');
      return;
    }

    const confirmed = await this.authService.confirmMfaEnrollment(userId, secret, dto.token, req);
    if (!confirmed) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const qrCodeDataUrl = await this.authService.buildMfaQrCodeDataUrl(user.email, secret);
      res.render('auth/mfa-enroll', {
        qrCodeDataUrl,
        secret,
        error: 'Nieprawidłowy kod. Sprawdź godzinę w telefonie i spróbuj ponownie.',
      });
      return;
    }

    req.session.pendingMfaEnrollmentSecret = undefined;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.establishSession(req, res, user.id, user.role, user.clinicId);
  }

  @Get('mfa/verify')
  showMfaVerify(@Req() req: Request, @Res() res: Response): void {
    if (!req.session.pendingMfaUserId) {
      res.redirect('/login');
      return;
    }
    res.render('auth/mfa-verify', { error: null });
  }

  @Post('mfa/verify')
  async verifyMfa(@Body() dto: MfaTokenDto, @Req() req: Request, @Res() res: Response): Promise<void> {
    const userId = req.session.pendingMfaUserId;
    if (!userId) {
      res.redirect('/login');
      return;
    }

    const valid = await this.authService.verifyMfa(userId, dto.token, req);
    if (!valid) {
      res.render('auth/mfa-verify', { error: 'Nieprawidłowy kod uwierzytelniający.' });
      return;
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.establishSession(req, res, user.id, user.role, user.clinicId);
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    const userId = req.session.userId;
    if (userId) {
      await this.authService.logout(userId, req);
    }
    req.session.destroy(() => res.redirect('/login'));
  }

  private startMfaEnrollment(userId: string, req: Request): void {
    req.session.pendingMfaUserId = userId;
    req.session.pendingMfaEnrollmentSecret = this.authService.generateMfaSecret();
  }

  /** Regenerates the session id on privilege escalation to prevent session fixation. */
  private establishSession(
    req: Request,
    res: Response,
    userId: string,
    role: UserRole,
    clinicId: string | null,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) {
          reject(err);
          return;
        }
        req.session.userId = userId;
        req.session.role = role;
        req.session.clinicId = clinicId;
        req.session.loginAt = Date.now();
        req.session.pendingMfaUserId = undefined;
        req.session.pendingPasswordChangeUserId = undefined;
        req.session.pendingMfaEnrollmentSecret = undefined;
        req.session.save(() => {
          res.redirect(role === UserRole.CLINIC_USER ? '/portal' : '/internal');
          resolve();
        });
      });
    });
  }
}
