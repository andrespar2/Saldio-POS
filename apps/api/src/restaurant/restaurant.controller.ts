import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantGuard, type AuthContext, type AuthenticatedRequest } from '../common/guards';
import { CurrentAuth, RequireModule, RequirePermissions } from '../common/decorators';
import { RestaurantService } from './restaurant.service';
import {
  CancelItemDto,
  CancelOrderDto,
  CreateAreaDto,
  CreateTableDto,
  OpenOrderDto,
  OrderItemDto,
  PayOrderDto,
  RestaurantQueryDto,
  SplitOrderDto,
  UpdateOrderItemDto,
} from './restaurant.dto';

@ApiTags('Restaurante')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@RequireModule('RESTAURANT')
@Controller('tenant/restaurant')
export class RestaurantController {
  constructor(private readonly restaurant: RestaurantService) {}

  @Get('areas')
  @RequirePermissions('restaurant.read')
  areas() {
    return this.restaurant.areas();
  }

  @Post('areas')
  @RequirePermissions('restaurant.manage')
  createArea(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateAreaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.restaurant.createArea(auth, dto, req.ip);
  }

  @Post('tables')
  @RequirePermissions('restaurant.manage')
  createTable(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateTableDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.restaurant.createTable(auth, dto, req.ip);
  }

  @Get('orders')
  @RequirePermissions('restaurant.read')
  orders(@Query() query: RestaurantQueryDto) {
    return this.restaurant.orders(query);
  }

  @Get('orders/:id')
  @RequirePermissions('restaurant.read')
  order(@Param('id') id: string) {
    return this.restaurant.order(id);
  }

  @Post('orders')
  @RequirePermissions('restaurant.manage')
  open(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: OpenOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.restaurant.open(auth, dto, req.ip);
  }

  @Post('orders/:id/items')
  @RequirePermissions('restaurant.manage')
  addItem(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: OrderItemDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.restaurant.addItem(auth, id, dto, req.ip);
  }

  @Post('orders/:id/send')
  @RequirePermissions('restaurant.manage')
  @HttpCode(200)
  send(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.restaurant.send(auth, id, req.ip);
  }

  @Patch('orders/:id/items/:itemId')
  @RequirePermissions('kitchen.manage')
  updateItem(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOrderItemDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.restaurant.updateItemStatus(auth, id, itemId, dto.status, req.ip);
  }

  @Post('orders/:id/split')
  @RequirePermissions('restaurant.manage')
  @HttpCode(200)
  split(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: SplitOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.restaurant.split(auth, id, dto, req.ip);
  }

  @Post('orders/:id/pay')
  @RequirePermissions('restaurant.manage')
  @HttpCode(200)
  pay(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: PayOrderDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.restaurant.pay(auth, id, dto, key, req.ip);
  }

  @Post('orders/:id/cancel')
  @RequirePermissions('restaurant.manage')
  @HttpCode(200)
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.restaurant.cancelOrder(auth, id, dto, req.ip);
  }

  @Post('orders/:id/items/:itemId/cancel')
  @RequirePermissions('restaurant.manage')
  @HttpCode(200)
  cancelItem(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: CancelItemDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.restaurant.cancelItem(auth, id, itemId, dto, req.ip);
  }

  @Get('kitchen')
  @RequirePermissions('kitchen.read')
  @RequireModule('KITCHEN')
  kitchen() {
    return this.restaurant.kitchen();
  }
}
