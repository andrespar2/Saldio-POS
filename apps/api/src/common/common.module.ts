import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard, PlatformGuard, TenantGuard } from './guards';
import { AuditService } from './audit.service';
import { MailService } from './mail.service';
import { StorageService } from './storage.service';
import { SequenceService } from './sequence.service';
import { SettingsService } from './settings.service';
import { JobsService } from './jobs.service';
import { StoreProvisioningService } from '../stores/provisioning.service';
import type { Env } from '../config/env';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('ACCESS_TOKEN_TTL', { infer: true }),
        },
      }),
    }),
  ],
  providers: [
    JwtAuthGuard,
    TenantGuard,
    PlatformGuard,
    AuditService,
    MailService,
    StorageService,
    SequenceService,
    SettingsService,
    JobsService,
    StoreProvisioningService,
  ],
  exports: [
    JwtModule,
    JwtAuthGuard,
    TenantGuard,
    PlatformGuard,
    AuditService,
    MailService,
    StorageService,
    SequenceService,
    SettingsService,
    JobsService,
    StoreProvisioningService,
  ],
})
export class CommonModule {}
