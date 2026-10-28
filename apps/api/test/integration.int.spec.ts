import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashPassword } from '../src/common/security';
import { PlatformService } from '../src/platform/platform.service';
import { PLATFORM_ROLE_PERMISSIONS } from '@saldio/shared';

type Dict = Record<string, any>;

const ADMIN_A = { username: 'admin_prueba_a', password: 'AdminPruebaA2026!' };
const ADMIN_B = { username: 'admin_prueba_b', password: 'AdminPruebaB2026!' };
const OWNER_A = { username: 'owner_a_prueba', password: 'OwnerPruebaA2026!' };
const OWNER_B = { username: 'owner_b_prueba', password: 'OwnerPruebaB2026!' };
const OWNER_C = { username: 'owner_c_prueba', password: 'OwnerPruebaC2026!' };

describe('Saldio POS · integración con PostgreSQL real', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken = '';
  let adminId = '';
  let superAdminId = '';
  let storeA = '';
  let storeB = '';
  let storeC = '';
  let tokenA = '';
  let tokenB = '';
  let tokenC = '';
  let accessA: Dict;
  let accessC: Dict;
  let productA = '';
  let customerA = '';
  let cashA = '';
  let branchA = '';
  let registerA = '';
  let warehouseA = '';
  const suffix = `${Date.now()}`;
  const api = () => request(app.getHttpServer());

  const login = async (username: string, password: string) => {
    const response = await api().post('/api/v1/auth/login').send({ username, password });
    expect([200, 201]).toContain(response.status);
    return response.body;
  };

  const registerStore = async (params: {
    type: string;
    plan: string;
    key: string;
    owner: { username: string; password: string };
  }) => {
    const response = await api()
      .post('/api/v1/public/stores')
      .send({
        name: `Tienda ${params.key} ${suffix}`,
        legalName: `Tienda ${params.key} SAS`,
        taxType: 'NIT',
        taxId: `9${suffix.slice(-8)}${params.key}`,
        ownerName: `Propietario ${params.key}`,
        username: params.owner.username,
        email: `${params.owner.username}-${suffix}@example.test`,
        phone: '3001234567',
        address: 'Calle de pruebas 123',
        city: 'Bogotá',
        businessType: params.type,
        password: params.owner.password,
        confirmPassword: params.owner.password,
        planCode: params.plan,
        termsAccepted: true,
        dataAccepted: true,
      });
    expect(response.status).toBe(201);
    return response.body.storeId as string;
  };

  const approve = async (storeId: string) => {
    const response = await api()
      .post(`/api/v1/platform/stores/${storeId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(response.status).toBe(200);
  };

  const storeSetup = async (token: string) => {
    const access = await api().get('/api/v1/tenant/access').set('Authorization', `Bearer ${token}`);
    expect(access.status).toBe(200);
    const warehouses = await api().get('/api/v1/tenant/warehouses').set('Authorization', `Bearer ${token}`);
    const registers = await api().get('/api/v1/tenant/registers').set('Authorization', `Bearer ${token}`);
    const units = await api().get('/api/v1/tenant/units').set('Authorization', `Bearer ${token}`);
    const taxes = await api().get('/api/v1/tenant/taxes').set('Authorization', `Bearer ${token}`);
    return {
      access: access.body,
      warehouse: warehouses.body[0],
      register: registers.body[0],
      unit: units.body.find((u: Dict) => u.code === 'UND'),
      tax: taxes.body.find((t: Dict) => t.code === 'IVA19'),
    };
  };

  const createProduct = async (
    token: string,
    warehouseId: string,
    unitId: string,
    taxId: string,
    sku: string,
    price: string,
    stock: string,
  ) => {
    const response = await api()
      .post('/api/v1/tenant/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sku,
        name: `Producto ${sku}`,
        unitId,
        taxId,
        price,
        cost: '6000',
        initialStock: stock,
        warehouseId,
        type: 'SIMPLE',
        trackInventory: true,
      });
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

  const openCash = async (token: string, registerId: string) => {
    const response = await api()
      .post('/api/v1/tenant/cash/open')
      .set('Authorization', `Bearer ${token}`)
      .send({ registerId, openingAmount: '100000' });
    expect([201, 409]).toContain(response.status);
    if (response.status === 201) return response.body.id as string;
    const current = await api()
      .get(`/api/v1/tenant/cash/current?registerId=${registerId}`)
      .set('Authorization', `Bearer ${token}`);
    return current.body.id as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true, logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    superAdminId = (
      await prisma.user.create({
        data: {
          username: ADMIN_A.username,
          usernameLower: ADMIN_A.username,
          email: `${ADMIN_A.username}@tests.invalid`,
          emailLower: `${ADMIN_A.username}@tests.invalid`,
          fullName: 'Admin de prueba A',
          passwordHash: await hashPassword(ADMIN_A.password),
          isPlatformAdmin: true,
          platformRole: 'SUPER_ADMIN',
          platformPermissions: PLATFORM_ROLE_PERMISSIONS.SUPER_ADMIN,
          mustChangePassword: true,
        },
      })
    ).id;
    await prisma.user.create({
      data: {
        username: ADMIN_B.username,
        usernameLower: ADMIN_B.username,
        email: `${ADMIN_B.username}@tests.invalid`,
        emailLower: `${ADMIN_B.username}@tests.invalid`,
        fullName: 'Admin de prueba B',
        passwordHash: await hashPassword(ADMIN_B.password),
        isPlatformAdmin: true,
        platformRole: 'ADMIN',
        platformPermissions: PLATFORM_ROLE_PERMISSIONS.ADMIN,
        mustChangePassword: true,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('permite entrar a los dos administradores y exige cambio de contraseña', async () => {
    const first = await login(ADMIN_A.username, ADMIN_A.password);
    expect(first.platform).toBe(true);
    expect(first.user.mustChangePassword).toBe(true);
    const blocked = await api()
      .get('/api/v1/platform/dashboard')
      .set('Authorization', `Bearer ${first.accessToken}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const changed = await api()
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({
        currentPassword: ADMIN_A.password,
        newPassword: 'AdminPruebaANueva2026!',
        confirmPassword: 'AdminPruebaANueva2026!',
      });
    expect(changed.status).toBe(200);
    adminToken = first.accessToken;
    adminId = first.user.id;
    const second = await login(ADMIN_B.username, ADMIN_B.password);
    expect(second.platform).toBe(true);
    const secondChanged = await api()
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .send({
        currentPassword: ADMIN_B.password,
        newPassword: 'AdminPruebaBNueva2026!',
        confirmPassword: 'AdminPruebaBNueva2026!',
      });
    expect(secondChanged.status).toBe(200);
  });

  it('impide deshabilitar al último superadministrador', async () => {
    await api()
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        currentPassword: 'AdminPruebaANueva2026!',
        newPassword: 'AdminPruebaA2026!',
        confirmPassword: 'AdminPruebaA2026!',
      });
    // El token sigue válido; solo comprobamos la protección del último gestor.
    const response = await api()
      .patch(`/api/v1/platform/admins/${superAdminId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'DISABLED', reason: 'Prueba de protección' });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('LAST_PLATFORM_ADMIN');
  });

  it('registra, aprueba y aísla dos empresas', async () => {
    storeA = await registerStore({ type: 'SUPERMARKET', plan: 'BASICO', key: 'A', owner: OWNER_A });
    storeB = await registerStore({ type: 'GENERAL', plan: 'BASICO', key: 'B', owner: OWNER_B });
    const pending = await api().post('/api/v1/auth/login').send({ username: OWNER_A.username, password: OWNER_A.password });
    expect(pending.body.store.status).toBe('PENDING');
    await approve(storeA);
    await approve(storeB);
    tokenA = (await login(OWNER_A.username, OWNER_A.password)).accessToken;
    tokenB = (await login(OWNER_B.username, OWNER_B.password)).accessToken;
    const setup = await storeSetup(tokenA);
    accessA = setup.access;
    branchA = accessA.branches[0].id;
    warehouseA = setup.warehouse.id;
    registerA = setup.register.id;
    productA = await createProduct(tokenA, warehouseA, setup.unit.id, setup.tax.id, `A-${suffix}`, '10000', '10');
    cashA = await openCash(tokenA, registerA);

    const crossGet = await api().get(`/api/v1/tenant/products/${productA}`).set('Authorization', `Bearer ${tokenB}`);
    expect(crossGet.status).toBe(404);
    const direct = await prisma.withTenant({ tenantId: storeB }, () =>
      prisma.db.product.findFirst({ where: { id: productA } }),
    );
    expect(direct).toBeNull();
    const leakedCount = await prisma.withTenant({ tenantId: storeB }, () =>
      prisma.db.product.count(),
    );
    expect(leakedCount).toBe(0);
  });

  it('confirma venta con pago mixto, idempotencia y comprobante congelado', async () => {
    const saleBody = {
      branchId: branchA,
      registerId: registerA,
      cashSessionId: cashA,
      items: [{ productId: productA, quantity: '1' }],
      payments: [
        { method: 'CASH', amount: '5000', received: '5000' },
        { method: 'CARD', amount: '6900' },
      ],
    };
    const key = `sale-${suffix}-1`;
    const first = await api()
      .post('/api/v1/tenant/sales')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', key)
      .send(saleBody);
    expect(first.status).toBe(201);
    expect(Number(first.body.total)).toBe(11900);
    expect(first.body.receipt.footer).toBe('Generado por Saldio POS');
    expect(first.body.receipt.fiscal.electronic).toBe(false);
    const replay = await api()
      .post('/api/v1/tenant/sales')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', key)
      .send(saleBody);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(first.body.id);
    const count = await prisma.withTenant({ tenantId: storeA }, () =>
      prisma.db.sale.count({ where: { tenantId: storeA } }),
    );
    expect(count).toBe(1);
    const stock = await api()
      .get(`/api/v1/tenant/inventory/stock?warehouseId=${warehouseA}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(Number(stock.body.items[0].quantity)).toBe(9);
  });

  it('registra crédito, abono, devolución parcial y actualiza cartera e inventario', async () => {
    const proPlan = await prisma.plan.findUnique({ where: { code: 'PROFESIONAL' } });
    await api()
      .post(`/api/v1/platform/stores/${storeA}/plan`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planId: proPlan!.id, reason: 'Plan con cartera para pruebas' });
    const customer = await api()
      .post('/api/v1/tenant/customers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Cliente Crédito', creditLimit: '500000' });
    expect(customer.status).toBe(201);
    customerA = customer.body.id;
    const creditSale = await api()
      .post('/api/v1/tenant/sales')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', `credit-${suffix}`)
      .send({
        branchId: branchA,
        registerId: registerA,
        customerId: customerA,
        type: 'CREDIT',
        items: [{ productId: productA, quantity: '2' }],
        payments: [],
      });
    expect(creditSale.status).toBe(201);
    expect(Number(creditSale.body.balance)).toBe(23800);
    const receivableId = creditSale.body.receivable.id;
    const pay = await api()
      .post(`/api/v1/tenant/receivables/${receivableId}/payments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', `pay-${suffix}`)
      .send({ amount: '10000', method: 'CASH', cashSessionId: cashA });
    expect(pay.status).toBe(201);
    expect(Number(pay.body.balance)).toBe(13800);

    const saleForReturn = await api()
      .post('/api/v1/tenant/sales')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', `return-${suffix}`)
      .send({
        branchId: branchA,
        registerId: registerA,
        cashSessionId: cashA,
        items: [{ productId: productA, quantity: '2' }],
        payments: [{ method: 'CASH', amount: '23800' }],
      });
    expect(saleForReturn.status).toBe(201);
    const detail = await api()
      .get(`/api/v1/tenant/sales/${saleForReturn.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    const line = detail.body.lines[0];
    const returned = await api()
      .post(`/api/v1/tenant/sales/${saleForReturn.body.id}/returns`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        type: 'PARTIAL',
        reason: 'Producto en buen estado devuelto por el cliente',
        refundMethod: 'CARD',
        lines: [{ saleLineId: line.id, quantity: '1', restock: true }],
      });
    expect(returned.status).toBe(201);
    expect(Number(returned.body.total)).toBe(11900);
    const after = await api()
      .get(`/api/v1/tenant/sales/${saleForReturn.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(after.body.status).toBe('PARTIALLY_REFUNDED');
    const stock = await api()
      .get(`/api/v1/tenant/inventory/stock?warehouseId=${warehouseA}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(Number(stock.body.items[0].quantity)).toBeGreaterThan(0);
  });

  it('impide vender dos veces la última unidad', async () => {
    const setup = await storeSetup(tokenA);
    const lastUnit = await createProduct(
      tokenA,
      warehouseA,
      setup.unit.id,
      setup.tax.id,
      `ULT-${suffix}`,
      '10000',
      '1',
    );
    const body = {
      branchId: branchA,
      registerId: registerA,
      cashSessionId: cashA,
      items: [{ productId: lastUnit, quantity: '1' }],
      payments: [{ method: 'CASH', amount: '11900' }],
    };
    const [one, two] = await Promise.all([
      api().post('/api/v1/tenant/sales').set('Authorization', `Bearer ${tokenA}`).set('Idempotency-Key', `last-a-${suffix}`).send(body),
      api().post('/api/v1/tenant/sales').set('Authorization', `Bearer ${tokenA}`).set('Idempotency-Key', `last-b-${suffix}`).send(body),
    ]);
    const statuses = [one.status, two.status].sort();
    expect(statuses).toEqual([201, 409]);
    const failed = one.status === 409 ? one : two;
    expect(failed.body.code).toBe('INSUFFICIENT_STOCK');
  });

  it('suspende, revoca sesiones, bloquea acceso y reactiva; vence suspensión temporal', async () => {
    const suspended = await api()
      .post(`/api/v1/platform/stores/${storeA}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SUSPENDED', reason: 'Prueba de suspensión temporal', endsAt: new Date(Date.now() + 2500).toISOString() });
    expect(suspended.status).toBe(200);
    const revoked = await api().get('/api/v1/tenant/access').set('Authorization', `Bearer ${tokenA}`);
    expect(revoked.status).toBe(401);
    const relogin = await login(OWNER_A.username, OWNER_A.password);
    tokenA = relogin.accessToken;
    const blocked = await api().get('/api/v1/tenant/access').set('Authorization', `Bearer ${tokenA}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('STORE_SUSPENDED');
    const reactivated = await api()
      .post(`/api/v1/platform/stores/${storeA}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE', reason: 'Reactivación explícita de prueba' });
    expect(reactivated.status).toBe(200);
    const allowed = await api().get('/api/v1/tenant/access').set('Authorization', `Bearer ${tokenA}`);
    expect(allowed.status).toBe(200);

    await api()
      .post(`/api/v1/platform/stores/${storeA}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'SUSPENDED', reason: 'Vencimiento programado de prueba', endsAt: new Date(Date.now() + 1500).toISOString() });
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await app.get(PlatformService).expireSuspensions();
    const store = await prisma.store.findUnique({ where: { id: storeA } });
    expect(store?.status).toBe('ACTIVE');
  });

  it('abre una sesión de soporte de solo lectura y la revoca', async () => {
    const created = await api()
      .post(`/api/v1/platform/stores/${storeA}/support-sessions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Diagnóstico de prueba', minutes: 10 });
    expect(created.status).toBe(201);
    const supportToken = created.body.tokens.accessToken as string;
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${supportToken}`);
    expect(me.status).toBe(200);
    expect(me.body.store?.id).toBe(storeA);
    expect(me.body.readOnly).toBe(true);
    const access = await api().get('/api/v1/tenant/access').set('Authorization', `Bearer ${supportToken}`);
    expect(access.status).toBe(200);
    const write = await api()
      .post('/api/v1/tenant/categories')
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ name: 'No permitido' });
    expect(write.status).toBe(403);
    expect(write.body.code).toBe('SUPPORT_READ_ONLY');
    const revoked = await api()
      .delete(`/api/v1/platform/support-sessions/${created.body.session.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revoked.status).toBe(200);
    const after = await api().get('/api/v1/tenant/access').set('Authorization', `Bearer ${supportToken}`);
    expect(after.status).toBe(401);
  });

  it('cobra un pedido de restaurante sin descontar dos veces y separa cuentas', async () => {
    storeC = await registerStore({ type: 'RESTAURANT', plan: 'EMPRESARIAL', key: 'C', owner: OWNER_C });
    await approve(storeC);
    const loginC = await login(OWNER_C.username, OWNER_C.password);
    tokenC = loginC.accessToken;
    const setup = await storeSetup(tokenC);
    accessC = setup.access;
    const cashC = await openCash(tokenC, setup.register.id);
    const product = await createProduct(tokenC, setup.warehouse.id, setup.unit.id, setup.tax.id, `R-${suffix}`, '10000', '5');
    const area = await api()
      .post('/api/v1/tenant/restaurant/areas')
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ branchId: accessC.branches[0].id, name: 'Salón principal' });
    expect(area.status).toBe(201);
    const table = await api()
      .post('/api/v1/tenant/restaurant/tables')
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ areaId: area.body.id, name: 'Mesa 1', seats: 4 });
    const order = await api()
      .post('/api/v1/tenant/restaurant/orders')
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ branchId: accessC.branches[0].id, tableId: table.body.id, type: 'DINE_IN', guestCount: 2 });
    expect(order.status).toBe(201);
    await api()
      .post(`/api/v1/tenant/restaurant/orders/${order.body.id}/items`)
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ productId: product, quantity: '2' });
    const sent = await api()
      .post(`/api/v1/tenant/restaurant/orders/${order.body.id}/send`)
      .set('Authorization', `Bearer ${tokenC}`)
      .send({});
    expect(sent.status).toBe(200);
    const stockAfterSend = await api()
      .get(`/api/v1/tenant/inventory/stock?warehouseId=${setup.warehouse.id}`)
      .set('Authorization', `Bearer ${tokenC}`);
    expect(stockAfterSend.status).toBe(200);
    expect(Number(stockAfterSend.body.items[0].quantity)).toBe(3);
    const detail = await api()
      .get(`/api/v1/tenant/restaurant/orders/${order.body.id}`)
      .set('Authorization', `Bearer ${tokenC}`);
    const paid = await api()
      .post(`/api/v1/tenant/restaurant/orders/${order.body.id}/pay`)
      .set('Authorization', `Bearer ${tokenC}`)
      .set('Idempotency-Key', `rest-${suffix}`)
      .send({ payments: [{ method: 'CASH', amount: detail.body.total }], registerId: setup.register.id, tip: '0' });
    expect(paid.status).toBe(200);
    expect(paid.body.order.status).toBe('PAID');
    const stockAfterPay = await api()
      .get(`/api/v1/tenant/inventory/stock?warehouseId=${setup.warehouse.id}`)
      .set('Authorization', `Bearer ${tokenC}`);
    expect(Number(stockAfterPay.body.items[0].quantity)).toBe(3);

    const table2 = await api()
      .post('/api/v1/tenant/restaurant/tables')
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ areaId: area.body.id, name: 'Mesa 2', seats: 2 });
    const splitOrder = await api()
      .post('/api/v1/tenant/restaurant/orders')
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ branchId: accessC.branches[0].id, tableId: table2.body.id, type: 'DINE_IN', guestCount: 2 });
    await api()
      .post(`/api/v1/tenant/restaurant/orders/${splitOrder.body.id}/items`)
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ productId: product, quantity: '1' });
    await api()
      .post(`/api/v1/tenant/restaurant/orders/${splitOrder.body.id}/items`)
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ productId: product, quantity: '1' });
    const splitDetail = await api()
      .get(`/api/v1/tenant/restaurant/orders/${splitOrder.body.id}`)
      .set('Authorization', `Bearer ${tokenC}`);
    const before = Number(splitDetail.body.total);
    const split = await api()
      .post(`/api/v1/tenant/restaurant/orders/${splitOrder.body.id}/split`)
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ itemIds: [splitDetail.body.items[0].id] });
    expect(split.status).toBe(200);
    const sum = Number(split.body.parent.total) + Number(split.body.child.total);
    expect(Math.round(sum * 100) / 100).toBe(before);
    void cashC;
  });

  it('contabiliza la venta, rechaza asientos desequilibrados y cuadra el balance', async () => {
    tokenA = (await login(OWNER_A.username, OWNER_A.password)).accessToken;
    const plan = await prisma.plan.findUnique({ where: { code: 'EMPRESARIAL' } });
    await api()
      .post(`/api/v1/platform/stores/${storeA}/plan`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planId: plan!.id, reason: 'Plan para pruebas contables' });
    const enabled = await api()
      .put('/api/v1/tenant/accounting/config')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ enabled: true });
    expect(enabled.status).toBe(200);
    const setup = await storeSetup(tokenA);
    const sale = await api()
      .post('/api/v1/tenant/sales')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', `acct-${suffix}`)
      .send({
        branchId: branchA,
        registerId: registerA,
        cashSessionId: cashA,
        items: [{ productId: productA, quantity: '1' }],
        payments: [{ method: 'CARD', amount: '11900' }],
      });
    expect(sale.status).toBe(201);
    const trial = await api()
      .get('/api/v1/tenant/accounting/trial-balance')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(trial.status).toBe(200);
    expect(trial.body.totalDebit).toBe(trial.body.totalCredit);
    const accounts = await api()
      .get('/api/v1/tenant/accounting/accounts')
      .set('Authorization', `Bearer ${tokenA}`);
    const unbalanced = await api()
      .post('/api/v1/tenant/accounting/entries')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        date: new Date().toISOString(),
        description: 'Asiento inválido',
        lines: [
          { accountId: accounts.body[0].id, debit: '100', credit: '0' },
          { accountId: accounts.body[1].id, debit: '0', credit: '90' },
        ],
      });
    expect(unbalanced.status).toBe(400);
    void setup;
  });

  it('procesa recuperación de cuenta con enlace de un solo uso', async () => {
    const email = `${OWNER_A.username}-${suffix}@example.test`;
    const requested = await api().post('/api/v1/auth/forgot-password').send({ email });
    expect(requested.status).toBe(202);
    const outbox = await prisma.emailOutbox.findFirst({
      where: { to: email },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbox).not.toBeNull();
    const token = /token=([A-Za-z0-9_-]+)/.exec(outbox!.body)?.[1];
    expect(token).toBeTruthy();
    const newPassword = 'OwnerPruebaANueva2026!';
    const reset = await api()
      .post('/api/v1/auth/reset-password')
      .send({ token, password: newPassword, confirmPassword: newPassword });
    expect(reset.status).toBe(200);
    const loginNew = await login(OWNER_A.username, newPassword);
    expect(loginNew.accessToken).toBeTruthy();
    tokenA = loginNew.accessToken;
    const reuse = await api()
      .post('/api/v1/auth/reset-password')
      .send({ token, password: newPassword, confirmPassword: newPassword });
    expect(reuse.status).toBe(400);
  });

  it('verifica webhooks firmados, evita duplicados y reconcilia contra la cuenta', async () => {
    await api()
      .post('/api/v1/tenant/integrations/payment-accounts')
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ provider: 'test', accountRef: 'ACC-001', currency: 'COP', mode: 'TEST' });
    const body = {
      id: `evt-${suffix}`,
      type: 'payment.succeeded',
      tenantId: storeC,
      amount: '50000',
      currency: 'COP',
      accountRef: 'ACC-001',
      reference: 'REF-1',
    };
    const raw = JSON.stringify(body);
    const signature = createHmac('sha256', process.env.PAYMENTS_WEBHOOK_SECRET!).update(raw).digest('hex');
    const first = await api()
      .post('/api/v1/webhooks/payments/test')
      .set('Content-Type', 'application/json')
      .set('x-saldio-signature', signature)
      .send(raw);
    expect(first.status).toBe(200);
    expect(first.body.result).toBe('reconciled');
    const duplicate = await api()
      .post('/api/v1/webhooks/payments/test')
      .set('Content-Type', 'application/json')
      .set('x-saldio-signature', signature)
      .send(raw);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.duplicate).toBe(true);
    const invalid = await api()
      .post('/api/v1/webhooks/payments/test')
      .set('Content-Type', 'application/json')
      .set('x-saldio-signature', '00'.repeat(32))
      .send(raw);
    expect(invalid.status).toBe(401);
  });
});
