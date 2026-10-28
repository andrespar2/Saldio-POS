import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantGuard, type AuthContext, type AuthenticatedRequest } from '../common/guards';
import { CurrentAuth, RequirePermissions } from '../common/decorators';
import { InventoryService } from './inventory.service';
import {
  AdjustmentDto,
  CreatePurchaseDto,
  MovementQueryDto,
  PurchaseQueryDto,
  ReceivePurchaseDto,
  StockQueryDto,
  TransferDto,
} from './inventory.dto';

@ApiTags('Inventario y compras')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('tenant')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('inventory/stock')
  @RequirePermissions('inventory.read')
  stock(@Query() query: StockQueryDto) {
    return this.inventory.stockList(query);
  }

  @Get('inventory/movements')
  @RequirePermissions('inventory.read')
  movements(@Query() query: MovementQueryDto) {
    return this.inventory.movements(query);
  }

  @Post('inventory/adjustments')
  @RequirePermissions('inventory.write')
  adjust(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: AdjustmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventory.adjust(auth, dto, req.ip);
  }

  @Post('inventory/transfers')
  @RequirePermissions('inventory.write')
  transfer(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: TransferDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventory.transfer(auth, dto, req.ip);
  }

  @Get('purchases')
  @RequirePermissions('purchases.read')
  purchases(@Query() query: PurchaseQueryDto) {
    return this.inventory.listPurchases(query);
  }

  @Get('purchases/:id')
  @RequirePermissions('purchases.read')
  purchase(@Param('id') id: string) {
    return this.inventory.purchase(id);
  }

  @Post('purchases')
  @RequirePermissions('purchases.write')
  createPurchase(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreatePurchaseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventory.createPurchase(auth, dto, req.ip);
  }

  @Post('purchases/:id/receive')
  @RequirePermissions('purchases.write')
  @HttpCode(200)
  receive(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventory.receivePurchase(auth, id, dto, req.ip);
  }
}
