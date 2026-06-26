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
import { UsgService } from './usg.service';
import { ClinicsService } from './clinics.service';
import { CreateUsgExamDto } from './dto/create-usg-exam.dto';

@Controller('internal/usg')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.INTERNAL_ADMIN, UserRole.INTERNAL_STAFF)
export class UsgController {
  constructor(
    private readonly usgService: UsgService,
    private readonly clinicsService: ClinicsService,
  ) {}

  @Get()
  async list(@Res() res: Response): Promise<void> {
    const exams = await this.usgService.listAll();
    res.render('internal/usg-list', { exams });
  }

  @Get('new')
  async showCreateForm(@Res() res: Response): Promise<void> {
    const clinics = await this.clinicsService.listAll();
    res.render('internal/usg-new', { clinics, error: null });
  }

  @Post()
  async create(
    @Body() dto: CreateUsgExamDto,
    @CurrentUser() actor: User,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const exam = await this.usgService.create(dto, actor.id, req);
    res.redirect(`/internal/usg/${exam.id}`);
  }

  @Get(':id')
  async detail(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { exam, clinicName, images } = await this.usgService.findByIdWithRelationsOrThrow(id);
    res.render('internal/usg-detail', { exam, clinicName, images });
  }

  @Post(':id/images')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }),
  )
  async addImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: User,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!file) {
      throw new BadRequestException('Nie wybrano pliku.');
    }
    await this.usgService.addImage(id, file, actor.id, actor.id, req);
    res.redirect(`/internal/usg/${id}`);
  }
}
