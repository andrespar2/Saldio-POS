# Modelo de datos

El esquema completo y ejecutable está en `apps/api/prisma/schema.prisma`. Las migraciones incluyen RLS, restricciones e índices.

## Principios

- Toda tabla de negocio lleva `tenantId`.
- Las relaciones críticas usan claves foráneas compuestas `(id, tenantId)`, de modo que la base rechaza una línea de la empresa A que apunte a un producto de la empresa B.
- Los documentos confirmados no se eliminan; se corrigen con devoluciones, reversiones o estados.
- Las tablas históricas guardan snapshots de datos comerciales.

## Grupos

### Plataforma y acceso

`User`, `Session`, `Membership`, `Store`, `Plan`, `Addon`, `StoreStatusHistory`, `AdminAudit`, `SupportSession`, `PasswordResetToken`, `EmailOutbox`, `Job`, `SystemSetting`.

- `Store.id` es el identificador de empresa (`tenantId`).
- `Membership` une usuario, tienda, rol, permisos adicionales y sucursal restringida.
- `User` es global; un usuario puede pertenecer a varias tiendas. El rol administrativo de plataforma es independiente del rol de tienda.

### Operación

`Branch`, `Warehouse`, `Register`, `Employee`, `Tax`, `Unit`, `Category`, `Product`, `ProductVariant`, `StockLevel`, `InventoryMovement`, `Customer`, `Supplier`.

- `Product.sku` y `barcode` son únicos por empresa.
- `StockLevel` usa una clave estable `producto:variante:lote` y un índice único por empresa/bodega.
- `InventoryMovement` es la fuente auditable; `StockLevel` es el saldo materializado.

### Compras y documentos

`Purchase`, `PurchaseLine`, `Quote`, `QuoteLine`, `Sale`, `SaleLine`, `Payment`, `Return`, `ReturnLine`, `Receivable`, `ReceivablePayment`, `Expense`, `CashSession`, `CashMovement`, `DocumentSequence`, `IdempotencyRecord`.

- `Sale.number` es consecutivo por empresa; `DocumentSequence` incrementa de forma atómica.
- `Sale.receiptSnapshot` congela el comprobante.
- `SaleLine` conserva descripción, SKU, precio, impuesto y costo usados al confirmar.
- `Payment` admite pagos mixtos; el saldo se materializa en `Sale.balance` y `Receivable.balance`.

### Restaurante

`RestaurantArea`, `RestaurantTable`, `RestaurantOrder`, `OrderItem`, `RecipeIngredient`.

- `OrderItem.inventoryDeducted` evita el doble descuento.
- `RestaurantOrder.parentOrderId` relaciona cuentas separadas conservando las líneas.

### Contabilidad

`AccountingAccount`, `AccountingPeriod`, `JournalEntry`, `JournalLine`, `AccountingConfig`.

- Cada asiento debe tener débitos = créditos (validación de servicio y restricciones de líneas).
- Un periodo cerrado no admite asientos nuevos.
- La reversión crea un asiento inverso y marca el original como `REVERSED`.

### Integraciones y archivos

`FileObject`, `IntegrationConfig`, `IntegrationLog`, `PaymentEvent`, `StorePaymentAccount`, `Subscription`, `FiscalDocument`, `OnboardingTask`, `AuditLog`.

- `FileObject` se guarda fuera del directorio público; el acceso usa URL firmada temporal.
- `PaymentEvent` tiene unicidad por proveedor/evento.
- `FiscalDocument` distingue modo prueba, estado y error; no inventa CUFE.

## Índices y restricciones destacadas

- `@@unique([tenantId, sku])`, `@@unique([tenantId, barcode])`.
- `CashSession_one_open_per_register` (índice parcial) impide dos cajas abiertas en la misma caja.
- Checks de cantidades positivas, stock no negativo, totales no negativos, débito/crédito no simultáneos.
- Índices por `tenantId`, estado y fechas para listados y reportes.

## RLS

La migración inicial crea políticas `tenant_isolation` sobre las tablas de negocio. `apps/api/prisma/sql/rls.sql` conserva una copia legible de las políticas. La aplicación abre una transacción por solicitud autenticada y fija `app.tenant_id`; el propietario de las tablas también está sujeto a RLS (`FORCE`).

## Retención

No hay borrado automático de ventas, comprobantes, movimientos o asientos. La baja de una tienda es lógica (`DISABLED`). Cualquier depuración futura requiere una política de retención aprobada y respaldos verificables.
