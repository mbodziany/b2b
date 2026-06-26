import { Global, Module } from '@nestjs/common';
import { CryptoService } from './services/crypto.service';
import { AuditLogService } from './services/audit-log.service';
import { StorageService } from './services/storage.service';

@Global()
@Module({
  providers: [CryptoService, AuditLogService, StorageService],
  exports: [CryptoService, AuditLogService, StorageService],
})
export class CommonModule {}
