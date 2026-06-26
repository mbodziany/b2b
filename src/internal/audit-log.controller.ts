import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { UserRole } from '@prisma/client';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

const PAGE_SIZE = 50;

@Controller('internal/audit-log')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.INTERNAL_ADMIN)
export class AuditLogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query('page') page: string | undefined, @Res() res: Response): Promise<void> {
    const pageNumber = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const [entries, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        include: { actor: { select: { email: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (pageNumber - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.auditLog.count(),
    ]);
    res.render('internal/audit-log', {
      entries,
      page: pageNumber,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  }
}
