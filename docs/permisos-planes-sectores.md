# Matriz de permisos, sectores y planes

El acceso efectivo combina, en este orden:

1. Estado de la tienda (`ACTIVE` obligatorio para operar).
2. Sector (`BusinessType`).
3. Plan y módulos contratados/complementos.
4. Permisos del rol de membresía y permisos personalizados.
5. Sucursal asignada al usuario (cuando aplica).
6. Contexto de soporte (`readOnly`).

La API vuelve a evaluar las restricciones; ocultar un botón no sustituye la autorización.

## Módulos por sector

| Módulo | Supermercado | Restaurante | Ropa | Ferretería | General |
|---|---:|---:|---:|---:|---:|
| CORE, POS, INVENTORY, CUSTOMERS, CASH, REPORTS, RETURNS, EXPENSES | Sí | Sí | Sí | Sí | Sí |
| PURCHASES, SUPPLIERS | Sí | Sí | Sí | Sí | Sí |
| LOTS | Sí | — | — | — | — |
| RECIPES, RESTAURANT, KITCHEN | — | Sí | — | — | — |
| VARIANTS | — | — | Sí | — | — |
| QUOTES | — | — | — | Sí | — |
| CREDITS | Sí | — | Sí | Sí | Sí |
| MULTIBRANCH | — | — | — | Sí | — |
| ACCOUNTING, FISCAL, PAYMENTS, EMPLOYEES, EXPORTS | Complementos/planes según contratación | | | | |

`GLOBAL_ADDON_MODULES` permite habilitar contabilidad, fiscal, pagos, multi-sucursal, empleados y exportaciones aunque no sean propios del sector.

## Roles de tienda

| Permiso | OWNER | ADMIN | CASHIER | INVENTORY | ACCOUNTANT | WAITER | KITCHEN |
|---|---:|---:|---:|---:|---:|---:|---:|
| `store.manage`, `users.manage` | Sí | Sí | — | — | — | — | — |
| `billing.manage` | Sí | — | — | — | — | — | — |
| `catalog.read` | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| `catalog.write` | Sí | Sí | — | Sí | — | — | — |
| `inventory.read` | Sí | Sí | Sí | Sí | Sí | — | — |
| `inventory.write` | Sí | Sí | — | Sí | — | — | — |
| `purchases.*`, `suppliers.*` | Sí | Sí | — | Sí | lectura | — | — |
| `sales.read` | Sí | Sí | Sí | — | Sí | Sí | — |
| `sales.sell` | Sí | Sí | Sí | — | — | — | — |
| `sales.discount`, `sales.refund` | Sí | Sí | — | — | — | — | — |
| `cash.open`, `cash.close` | Sí | Sí | Sí | — | — | — | — |
| `cash.manage` | Sí | Sí | — | — | — | — | — |
| `reports.read` | Sí | Sí | Sí | Sí | Sí | — | — |
| `accounting.*` | Sí | Sí | — | — | Sí | — | — |
| `credit.manage` | Sí | Sí | — | — | Sí | — | — |
| `restaurant.*`, `kitchen.*` | Sí | Sí | Sí | — | — | Sí | cocina |
| `data.export` | Sí | Sí | — | — | Sí | — | — |

La tabla resume `ROLE_PERMISSIONS` en `packages/shared`; el detalle exacto está en el código y se aplica en `TenantGuard`.

## Roles de plataforma

| Permiso | SUPER_ADMIN | ADMIN | SUPPORT |
|---|---:|---:|---:|
| `platform.stores.read` | Sí | Sí | Sí |
| `platform.stores.write` | Sí | Sí | — |
| `platform.admins.manage` | Sí | — | — |
| `platform.plans.manage` | Sí | Sí | — |
| `platform.audit.read` | Sí | Sí | Sí |
| `platform.support.access` | Sí | Sí | Sí |
| `platform.jobs.manage` | Sí | Sí | — |
| `platform.settings.manage` | Sí | Sí | — |

## Planes semilla

- **Básico:** operación de POS, inventario, clientes, caja, reportes, devoluciones, gastos y exportación. Límites: 3 usuarios, 1 sucursal.
- **Profesional:** añade compras, proveedores, cartera, cotizaciones, variantes, lotes y empleados. Límites: 10 usuarios, 3 sucursales.
- **Empresarial:** añade recetas, restaurante, cocina, contabilidad, fiscal, pagos y multi-sucursal. Límites: 50 usuarios, 20 sucursales.

Los límites se validan en servidor al crear usuarios y sucursales. Un cambio de plan no elimina datos.
