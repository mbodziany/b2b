import { Module } from '@nestjs/common';
import { InternalHomeController } from './home.controller';
import { UsersController } from './users.controller';
import { ClinicsController } from './clinics.controller';
import { InvoicesController } from './invoices.controller';
import { UsgController } from './usg.controller';
import { AuditLogController } from './audit-log.controller';
import { UsersService } from './users.service';
import { ClinicsService } from './clinics.service';
import { InvoicesService } from './invoices.service';
import { UsgService } from './usg.service';

@Module({
  controllers: [
    InternalHomeController,
    UsersController,
    ClinicsController,
    InvoicesController,
    UsgController,
    AuditLogController,
  ],
  providers: [UsersService, ClinicsService, InvoicesService, UsgService],
})
export class InternalModule {}
