# Arquitectura

## Vista general

```text
┌─────────────────────────────┐        ┌──────────────────────────────┐
│ Web React/TypeScript        │        │ Windows Electron            │
│ Vite · HashRouter · Query   │        │ UI empaquetada + impresión   │
└──────────────┬──────────────┘        └──────────────┬───────────────┘
               │ HTTPS / Bearer JWT                   │ HTTPS / Bearer JWT
               └──────────────────┬───────────────────┘
                                  ▼
                    ┌─────────────────────────────┐
                    │ API NestJS (monolito)       │
                    │ Guards · RLS context · API  │
                    │ OpenAPI · trabajos internos │
                    └──────────┬──────────────────┘
                               │ SQL
                    ┌──────────▼──────────────────┐
                    │ PostgreSQL                  │
                    │ tenant_id + RLS + FKs       │
                    │ compuestas + auditoría      │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │ Almacenamiento privado      │
                    │ (local / volumen) + HMAC    │
                    └─────────────────────────────┘
```

No hay microservicios ni colas externas. Los trabajos en segundo plano se persisten en PostgreSQL y se procesan con un worker interno idempotente.

## Módulos de la API

| Módulo | Responsabilidad |
|---|---|
| `auth` | Inicio de sesión, selección de tienda, refresh rotatorio, sesiones, recuperación y perfil. |
| `platform` | Tiendas, estados, planes, administradores, auditoría, soporte y operación. |
| `public` | Planes, tipos de negocio y autorregistro con logo. |
| `tenant` | Acceso efectivo, configuración, sucursales, bodegas, cajas, usuarios, onboarding y archivos. |
| `catalog` | Productos, variantes, categorías, impuestos, unidades, clientes y proveedores. |
| `inventory` | Stock, movimientos, ajustes, transferencias y compras. |
| `sales` | POS, ventas, pagos, caja, devoluciones, cartera, cotizaciones, gastos y comprobantes. |
| `restaurant` | Áreas, mesas, pedidos, cocina y separación de cuentas. |
| `accounting` | Plan de cuentas, periodos, asientos, reversiones y balance. |
| `reports` | Resumen, ventas, productos, inventario y exportación CSV. |
| `integrations` | Configuración fiscal/pagos, documentos de prueba y webhooks. |

## Contexto de empresa y RLS

1. El JWT contiene `sub`, `sid`, `tenantId`, `membershipId`, `role` y `supportSessionId` opcional.
2. El guard verifica la sesión en base, el usuario, la membresía y el estado de la tienda.
3. El interceptor abre una transacción y ejecuta `set_config('app.tenant_id', ..., true)`.
4. Las tablas de negocio tienen `ENABLE/FORCE ROW LEVEL SECURITY`; la política compara `tenantId` con el GUC o permite `app.platform='on'` solo en tareas administrativas explícitas.
5. Ningún endpoint decide la empresa usando un header enviado por el cliente. El `tenantId` del token se contrasta con la membresía.

Las tablas globales necesarias para autenticación (usuarios, sesiones, membresías, tiendas, planes, auditoría administrativa) no usan RLS, pero sus consultas están restringidas por servicios y guards.

## Dinero y cantidades

- Dinero: `Decimal(14,2)` en base; precios unitarios `Decimal(14,4)`; cantidades `Decimal(16,3)`.
- Cálculo por línea y total en el servidor con `decimal.js`.
- Redondeo documentado: **mitad hacia arriba a 2 decimales por línea**; el impuesto se calcula sobre la base después del descuento.
- La web usa la misma función compartida solo para vista previa; el servidor recalcula y decide.
- Idempotencia de ventas y abonos mediante `Idempotency-Key`, registro único por empresa y bloqueo asesor transaccional.

## Inventario y concurrencia

- Cada cambio genera un `InventoryMovement` inmutable.
- Las salidas usan `UPDATE ... WHERE quantity >= ?` y fallan con `INSUFFICIENT_STOCK` si otro proceso consumió la última unidad.
- Las recetas descuentan ingredientes una sola vez; los pedidos de restaurante marcan `inventoryDeducted` y el cobro no vuelve a descontar.
- Devoluciones y anulaciones generan documentos/movimientos relacionados; no se borran ventas confirmadas.

## Documentos históricos

El comprobante guarda un snapshot con datos de tienda, sucursal, caja, vendedor, cliente, líneas, impuestos, pagos y leyenda fiscal. Editar la tienda o el producto después no reescribe ese snapshot. La reimpresión incrementa un contador y se identifica como copia.

## Trabajos y correo

- `Job` usa un worker con `FOR UPDATE SKIP LOCKED`, reintentos exponenciales y estado visible en administración.
- `EmailOutbox` conserva correos; si no hay SMTP quedan pendientes y son visibles. El enlace de recuperación no se registra en logs.
- Las suspensiones temporales vencidas se reactivan con un trabajo periódico auditado.

## Decisiones

Ver [ADR](adr/): monolito modular, PostgreSQL/RLS, scrypt, Electron, trabajos en base y política monetaria.
