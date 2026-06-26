import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { ClinicsService } from './clinics.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import type { User } from '@prisma/client';

@Controller('internal/users')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.INTERNAL_ADMIN)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly clinicsService: ClinicsService,
  ) {}

  @Get()
  async list(@Res() res: Response): Promise<void> {
    const users = await this.usersService.listAll();
    res.render('internal/users-list', { users });
  }

  @Get('new')
  async showCreateForm(@Res() res: Response): Promise<void> {
    const clinics = await this.clinicsService.listAll();
    res.render('internal/user-new', { clinics, error: null });
  }

  @Post()
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: User,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { user, temporaryPassword } = await this.usersService.create(dto, actor.id, req);
    res.render('internal/user-created', { user, temporaryPassword });
  }

  @Get(':id')
  async detail(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const user = await this.usersService.findByIdOrThrow(id);
    res.render('internal/user-detail', { targetUser: user });
  }

  @Post(':id/permissions')
  async updatePermissions(
    @Param('id') id: string,
    @Body() dto: UpdatePermissionsDto,
    @CurrentUser() actor: User,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.usersService.setPermissions(id, dto, actor.id, req);
    res.redirect(`/internal/users/${id}`);
  }

  @Post(':id/block')
  async block(
    @Param('id') id: string,
    @CurrentUser() actor: User,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.usersService.block(id, actor.id, req);
    res.redirect(`/internal/users/${id}`);
  }

  @Post(':id/unblock')
  async unblock(
    @Param('id') id: string,
    @CurrentUser() actor: User,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.usersService.unblock(id, actor.id, req);
    res.redirect(`/internal/users/${id}`);
  }

  @Post(':id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @CurrentUser() actor: User,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const temporaryPassword = await this.usersService.resetPassword(id, actor.id, req);
    const user = await this.usersService.findByIdOrThrow(id);
    res.render('internal/user-created', { user, temporaryPassword });
  }
}
