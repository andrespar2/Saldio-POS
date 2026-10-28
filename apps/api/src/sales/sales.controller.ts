import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantGuard, type AuthContext, type AuthenticatedRequest } from '../common/guards';
import { CurrentAuth, RequireModule, RequirePermissions } from '../common/decorators';
import { SalesService } from './sales.service';
import { CashService } from './cash.service';
import { FinanceService } from './finance.service';
import {
  CashCloseDto,
  CashMovementDto,
  CashOpenDto,
  CreateExpenseDto,
  CreateQuoteDto,
  CreateReturnDto,
  CreateSaleDto,
  PayReceivableDto,
  QuoteQueryDto,
  ReceivableQueryDto,
  SalesQueryDto,
} from './sales.dto';

@ApiTags('Ventas')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('tenant')
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly cash: CashService,
    private readonly finance: FinanceService,
  ) {}

  @Get('sales')
  @RequirePermissions('sales.read')
  list(@CurrentAuth() auth: AuthContext, @Query() query: SalesQueryDto) {
    return this.sales.list(auth, query);
  }

  @Get('sales/:id')
  @RequirePermissions('sales.read')
  get(@Param('id') id: string) {
    return this.sales.get(id);
  }

  @Get('sales/:id/receipt')
  @RequirePermissions('sales.read')
  receipt(@Param('id') id: string) {
    return this.sales.receipt(id);
  }

  @Get('sales/:id/pdf')
  @RequirePermissions('sales.read')
  async pdf(
    @Param('id') id: string,
    @Query('width') width: string = '80',
  ) {
    const safeWidth = (['58', '80', 'a4'].includes(width) ? width : '80') as
      | '58'
      | '80'
      | 'a4';
    const buffer = await this.sales.pdf(id, safeWidth);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="comprobante-${id}.pdf"`,
      length: buffer.length,
    });
  }

  @Post('sales/:id/print')
  @RequirePermissions('sales.read')
  @HttpCode(200)
  print(@Param('id') id: string) {
    return this.sales.markPrinted(id);
  }

  @Post('sales')
  @RequirePermissions('sales.sell')
  @RequireModule('POS')
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateSaleDto,
    @Headers('idempotency-key') headerKey: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.sales.create(auth, dto, {
      idempotencyKey: headerKey || dto.idempotencyKey,
    });
  }

  @Post('sales/:id/returns')
  @RequirePermissions('sales.refund')
  @RequireModule('RETURNS')
  createReturn(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateReturnDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.sales.createReturn(auth, id, dto, req.ip);
  }

  @Get('cash/sessions')
  @RequirePermissions('sales.read')
  sessions(
    @CurrentAuth() auth: AuthContext,
    @Query('registerId') registerId?: string,
    @Query('status') status?: 'OPEN' | 'CLOSED',
  ) {
    return this.cash.sessions({ registerId, status }, auth);
  }

  @Get('cash/current')
  @RequirePermissions('sales.read')
  current(@CurrentAuth() auth: AuthContext, @Query('registerId') registerId?: string) {
    return this.cash.current(registerId, auth);
  }

  @Get('cash/sessions/:id')
  @RequirePermissions('sales.read')
  session(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.cash.session(id, auth);
  }

  @Post('cash/open')
  @RequirePermissions('cash.open')
  @RequireModule('CASH')
  open(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CashOpenDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.cash.open(auth, dto, req.ip);
  }

  @Post('cash/:id/close')
  @RequirePermissions('cash.close')
  @RequireModule('CASH')
  @HttpCode(200)
  close(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CashCloseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.cash.close(auth, id, dto, req.ip);
  }

  @Post('cash/:id/movements')
  @RequirePermissions('cash.manage')
  movement(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CashMovementDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.cash.movement(auth, id, dto, req.ip);
  }

  @Get('receivables')
  @RequirePermissions('credit.manage')
  @RequireModule('CREDITS')
  receivables(@Query() query: ReceivableQueryDto) {
    return this.finance.receivables(query);
  }

  @Post('receivables/:id/payments')
  @RequirePermissions('credit.manage')
  @RequireModule('CREDITS')
  pay(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: PayReceivableDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.finance.payReceivable(auth, id, dto, key, req.ip);
  }

  @Get('quotes')
  @RequirePermissions('quotes.manage')
  @RequireModule('QUOTES')
  quotes(@Query() query: QuoteQueryDto) {
    return this.finance.quotes(query);
  }

  @Get('quotes/:id')
  @RequirePermissions('quotes.manage')
  @RequireModule('QUOTES')
  quote(@Param('id') id: string) {
    return this.finance.quote(id);
  }

  @Post('quotes')
  @RequirePermissions('quotes.manage')
  @RequireModule('QUOTES')
  createQuote(@CurrentAuth() auth: AuthContext, @Body() dto: CreateQuoteDto) {
    return this.finance.createQuote(auth, dto);
  }

  @Post('quotes/:id/convert')
  @RequirePermissions('quotes.manage')
  @RequireModule('QUOTES')
  @HttpCode(200)
  convertQuote(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.finance.convertQuote(auth, id, req.ip);
  }

  @Get('expenses')
  @RequirePermissions('expenses.manage')
  @RequireModule('EXPENSES')
  expenses(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.finance.expenses({
      from,
      to,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post('expenses')
  @RequirePermissions('expenses.manage')
  @RequireModule('EXPENSES')
  createExpense(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateExpenseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.finance.createExpense(auth, dto, req.ip);
  }
}
