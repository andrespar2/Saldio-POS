-- Aislamiento multiempresa en PostgreSQL.
-- El backend abre una transaccion por solicitud autenticada y fija
-- app.tenant_id con set_config(..., true). app.platform = 'on' solo se usa
-- para tareas administrativas explicitas, bootstrap y webhooks verificados.
-- FORCE ROW LEVEL SECURITY aplica tambien al propietario de las tablas.

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'Branch','Warehouse','Register','Employee','Tax','Unit','Category',
    'Product','ProductVariant','StockLevel','InventoryMovement','Customer',
    'Supplier','Purchase','PurchaseLine','Quote','QuoteLine','Sale','SaleLine',
    'Payment','Return','ReturnLine','CashSession','CashMovement','Expense',
    'Receivable','ReceivablePayment','RestaurantArea','RestaurantTable',
    'RestaurantOrder','OrderItem','RecipeIngredient','AccountingAccount',
    'AccountingPeriod','JournalEntry','JournalLine','AccountingConfig',
    'DocumentSequence','IdempotencyRecord','AuditLog','FiscalDocument',
    'OnboardingTask','FileObject','IntegrationConfig','StorePaymentAccount',
    'Subscription','StoreStatusHistory'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (
         current_setting(''app.platform'', true) = ''on''
         OR "tenantId" = NULLIF(current_setting(''app.tenant_id'', true), '''')
       ) WITH CHECK (
         current_setting(''app.platform'', true) = ''on''
         OR "tenantId" = NULLIF(current_setting(''app.tenant_id'', true), '''')
       )',
      t
    );
  END LOOP;
END $$;

-- IntegrationLog admite eventos sin tenant (webhooks globales).
ALTER TABLE "IntegrationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "IntegrationLog" USING (
  current_setting('app.platform', true) = 'on'
  OR ("tenantId" IS NOT NULL AND "tenantId" = NULLIF(current_setting('app.tenant_id', true), ''))
) WITH CHECK (
  current_setting('app.platform', true) = 'on'
  OR ("tenantId" IS NOT NULL AND "tenantId" = NULLIF(current_setting('app.tenant_id', true), ''))
);

-- Una sola caja abierta por registro.
CREATE UNIQUE INDEX "CashSession_one_open_per_register"
  ON "CashSession" ("tenantId", "registerId")
  WHERE "status" = 'OPEN';

-- Invariantes de integridad que Prisma no expresa.
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_totals_nonnegative"
  CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "tax" >= 0 AND "total" >= 0 AND "paid" >= 0 AND "balance" >= 0 AND "tip" >= 0);
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_amounts_nonnegative"
  CHECK ("unitPrice" >= 0 AND "discount" >= 0 AND "lineTotal" >= 0);
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_received_valid"
  CHECK ("receivedQty" >= 0 AND "receivedQty" <= "quantity");
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" >= 0 AND "tip" >= 0);
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_amounts_nonnegative"
  CHECK ("debit" >= 0 AND "credit" >= 0 AND ("debit" = 0 OR "credit" = 0));
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_balances_nonnegative"
  CHECK ("originalAmount" >= 0 AND "paidAmount" >= 0 AND "balance" >= 0);
ALTER TABLE "ReceivablePayment" ADD CONSTRAINT "ReceivablePayment_positive" CHECK ("amount" > 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_positive" CHECK ("amount" > 0);
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_amount_not_zero" CHECK ("amount" <> 0);

-- Indices de busqueda por empresa.
CREATE INDEX "Product_tenant_name_lower_idx" ON "Product" ("tenantId", lower("name"));
CREATE INDEX "Customer_tenant_name_lower_idx" ON "Customer" ("tenantId", lower("name"));
CREATE INDEX "Store_name_lower_idx" ON "Store" (lower("name"));
