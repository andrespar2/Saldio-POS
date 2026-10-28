import { Module } from '@nestjs/common';
import { TenantController, FilesController } from './tenant.controller';
import { TenantAccessService } from './tenant-access.service';
import { TenantSettingsService } from './tenant-settings.service';

@Module({
  controllers: [TenantController, FilesController],
  providers: [TenantAccessService, TenantSettingsService],
  exports: [TenantAccessService, TenantSettingsService],
})
export class TenantModule {}
