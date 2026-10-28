import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantGuard, type AuthContext, type AuthenticatedRequest } from '../common/guards';
import { CurrentAuth, Public, RequireModule, RequirePermissions } from '../common/decorators';
import { IntegrationsService } from './integrations.service';
import {
  FiscalConfigDto,
  FiscalSubmitDto,
  PaymentAccountDto,
} from './integrations.dto';

@ApiTags('Integraciones')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('tenant/integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @RequirePermissions('settings.manage')
  status(@CurrentAuth() auth: AuthContext) {
    return this.integrations.status(auth);
  }

  @Put('fiscal')
  @RequirePermissions('settings.manage')
  @RequireModule('FISCAL')
  fiscal(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: FiscalConfigDto,
  ) {
    return this.integrations.setFiscalConfig(auth, dto);
  }

  @Post('payment-accounts')
  @RequirePermissions('settings.manage')
  @RequireModule('PAYMENTS')
  account(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PaymentAccountDto,
  ) {
    return this.integrations.addPaymentAccount(auth, dto);
  }

  @Get('fiscal-documents')
  @RequirePermissions('sales.read')
  @RequireModule('FISCAL')
  documents() {
    return this.integrations.fiscalDocuments();
  }

  @Post('sales/:id/fiscal')
  @RequirePermissions('settings.manage')
  @RequireModule('FISCAL')
  @HttpCode(200)
  submit(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() _dto: FiscalSubmitDto,
  ) {
    return this.integrations.submitFiscal(auth, id);
  }
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Public()
  @Post('payments/:provider')
  @HttpCode(200)
  payment(
    @Param('provider') provider: string,
    @Req() req: AuthenticatedRequest,
    @Headers('x-saldio-signature') _signature?: string,
  ) {
    return this.integrations.handlePaymentWebhook(provider, req);
  }
}
