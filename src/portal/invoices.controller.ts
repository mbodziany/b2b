import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { UserRole, User } from '@prisma/client';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ClinicScopeGuard } from '../common/guards/clinic-scope.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { ClinicScoped } from '../common/decorators/clinic-scoped.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { buildContentDisposition } from '../common/services/storage.service';
import { PortalInvoicesService } from './portal-invoices.service';
import type { Request } from 'express';

@Controller('portal/invoices')
@UseGuards(SessionAuthGuard, RolesGuard, PermissionGuard, ClinicScopeGuard)
@Roles(UserRole.CLINIC_USER)
@RequirePermission('canViewInvoices')
export class PortalInvoicesController {
  constructor(private readonly invoicesService: PortalInvoicesService) {}

  @Get()
  async list(@CurrentUser() user: User, @Res() res: Response): Promise<void> {
    const invoices = await this.invoicesService.listForClinic(user.clinicId!);
    res.render('portal/invoices-list', { invoices });
  }

  @Get(':invoiceId')
  @ClinicScoped('invoice', 'invoiceId')
  async detail(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<void> {
    const { invoice, serviceItems } = await this.invoicesService.getDetailForClinic(
      user.clinicId!,
      invoiceId,
      user.id,
      req,
    );
    res.render('portal/invoice-detail', { invoice, serviceItems });
  }

  @Get(':invoiceId/attachments/:attachmentId/download')
  @ClinicScoped('invoice', 'invoiceId')
  async download(
    @Param('invoiceId') invoiceId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<void> {
    const { buffer, attachment } = await this.invoicesService.downloadAttachment(
      user.clinicId!,
      invoiceId,
      attachmentId,
      user.id,
      req,
    );
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', buildContentDisposition(attachment.fileName));
    res.send(buffer);
  }
}
