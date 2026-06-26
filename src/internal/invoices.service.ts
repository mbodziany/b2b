import { BadRequestException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { Invoice, InvoiceAttachment, InvoiceServiceItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { CryptoService } from '../common/services/crypto.service';
import { StorageService, ALLOWED_UPLOAD_MIME_TYPES } from '../common/services/storage.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateInvoiceItemDto } from './dto/create-invoice-item.dto';

export type InvoiceServiceItemView = Omit<InvoiceServiceItem, 'patientReferenceEncrypted'> & {
  patientReference: string;
};

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly crypto: CryptoService,
    private readonly storage: StorageService,
  ) {}

  listAll(): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      include: { clinic: true },
      orderBy: { issueDate: 'desc' },
    });
  }

  async findByIdWithRelationsOrThrow(id: string): Promise<{
    invoice: Invoice & { attachments: InvoiceAttachment[] };
    serviceItems: InvoiceServiceItemView[];
  }> {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: { clinic: true, attachments: true },
    });
    const items = await this.prisma.invoiceServiceItem.findMany({
      where: { invoiceId: id },
      orderBy: { serviceDate: 'asc' },
    });
    const serviceItems = items.map(({ patientReferenceEncrypted, ...rest }) => ({
      ...rest,
      patientReference: this.crypto.decrypt(patientReferenceEncrypted),
    }));
    return { invoice, serviceItems };
  }

  async create(dto: CreateInvoiceDto, actorId: string, request: Request): Promise<Invoice> {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: dto.clinicId } });
    if (!clinic || !clinic.isActive) {
      throw new BadRequestException('Wskazana przychodnia nie istnieje lub jest zablokowana.');
    }
    const invoice = await this.prisma.invoice.create({
      data: {
        clinicId: dto.clinicId,
        invoiceNumber: dto.invoiceNumber,
        issueDate: new Date(dto.issueDate),
        totalAmount: dto.totalAmount,
        currency: dto.currency ?? 'PLN',
        createdById: actorId,
      },
    });
    await this.auditLog.record({
      actorId,
      action: 'INVOICE_CREATED',
      request,
      entityType: 'invoice',
      entityId: invoice.id,
      clinicId: invoice.clinicId,
    });
    return invoice;
  }

  async addItem(invoiceId: string, dto: CreateInvoiceItemDto): Promise<InvoiceServiceItem> {
    await this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    return this.prisma.invoiceServiceItem.create({
      data: {
        invoiceId,
        patientReferenceEncrypted: this.crypto.encrypt(dto.patientReference),
        serviceCode: dto.serviceCode,
        serviceName: dto.serviceName,
        serviceDate: new Date(dto.serviceDate),
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        amount: dto.amount,
        notes: dto.notes,
      },
    });
  }

  async addAttachment(
    invoiceId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer },
    uploadedById: string,
    actorId: string,
    request: Request,
  ): Promise<InvoiceAttachment> {
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(file.mimetype as never)) {
      throw new BadRequestException('Niedozwolony typ pliku.');
    }
    const invoice = await this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const stored = await this.storage.save(file.buffer, 'invoices');
    const attachment = await this.prisma.invoiceAttachment.create({
      data: {
        invoiceId,
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
      action: 'INVOICE_ATTACHMENT_UPLOADED',
      request,
      entityType: 'invoiceAttachment',
      entityId: attachment.id,
      clinicId: invoice.clinicId,
    });
    return attachment;
  }
}
