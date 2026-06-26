import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  listAll(): Promise<User[]> {
    return this.prisma.user.findMany({ include: { clinic: true }, orderBy: { createdAt: 'desc' } });
  }

  findByIdOrThrow(id: string): Promise<User> {
    return this.prisma.user.findUniqueOrThrow({ where: { id } });
  }

  async create(
    dto: CreateUserDto,
    actorId: string,
    request: Request,
  ): Promise<{ user: User; temporaryPassword: string }> {
    if (dto.role === UserRole.CLINIC_USER) {
      if (!dto.clinicId) {
        throw new BadRequestException('Użytkownik kliniki musi mieć przypisaną przychodnię.');
      }
      const clinic = await this.prisma.clinic.findUnique({ where: { id: dto.clinicId } });
      if (!clinic) {
        throw new BadRequestException('Wskazana przychodnia nie istnieje.');
      }
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) {
      throw new BadRequestException('Konto z tym adresem e-mail już istnieje.');
    }

    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    const isClinicUser = dto.role === UserRole.CLINIC_USER;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        role: dto.role,
        clinicId: isClinicUser ? dto.clinicId : null,
        canViewInvoices: isClinicUser ? dto.canViewInvoices : false,
        canViewUsg: isClinicUser ? dto.canViewUsg : false,
        passwordHash,
        mustChangePassword: true,
        createdById: actorId,
      },
    });

    await this.auditLog.record({
      actorId,
      action: 'USER_CREATED',
      request,
      entityType: 'user',
      entityId: user.id,
      clinicId: user.clinicId,
    });

    return { user, temporaryPassword };
  }

  async setPermissions(
    userId: string,
    dto: UpdatePermissionsDto,
    actorId: string,
    request: Request,
  ): Promise<void> {
    const user = await this.requireClinicUser(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { canViewInvoices: dto.canViewInvoices, canViewUsg: dto.canViewUsg },
    });
    await this.auditLog.record({
      actorId,
      action: 'USER_PERMISSIONS_CHANGED',
      request,
      entityType: 'user',
      entityId: userId,
      clinicId: user.clinicId,
      metadata: { canViewInvoices: dto.canViewInvoices, canViewUsg: dto.canViewUsg },
    });
  }

  async block(userId: string, actorId: string, request: Request): Promise<void> {
    const user = await this.findByIdOrThrow(userId);
    await this.prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    await this.auditLog.record({
      actorId,
      action: 'USER_BLOCKED',
      request,
      entityType: 'user',
      entityId: userId,
      clinicId: user.clinicId,
    });
  }

  async unblock(userId: string, actorId: string, request: Request): Promise<void> {
    const user = await this.findByIdOrThrow(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true, failedLoginAttempts: 0, lockedUntil: null },
    });
    await this.auditLog.record({
      actorId,
      action: 'USER_UNBLOCKED',
      request,
      entityType: 'user',
      entityId: userId,
      clinicId: user.clinicId,
    });
  }

  async resetPassword(userId: string, actorId: string, request: Request): Promise<string> {
    const user = await this.findByIdOrThrow(userId);
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null },
    });
    await this.auditLog.record({
      actorId,
      action: 'USER_PASSWORD_RESET',
      request,
      entityType: 'user',
      entityId: userId,
      clinicId: user.clinicId,
    });
    return temporaryPassword;
  }

  private async requireClinicUser(userId: string): Promise<User> {
    const user = await this.findByIdOrThrow(userId);
    if (user.role !== UserRole.CLINIC_USER) {
      throw new NotFoundException('Nie znaleziono użytkownika kliniki.');
    }
    return user;
  }

  private generateTemporaryPassword(): string {
    return `${randomBytes(9).toString('base64')}A1`;
  }
}
