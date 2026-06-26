import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { UserRole, User } from '@prisma/client';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClinicsService } from './clinics.service';
import { CreateClinicDto } from './dto/create-clinic.dto';

@Controller('internal/clinics')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.INTERNAL_ADMIN)
export class ClinicsController {
  constructor(private readonly clinicsService: ClinicsService) {}

  @Get()
  async list(@Res() res: Response): Promise<void> {
    const clinics = await this.clinicsService.listAll();
    res.render('internal/clinics-list', { clinics });
  }

  @Get('new')
  showCreateForm(@Res() res: Response): void {
    res.render('internal/clinic-new', { error: null });
  }

  @Post()
  async create(
    @Body() dto: CreateClinicDto,
    @CurrentUser() actor: User,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const clinic = await this.clinicsService.create(dto, actor.id, req);
    res.redirect(`/internal/clinics#${clinic.id}`);
  }

  @Post(':id/block')
  async block(
    @Param('id') id: string,
    @CurrentUser() actor: User,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.clinicsService.block(id, actor.id, req);
    res.redirect('/internal/clinics');
  }

  @Post(':id/unblock')
  async unblock(
    @Param('id') id: string,
    @CurrentUser() actor: User,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.clinicsService.unblock(id, actor.id, req);
    res.redirect('/internal/clinics');
  }
}
