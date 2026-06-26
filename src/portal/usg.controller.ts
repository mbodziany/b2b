import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { Response, Request } from 'express';
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
import { PortalUsgService } from './portal-usg.service';

@Controller('portal/usg')
@UseGuards(SessionAuthGuard, RolesGuard, PermissionGuard, ClinicScopeGuard)
@Roles(UserRole.CLINIC_USER)
@RequirePermission('canViewUsg')
export class PortalUsgController {
  constructor(private readonly usgService: PortalUsgService) {}

  @Get()
  async list(@CurrentUser() user: User, @Res() res: Response): Promise<void> {
    const exams = await this.usgService.listForClinic(user.clinicId!);
    res.render('portal/usg-list', { exams });
  }

  @Get(':examId')
  @ClinicScoped('usgExam', 'examId')
  async detail(
    @Param('examId') examId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<void> {
    const { exam, images } = await this.usgService.getDetailForClinic(
      user.clinicId!,
      examId,
      user.id,
      req,
    );
    res.render('portal/usg-detail', { exam, images });
  }

  @Get(':examId/images/:imageId/download')
  @ClinicScoped('usgExam', 'examId')
  async download(
    @Param('examId') examId: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<void> {
    const { buffer, image } = await this.usgService.downloadImage(
      user.clinicId!,
      examId,
      imageId,
      user.id,
      req,
    );
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Content-Disposition', buildContentDisposition(image.fileName));
    res.send(buffer);
  }
}
