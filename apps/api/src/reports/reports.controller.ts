import {
  Controller,
  Get,
  Header,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { TenantGuard } from '../common/guards';
import { RequireModule, RequirePermissions } from '../common/decorators';
import { ReportsService } from './reports.service';

@ApiTags('Reportes')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@RequireModule('REPORTS')
@Controller('tenant/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @RequirePermissions('reports.read')
  dashboard() {
    return this.reports.dashboard();
  }

  @Get('sales')
  @RequirePermissions('reports.read')
  sales(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.sales(from, to);
  }

  @Get('products')
  @RequirePermissions('reports.read')
  products(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.products(from, to);
  }

  @Get('inventory')
  @RequirePermissions('inventory.read')
  inventory() {
    return this.reports.inventoryValuation();
  }

  @Get('sales.csv')
  @RequirePermissions('data.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async salesCsv(
    @Res({ passthrough: true }) res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const csv = await this.reports.salesCsv(from, to);
    res.setHeader('Content-Disposition', 'attachment; filename="ventas.csv"');
    return `\uFEFF${csv}`;
  }
}
