import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request, Response } from 'express';
import { UserRole, User } from '@prisma/client';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/services/storage.service';
import { InvoicesService } from './invoices.service';
import { ClinicsService } from './clinics.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CreateInvoiceItemDto } from './dto/create-invoice-item.dto';

@Controller('internal/invoices')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.INTERNAL_ADMIN, UserRole.INTERNAL_STAFF)
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly clinicsService: ClinicsService,
  ) {}

  @Get()
  async list(@Res() res: Response): Promise<void> {
    const invoices = await this.invoicesService.listAll();
    res.render('internal/invoices-list', { invoices });
  }

  @Get('new')
  async showCreateForm(@Res() res: Response): Promise<void> {
    const clinics = await this.clinicsService.listAll();
    res.render('internal/invoice-new', { clinics, error: null });
  }

  @Post()
  async create(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() actor: User,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const invoice = await this.invoicesService.create(dto, actor.id, req);
    res.redirect(`/internal/invoices/${invoice.id}`);
  }

  @Get(':id')
  async detail(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { invoice, serviceItems } = await this.invoicesService.findByIdWithRelationsOrThrow(id);
    res.render('internal/invoice-detail', { invoice, serviceItems, error: null });
  }

  @Post(':id/items')
  async addItem(
    @Param('id') id: string,
    @Body() dto: CreateInvoiceItemDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.invoicesService.addItem(id, dto);
    res.redirect(`/internal/invoices/${id}`);
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }),
  )
  async addAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: User,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!file) {
      throw new BadRequestException('Nie wybrano pliku.');
    }
    await this.invoicesService.addAttachment(id, file, actor.id, actor.id, req);
    res.redirect(`/internal/invoices/${id}`);
  }
}
