import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantGuard, type AuthContext, type AuthenticatedRequest } from '../common/guards';
import { CurrentAuth, RequirePermissions } from '../common/decorators';
import { CatalogService } from './catalog.service';
import {
  CategoryDto,
  CreateProductDto,
  CreateVariantDto,
  CustomerDto,
  ListQueryDto,
  SupplierDto,
  TaxDto,
  UnitDto,
  UpdateProductDto,
} from './catalog.dto';

@ApiTags('Catálogo')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('tenant')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products/barcode/:code')
  @RequirePermissions('catalog.read')
  barcode(@Param('code') code: string) {
    return this.catalog.barcode(code);
  }

  @Get('products')
  @RequirePermissions('catalog.read')
  products(@Query() query: ListQueryDto) {
    return this.catalog.listProducts(query);
  }

  @Get('products/:id')
  @RequirePermissions('catalog.read')
  product(@Param('id') id: string) {
    return this.catalog.product(id);
  }

  @Post('products')
  @RequirePermissions('catalog.write')
  createProduct(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateProductDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catalog.createProduct(auth, dto, req.ip);
  }

  @Patch('products/:id')
  @RequirePermissions('catalog.write')
  updateProduct(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catalog.updateProduct(auth, id, dto, req.ip);
  }

  @Delete('products/:id')
  @RequirePermissions('catalog.write')
  deleteProduct(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catalog.deleteProduct(auth, id, req.ip);
  }

  @Post('products/:id/variants')
  @RequirePermissions('catalog.write')
  createVariant(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: CreateVariantDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catalog.createVariant(auth, id, dto, req.ip);
  }

  @Get('categories')
  @RequirePermissions('catalog.read')
  categories() {
    return this.catalog.categories();
  }

  @Post('categories')
  @RequirePermissions('catalog.write')
  createCategory(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CategoryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catalog.createCategory(auth, dto, req.ip);
  }

  @Get('taxes')
  @RequirePermissions('catalog.read')
  taxes() {
    return this.catalog.taxes();
  }

  @Post('taxes')
  @RequirePermissions('catalog.write')
  createTax(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: TaxDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catalog.createTax(auth, dto, req.ip);
  }

  @Get('units')
  @RequirePermissions('catalog.read')
  units() {
    return this.catalog.units();
  }

  @Post('units')
  @RequirePermissions('catalog.write')
  createUnit(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UnitDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catalog.createUnit(auth, dto, req.ip);
  }

  @Get('customers')
  @RequirePermissions('customers.read')
  customers(@Query() query: ListQueryDto) {
    return this.catalog.customers(query);
  }

  @Post('customers')
  @RequirePermissions('customers.write')
  createCustomer(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CustomerDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catalog.createCustomer(auth, dto, req.ip);
  }

  @Patch('customers/:id')
  @RequirePermissions('customers.write')
  updateCustomer(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: Partial<CustomerDto>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catalog.updateCustomer(auth, id, dto, req.ip);
  }

  @Get('suppliers')
  @RequirePermissions('suppliers.read')
  suppliers(@Query() query: ListQueryDto) {
    return this.catalog.suppliers(query);
  }

  @Post('suppliers')
  @RequirePermissions('suppliers.write')
  createSupplier(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SupplierDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catalog.createSupplier(auth, dto, req.ip);
  }

  @Patch('suppliers/:id')
  @RequirePermissions('suppliers.write')
  updateSupplier(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: Partial<SupplierDto>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.catalog.updateSupplier(auth, id, dto, req.ip);
  }
}
