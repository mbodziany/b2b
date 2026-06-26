import { Module } from '@nestjs/common';
import { PortalHomeController } from './home.controller';
import { PortalInvoicesController } from './invoices.controller';
import { PortalUsgController } from './usg.controller';
import { PortalInvoicesService } from './portal-invoices.service';
import { PortalUsgService } from './portal-usg.service';

@Module({
  controllers: [PortalHomeController, PortalInvoicesController, PortalUsgController],
  providers: [PortalInvoicesService, PortalUsgService],
})
export class PortalModule {}
