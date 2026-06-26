import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { UserRole, User } from '@prisma/client';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('portal')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.CLINIC_USER)
export class PortalHomeController {
  @Get()
  dashboard(@CurrentUser() user: User, @Res() res: Response): void {
    res.render('portal/dashboard', { user });
  }
}
