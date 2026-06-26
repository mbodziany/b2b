import { BadRequestException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { Clinic } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { CreateClinicDto } from './dto/create-clinic.dto';

@Injectable()
export class ClinicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  listAll(): Promise<Clinic[]> {
    return this.prisma.clinic.findMany({ orderBy: { name: 'asc' } });
  }

  findByIdOrThrow(id: string): Promise<Clinic> {
    return this.prisma.clinic.findUniqueOrThrow({ where: { id } });
  }

  async create(dto: CreateClinicDto, actorId: string, request: Request): Promise<Clinic> {
    const existing = await this.prisma.clinic.findUnique({ where: { taxId: dto.taxId } });
    if (existing) {
      throw new BadRequestException('Przychodnia z tym numerem NIP już istnieje.');
    }
    const clinic = await this.prisma.clinic.create({ data: dto });
    await this.auditLog.record({
      actorId,
      action: 'CLINIC_CREATED',
      request,
      entityType: 'clinic',
      entityId: clinic.id,
      clinicId: clinic.id,
    });
    return clinic;
  }

  async block(id: string, actorId: string, request: Request): Promise<void> {
    await this.prisma.clinic.update({ where: { id }, data: { isActive: false } });
    await this.auditLog.record({
      actorId,
      action: 'CLINIC_BLOCKED',
      request,
      entityType: 'clinic',
      entityId: id,
      clinicId: id,
    });
  }

  async unblock(id: string, actorId: string, request: Request): Promise<void> {
    await this.prisma.clinic.update({ where: { id }, data: { isActive: true } });
    await this.auditLog.record({
      actorId,
      action: 'CLINIC_UNBLOCKED',
      request,
      entityType: 'clinic',
      entityId: id,
      clinicId: id,
    });
  }
}
