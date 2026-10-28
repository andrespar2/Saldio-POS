import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { StockService } from '../inventory/stock.service';
import type { AuthContext } from '../common/guards';
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

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
  ) {}

  private get db() {
    return this.prisma.db;
  }

  private tenant(): string {
    const id = this.prisma.tenantId;
    if (!id) throw new NotFoundException('Contexto de tienda requerido.');
    return id;
  }

  private async validateRefs(input: {
    categoryId?: string | null;
    taxId?: string | null;
    unitId?: string;
  }) {
    const tenantId = this.tenant();
    if (input.categoryId) {
      const category = await this.db.category.findFirst({
        where: { id: input.categoryId, tenantId },
      });
      if (!category) throw new BadRequestException('Categoría inválida.');
    }
    if (input.taxId) {
      const tax = await this.db.tax.findFirst({ where: { id: input.taxId, tenantId } });
      if (!tax) throw new BadRequestException('Impuesto inválido.');
    }
    if (input.unitId) {
      const unit = await this.db.unit.findFirst({ where: { id: input.unitId, tenantId } });
      if (!unit) throw new BadRequestException('Unidad inválida.');
    }
  }

  async listProducts(query: ListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const search = query.search?.trim();
    const where: Prisma.ProductWhereInput = {
      tenantId: this.tenant(),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: 'asc' },
        include: {
          category: { select: { id: true, name: true } },
          tax: { select: { id: true, name: true, rate: true } },
          unit: { select: { id: true, name: true, code: true, allowDecimal: true } },
          variants: true,
          stock: {
            select: {
              quantity: true,
              warehouseId: true,
              variantId: true,
              lotCode: true,
              warehouse: { select: { name: true } },
            },
          },
        },
      }),
      this.db.product.count({ where }),
    ]);
    return {
      items: items.map((product) => this.withStock(product)),
      meta: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    };
  }

  private withStock<T extends { stock: Array<{ quantity: Prisma.Decimal; warehouseId: string }>; reorderPoint: Prisma.Decimal | null }>(
    product: T,
  ) {
    const totalStock = product.stock.reduce(
      (sum, row) => sum + Number(row.quantity),
      0,
    );
    return {
      ...product,
      totalStock: totalStock.toFixed(3),
      lowStock:
        product.reorderPoint !== null &&
        totalStock <= Number(product.reorderPoint),
    };
  }

  async product(id: string) {
    const product = await this.db.product.findFirst({
      where: { id, tenantId: this.tenant() },
      include: {
        category: true,
        tax: true,
        unit: true,
        variants: true,
        stock: {
          include: { warehouse: { select: { id: true, name: true } } },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!product) throw new NotFoundException('Producto no encontrado.');
    return this.withStock(product);
  }

  async barcode(code: string) {
    const tenantId = this.tenant();
    const product = await this.db.product.findFirst({
      where: {
        tenantId,
        active: true,
        OR: [{ barcode: code }, { variants: { some: { barcode: code, active: true } } }],
      },
      include: {
        tax: true,
        unit: true,
        variants: { where: { active: true } },
        stock: { select: { quantity: true, warehouseId: true, variantId: true } },
      },
    });
    if (!product) throw new NotFoundException('Código no encontrado.');
    const variant = product.variants.find((v) => v.barcode === code) ?? null;
    return { product: this.withStock(product), variant };
  }

  async createProduct(auth: AuthContext, dto: CreateProductDto, ip?: string) {
    const tenantId = this.tenant();
    await this.validateRefs(dto);
    if (dto.type === 'VARIANT' && !dto.variants?.length) {
      throw new BadRequestException('Un producto variable requiere al menos una variante.');
    }
    if (dto.initialStock && !dto.warehouseId) {
      throw new BadRequestException('Seleccione la bodega para el stock inicial.');
    }
    if (dto.warehouseId) {
      const warehouse = await this.db.warehouse.findFirst({
        where: { id: dto.warehouseId, tenantId },
      });
      if (!warehouse) throw new BadRequestException('Bodega inválida.');
    }
    const product = await this.db.product.create({
      data: {
        tenantId,
        sku: dto.sku,
        barcode: dto.barcode || null,
        name: dto.name,
        description: dto.description,
        type: (dto.type ?? 'SIMPLE') as never,
        categoryId: dto.categoryId || null,
        taxId: dto.taxId || null,
        unitId: dto.unitId,
        price: dto.price,
        wholesalePrice: dto.wholesalePrice ?? null,
        wholesaleMinQty: dto.wholesaleMinQty ?? '6',
        cost: dto.cost ?? '0',
        trackInventory: dto.trackInventory ?? true,
        lotTracking: dto.lotTracking ?? false,
        reorderPoint: dto.reorderPoint ?? null,
        active: dto.active ?? true,
      },
    });
    if (dto.variants?.length) {
      await this.db.productVariant.createMany({
        data: dto.variants.map((v) => ({
          tenantId,
          productId: product.id,
          sku: v.sku,
          barcode: v.barcode || null,
          size: v.size,
          color: v.color,
          priceOverride: v.priceOverride ?? null,
        })),
      });
    }
    const createdProduct = await this.db.product.findFirstOrThrow({
      where: { id: product.id },
      include: { variants: true, tax: true, unit: true },
    });
    if (dto.initialStock && Number(dto.initialStock) > 0 && dto.warehouseId) {
      await this.stock.apply({
        warehouseId: dto.warehouseId,
        productId: product.id,
        quantity: dto.initialStock,
        unitCost: dto.cost ?? '0',
        type: 'INITIAL',
        referenceType: 'PRODUCT',
        referenceId: product.id,
        reason: 'Stock inicial',
        userId: auth.userId,
        productName: product.name,
      });
    }
    await this.db.onboardingTask.updateMany({
      where: { tenantId, key: 'products' },
      data: { completed: true, completedAt: new Date() },
    });
    await this.audit.tenant(auth, {
      action: 'PRODUCT_CREATED',
      entityType: 'Product',
      entityId: product.id,
      after: { sku: product.sku, name: product.name, price: dto.price },
      ip,
    });
    return createdProduct;
  }

  async updateProduct(
    auth: AuthContext,
    id: string,
    dto: UpdateProductDto,
    ip?: string,
  ) {
    const tenantId = this.tenant();
    const before = await this.db.product.findFirst({ where: { id, tenantId } });
    if (!before) throw new NotFoundException('Producto no encontrado.');
    await this.validateRefs(dto);
    const data: Record<string, unknown> = {};
    for (const key of [
      'name',
      'description',
      'price',
      'wholesalePrice',
      'wholesaleMinQty',
      'cost',
      'reorderPoint',
      'barcode',
    ] as const) {
      if (dto[key] !== undefined) data[key] = dto[key] || null;
    }
    if (dto.categoryId !== undefined) data.categoryId = dto.categoryId || null;
    if (dto.taxId !== undefined) data.taxId = dto.taxId || null;
    if (dto.unitId !== undefined) data.unitId = dto.unitId;
    if (dto.trackInventory !== undefined) data.trackInventory = dto.trackInventory;
    if (dto.lotTracking !== undefined) data.lotTracking = dto.lotTracking;
    if (dto.active !== undefined) data.active = dto.active;
    const after = await this.db.product.update({ where: { id }, data: data as never });
    await this.audit.tenant(auth, {
      action: 'PRODUCT_UPDATED',
      entityType: 'Product',
      entityId: id,
      before: { name: before.name, price: before.price, active: before.active },
      after: { name: after.name, price: after.price, active: after.active },
      ip,
    });
    return after;
  }

  async deleteProduct(auth: AuthContext, id: string, ip?: string) {
    const product = await this.db.product.findFirst({
      where: { id, tenantId: this.tenant() },
    });
    if (!product) throw new NotFoundException('Producto no encontrado.');
    await this.db.product.update({ where: { id }, data: { active: false } });
    await this.audit.tenant(auth, {
      action: 'PRODUCT_DEACTIVATED',
      entityType: 'Product',
      entityId: id,
      before: { active: product.active },
      after: { active: false },
      ip,
    });
    return { ok: true };
  }

  async createVariant(
    auth: AuthContext,
    productId: string,
    dto: CreateVariantDto,
    ip?: string,
  ) {
    const tenantId = this.tenant();
    const product = await this.db.product.findFirst({
      where: { id: productId, tenantId },
    });
    if (!product) throw new NotFoundException('Producto no encontrado.');
    if (dto.initialStock && dto.warehouseId) {
      const warehouse = await this.db.warehouse.findFirst({
        where: { id: dto.warehouseId, tenantId },
      });
      if (!warehouse) throw new BadRequestException('Bodega inválida.');
    }
    const variant = await this.db.productVariant.create({
      data: {
        tenantId,
        productId,
        sku: dto.sku,
        barcode: dto.barcode || null,
        size: dto.size,
        color: dto.color,
        priceOverride: dto.priceOverride ?? null,
      },
    });
    if (dto.initialStock && dto.warehouseId && Number(dto.initialStock) > 0) {
      await this.stock.apply({
        warehouseId: dto.warehouseId,
        productId,
        variantId: variant.id,
        quantity: dto.initialStock,
        unitCost: product.cost.toString(),
        type: 'INITIAL',
        referenceType: 'VARIANT',
        referenceId: variant.id,
        reason: 'Stock inicial de variante',
        userId: auth.userId,
        productName: `${product.name} ${dto.size ?? ''} ${dto.color ?? ''}`.trim(),
      });
    }
    await this.audit.tenant(auth, {
      action: 'PRODUCT_VARIANT_CREATED',
      entityType: 'ProductVariant',
      entityId: variant.id,
      after: { sku: dto.sku, size: dto.size, color: dto.color },
      ip,
    });
    return variant;
  }

  async categories() {
    return this.db.category.findMany({
      where: { tenantId: this.tenant() },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
  }

  async createCategory(auth: AuthContext, dto: CategoryDto, ip?: string) {
    if (dto.parentId) {
      const parent = await this.db.category.findFirst({
        where: { id: dto.parentId, tenantId: this.tenant() },
      });
      if (!parent) throw new BadRequestException('Categoría padre inválida.');
    }
    const category = await this.db.category.create({
      data: {
        tenantId: this.tenant(),
        name: dto.name,
        parentId: dto.parentId,
        sort: dto.sort ?? 0,
      },
    });
    await this.audit.tenant(auth, {
      action: 'CATEGORY_CREATED',
      entityType: 'Category',
      entityId: category.id,
      after: dto,
      ip,
    });
    return category;
  }

  async taxes() {
    return this.db.tax.findMany({
      where: { tenantId: this.tenant() },
      orderBy: { rate: 'desc' },
    });
  }

  async createTax(auth: AuthContext, dto: TaxDto, ip?: string) {
    const tax = await this.db.tax.create({
      data: {
        tenantId: this.tenant(),
        name: dto.name,
        code: dto.code.toUpperCase(),
        rate: dto.rate,
      },
    });
    await this.audit.tenant(auth, {
      action: 'TAX_CREATED',
      entityType: 'Tax',
      entityId: tax.id,
      after: dto,
      ip,
    });
    return tax;
  }

  async units() {
    return this.db.unit.findMany({
      where: { tenantId: this.tenant() },
      orderBy: { name: 'asc' },
    });
  }

  async createUnit(auth: AuthContext, dto: UnitDto, ip?: string) {
    if (dto.baseUnitId) {
      const base = await this.db.unit.findFirst({
        where: { id: dto.baseUnitId, tenantId: this.tenant() },
      });
      if (!base) throw new BadRequestException('Unidad base inválida.');
    }
    const unit = await this.db.unit.create({
      data: {
        tenantId: this.tenant(),
        name: dto.name,
        code: dto.code.toUpperCase(),
        allowDecimal: dto.allowDecimal ?? false,
        baseUnitId: dto.baseUnitId,
        conversionFactor: dto.conversionFactor ?? '1',
      },
    });
    await this.audit.tenant(auth, {
      action: 'UNIT_CREATED',
      entityType: 'Unit',
      entityId: unit.id,
      after: dto,
      ip,
    });
    return unit;
  }

  async customers(query: ListQueryDto) {
    const tenantId = this.tenant();
    const search = query.search?.trim();
    return this.db.customer.findMany({
      where: {
        tenantId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { taxId: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
    });
  }

  async createCustomer(auth: AuthContext, dto: CustomerDto, ip?: string) {
    const customer = await this.db.customer.create({
      data: { tenantId: this.tenant(), ...dto, creditLimit: dto.creditLimit ?? '0' } as never,
    });
    await this.audit.tenant(auth, {
      action: 'CUSTOMER_CREATED',
      entityType: 'Customer',
      entityId: customer.id,
      after: { name: dto.name },
      ip,
    });
    return customer;
  }

  async updateCustomer(
    auth: AuthContext,
    id: string,
    dto: Partial<CustomerDto>,
    ip?: string,
  ) {
    const customer = await this.db.customer.findFirst({
      where: { id, tenantId: this.tenant() },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado.');
    const updated = await this.db.customer.update({ where: { id }, data: dto as never });
    await this.audit.tenant(auth, {
      action: 'CUSTOMER_UPDATED',
      entityType: 'Customer',
      entityId: id,
      before: { name: customer.name, creditLimit: customer.creditLimit },
      after: { name: updated.name, creditLimit: updated.creditLimit },
      ip,
    });
    return updated;
  }

  async suppliers(query: ListQueryDto) {
    const tenantId = this.tenant();
    const search = query.search?.trim();
    return this.db.supplier.findMany({
      where: {
        tenantId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { taxId: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
    });
  }

  async createSupplier(auth: AuthContext, dto: SupplierDto, ip?: string) {
    const supplier = await this.db.supplier.create({
      data: { tenantId: this.tenant(), ...dto } as never,
    });
    await this.db.onboardingTask.updateMany({
      where: { tenantId: this.tenant(), key: 'suppliers' },
      data: { completed: true, completedAt: new Date() },
    });
    await this.audit.tenant(auth, {
      action: 'SUPPLIER_CREATED',
      entityType: 'Supplier',
      entityId: supplier.id,
      after: { name: dto.name },
      ip,
    });
    return supplier;
  }

  async updateSupplier(
    auth: AuthContext,
    id: string,
    dto: Partial<SupplierDto>,
    ip?: string,
  ) {
    const supplier = await this.db.supplier.findFirst({
      where: { id, tenantId: this.tenant() },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado.');
    const updated = await this.db.supplier.update({ where: { id }, data: dto as never });
    await this.audit.tenant(auth, {
      action: 'SUPPLIER_UPDATED',
      entityType: 'Supplier',
      entityId: id,
      before: { name: supplier.name },
      after: { name: updated.name },
      ip,
    });
    return updated;
  }
}
