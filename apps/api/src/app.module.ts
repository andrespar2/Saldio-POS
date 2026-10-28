import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import path from 'node:path';
import { validateEnv } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards';
import { TenantContextInterceptor } from './common/tenant-context.interceptor';
import { ApiExceptionFilter } from './common/exception.filter';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { PlatformModule } from './platform/platform.module';
import { PublicModule } from './public/public.module';
import { TenantModule } from './tenant/tenant.module';
import { CatalogModule } from './catalog/catalog.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { ReportsModule } from './reports/reports.module';
import { AccountingModule } from './accounting/accounting.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '../../.env'),
      ],
      validate: validateEnv,
      cache: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: process.env.NODE_ENV === 'test' ? 100_000 : 180,
      },
    ]),
    PrismaModule,
    CommonModule,
    AuthModule,
    PlatformModule,
    PublicModule,
    TenantModule,
    CatalogModule,
    InventoryModule,
    SalesModule,
    RestaurantModule,
    ReportsModule,
    AccountingModule,
    IntegrationsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
