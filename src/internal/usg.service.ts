import { BadRequestException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { UsgExam, UsgImage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { CryptoService } from '../common/services/crypto.service';
import { StorageService, ALLOWED_UPLOAD_MIME_TYPES } from '../common/services/storage.service';
import { CreateUsgExamDto } from './dto/create-usg-exam.dto';

export type UsgExamView = Omit<UsgExam, 'patientReferenceEncrypted'> & { patientReference: string };

@Injectable()
export class UsgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly crypto: CryptoService,
    private readonly storage: StorageService,
  ) {}

  async listAll(): Promise<(UsgExam & { clinic: { name: string } })[]> {
    return this.prisma.usgExam.findMany({
      include: { clinic: { select: { name: true } } },
      orderBy: { examDate: 'desc' },
    });
  }

  async findByIdWithRelationsOrThrow(
    id: string,
  ): Promise<{ exam: UsgExamView; clinicName: string; images: UsgImage[] }> {
    const exam = await this.prisma.usgExam.findUniqueOrThrow({
      where: { id },
      include: { clinic: true, images: true },
    });
    const { patientReferenceEncrypted, clinic, images, ...rest } = exam;
    return {
      exam: { ...rest, patientReference: this.crypto.decrypt(patientReferenceEncrypted) },
      clinicName: clinic.name,
      images,
    };
  }

  async create(dto: CreateUsgExamDto, actorId: string, request: Request): Promise<UsgExam> {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: dto.clinicId } });
    if (!clinic || !clinic.isActive) {
      throw new BadRequestException('Wskazana przychodnia nie istnieje lub jest zablokowana.');
    }
    const exam = await this.prisma.usgExam.create({
      data: {
        clinicId: dto.clinicId,
        patientReferenceEncrypted: this.crypto.encrypt(dto.patientReference),
        examDate: new Date(dto.examDate),
        examType: dto.examType,
        performedBy: dto.performedBy,
        description: dto.description,
        createdById: actorId,
      },
    });
    await this.auditLog.record({
      actorId,
      action: 'USG_EXAM_CREATED',
      request,
      entityType: 'usgExam',
      entityId: exam.id,
      clinicId: exam.clinicId,
    });
    return exam;
  }

  async addImage(
    usgExamId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer },
    uploadedById: string,
    actorId: string,
    request: Request,
  ): Promise<UsgImage> {
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype as never)) {
      throw new BadRequestException('Niedozwolony typ pliku.');
    }
    const exam = await this.prisma.usgExam.findUniqueOrThrow({ where: { id: usgExamId } });
    const stored = await this.storage.save(file.buffer, 'usg');
    const image = await this.prisma.usgImage.create({
      data: {
        usgExamId,
        fileName: file.originalname,
        storageKey: stored.storageKey,
        mimeType: file.mimetype,
        fileSizeBytes: stored.fileSizeBytes,
        checksumSha256: stored.checksumSha256,
        uploadedById,
      },
    });
    await this.auditLog.record({
      actorId,
      action: 'USG_IMAGE_UPLOADED',
      request,
      entityType: 'usgImage',
      entityId: image.id,
      clinicId: exam.clinicId,
    });
    return image;
  }
}
