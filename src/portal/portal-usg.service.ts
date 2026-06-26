import { Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { UsgExam, UsgImage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { CryptoService } from '../common/services/crypto.service';
import { StorageService } from '../common/services/storage.service';

@Injectable()
export class PortalUsgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly crypto: CryptoService,
    private readonly storage: StorageService,
  ) {}

  listForClinic(clinicId: string): Promise<UsgExam[]> {
    return this.prisma.usgExam.findMany({ where: { clinicId }, orderBy: { examDate: 'desc' } });
  }

  async getDetailForClinic(clinicId: string, examId: string, actorId: string, request: Request) {
    const exam = await this.prisma.usgExam.findFirst({
      where: { id: examId, clinicId },
      include: { images: true },
    });
    if (!exam) {
      throw new NotFoundException('Nie znaleziono badania.');
    }
    const { patientReferenceEncrypted, images, ...rest } = exam;

    await this.auditLog.record({
      actorId,
      action: 'USG_EXAM_VIEWED',
      request,
      entityType: 'usgExam',
      entityId: examId,
      clinicId,
    });

    return {
      exam: { ...rest, patientReference: this.crypto.decrypt(patientReferenceEncrypted) },
      images,
    };
  }

  async downloadImage(
    clinicId: string,
    examId: string,
    imageId: string,
    actorId: string,
    request: Request,
  ): Promise<{ buffer: Buffer; image: UsgImage }> {
    const exam = await this.prisma.usgExam.findFirst({ where: { id: examId, clinicId } });
    if (!exam) {
      throw new NotFoundException('Nie znaleziono badania.');
    }
    const image = await this.prisma.usgImage.findFirst({ where: { id: imageId, usgExamId: examId } });
    if (!image) {
      throw new NotFoundException('Nie znaleziono obrazu.');
    }
    const buffer = await this.storage.read(image.storageKey);

    await this.auditLog.record({
      actorId,
      action: 'USG_IMAGE_DOWNLOADED',
      request,
      entityType: 'usgImage',
      entityId: imageId,
      clinicId,
    });

    return { buffer, image };
  }
}
