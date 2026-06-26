import { Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { Invoice, InvoiceAttachment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { CryptoService } from '../common/services/crypto.service';
import { StorageService } from '../common/services/storage.service';

@Injectable()
export class PortalInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly crypto: CryptoService,
    private readonly storage: StorageService,
  ) {}

  listForClinic(clinicId: string): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({ where: { clinicId }, orderBy: { issueDate: 'desc' } });
  }

  /** clinicId filter here is the second, independent enforcement layer (see ClinicScopeGuard). */
  async getDetailForClinic(
    clinicId: string,
    invoiceId: string,
    actorId: string,
    request: Request,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clinicId },
      include: { attachments: true },
    });
    if (!invoice) {
      throw new NotFoundException('Nie znaleziono faktury.');
    }
    const items = await this.prisma.invoiceServiceItem.findMany({
      where: { invoiceId },
      orderBy: { serviceDate: 'asc' },
    });
    const serviceItems = items.map(({ patientReferenceEncrypted, ...rest }) => ({
      ...rest,
      patientReference: this.crypto.decrypt(patientReferenceEncrypted),
    }));

    await this.auditLog.record({
      actorId,
      action: 'INVOICE_VIEWED',
      request,
      entityType: 'invoice',
      entityId: invoiceId,
      clinicId,
    });

    return { invoice, serviceItems };
  }

  async downloadAttachment(
    clinicId: string,
    invoiceId: string,
    attachmentId: string,
    actorId: string,
    request: Request,
  ): Promise<{ buffer: Buffer; attachment: InvoiceAttachment }> {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, clinicId } });
    if (!invoice) {
      throw new NotFoundException('Nie znaleziono faktury.');
    }
    const attachment = await this.prisma.invoiceAttachment.findFirst({
      where: { id: attachmentId, invoiceId },
    });
    if (!attachment) {
      throw new NotFoundException('Nie znaleziono załącznika.');
    }
    const buffer = await this.storage.read(attachment.storageKey);

    await this.auditLog.record({
      actorId,
      action: 'INVOICE_ATTACHMENT_DOWNLOADED',
      request,
      entityType: 'invoiceAttachment',
      entityId: attachmentId,
      clinicId,
    });

    return { buffer, attachment };
  }
}
