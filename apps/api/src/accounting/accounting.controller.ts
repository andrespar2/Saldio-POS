import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantGuard, type AuthContext, type AuthenticatedRequest } from '../common/guards';
import { CurrentAuth, RequireModule, RequirePermissions } from '../common/decorators';
import { AccountingService } from './accounting.service';
import {
  AccountDto,
  AccountingConfigDto,
  AccountingQueryDto,
  CreateEntryDto,
  PeriodDto,
} from './accounting.dto';

@ApiTags('Contabilidad')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@RequireModule('ACCOUNTING')
@Controller('tenant/accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Get('config')
  @RequirePermissions('accounting.read')
  config() {
    return this.accounting.config();
  }

  @Put('config')
  @RequirePermissions('accounting.write')
  setConfig(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: AccountingConfigDto,
  ) {
    return this.accounting.setConfig(auth, dto.enabled);
  }

  @Get('accounts')
  @RequirePermissions('accounting.read')
  accounts() {
    return this.accounting.accounts();
  }

  @Post('accounts')
  @RequirePermissions('accounting.write')
  createAccount(@CurrentAuth() auth: AuthContext, @Body() dto: AccountDto) {
    return this.accounting.createAccount(auth, dto);
  }

  @Get('periods')
  @RequirePermissions('accounting.read')
  periods() {
    return this.accounting.periods();
  }

  @Post('periods')
  @RequirePermissions('accounting.write')
  createPeriod(@CurrentAuth() auth: AuthContext, @Body() dto: PeriodDto) {
    return this.accounting.createPeriod(auth, dto);
  }

  @Post('periods/:id/close')
  @RequirePermissions('accounting.write')
  closePeriod(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.accounting.closePeriod(auth, id);
  }

  @Get('entries')
  @RequirePermissions('accounting.read')
  entries(@Query() query: AccountingQueryDto) {
    return this.accounting.entries(query);
  }

  @Post('entries')
  @RequirePermissions('accounting.write')
  createEntry(@CurrentAuth() auth: AuthContext, @Body() dto: CreateEntryDto) {
    return this.accounting.createEntry(auth, dto);
  }

  @Post('entries/:id/reverse')
  @RequirePermissions('accounting.write')
  reverse(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.accounting.reverseEntry(auth, id, reason || 'Reversión manual');
  }

  @Get('trial-balance')
  @RequirePermissions('accounting.read')
  trial(@Query('from') from?: string, @Query('to') to?: string) {
    return this.accounting.trialBalance(from, to);
  }

  @Get('ledger/:id')
  @RequirePermissions('accounting.read')
  ledger(@Param('id') id: string) {
    return this.accounting.ledger(id);
  }
}
