import { Module } from '@nestjs/common';
import {
  IntegrationsController,
  WebhooksController,
} from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  controllers: [IntegrationsController, WebhooksController],
  providers: [IntegrationsService],
})
export class IntegrationsModule {}
