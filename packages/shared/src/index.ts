/**
 * Definiciones compartidas entre API, web y escritorio.
 * Ninguna de estas reglas reemplaza la autorizacion del servidor.
 */

export const BUSINESS_TYPES = [
  'SUPERMARKET',
  'RESTAURANT',
  'CLOTHING',
  'HARDWARE',
  'GENERAL',
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  SUPERMARKET: 'Supermercado o minimercado',
  RESTAURANT: 'Restaurante o cafetería',
  CLOTHING: 'Ropa y accesorios',
  HARDWARE: 'Ferretería',
  GENERAL: 'Tienda general',
};

export const BUSINESS_TYPE_SHORT: Record<BusinessType, string> = {
  SUPERMARKET: 'Supermercado',
  RESTAURANT: 'Restaurante',
  CLOTHING: 'Ropa',
  HARDWARE: 'Ferretería',
  GENERAL: 'Tienda general',
};

export const MODULES = [
  'CORE',
  'POS',
  'INVENTORY',
  'PURCHASES',
  'SUPPLIERS',
  'CUSTOMERS',
  'CASH',
  'REPORTS',
  'RETURNS',
  'EXPENSES',
  'CREDITS',
  'QUOTES',
  'VARIANTS',
  'LOTS',
  'RECIPES',
  'RESTAURANT',
  'KITCHEN',
  'ACCOUNTING',
  'FISCAL',
  'PAYMENTS',
  'MULTIBRANCH',
  'EMPLOYEES',
  'EXPORTS',
] as const;
export type ModuleCode = (typeof MODULES)[number];

export const MODULE_LABELS: Record<ModuleCode, string> = {
  CORE: 'Núcleo comercial',
  POS: 'Punto de venta',
  INVENTORY: 'Inventario',
  PURCHASES: 'Compras',
  SUPPLIERS: 'Proveedores',
  CUSTOMERS: 'Clientes',
  CASH: 'Caja',
  REPORTS: 'Reportes',
  RETURNS: 'Devoluciones',
  EXPENSES: 'Gastos',
  CREDITS: 'Crédito y cartera',
  QUOTES: 'Cotizaciones',
  VARIANTS: 'Variantes',
  LOTS: 'Lotes y vencimientos',
  RECIPES: 'Recetas',
  RESTAURANT: 'Mesas y pedidos',
  KITCHEN: 'Cocina',
  ACCOUNTING: 'Contabilidad',
  FISCAL: 'Facturación electrónica',
  PAYMENTS: 'Pagos integrados',
  MULTIBRANCH: 'Multi-sucursal',
  EMPLOYEES: 'Empleados',
  EXPORTS: 'Exportación de datos',
};

export const SECTOR_MODULES: Record<BusinessType, ModuleCode[]> = {
  SUPERMARKET: [
    'CORE',
    'POS',
    'INVENTORY',
    'PURCHASES',
    'SUPPLIERS',
    'CUSTOMERS',
    'CASH',
    'REPORTS',
    'RETURNS',
    'EXPENSES',
    'LOTS',
    'CREDITS',
    'EXPORTS',
  ],
  RESTAURANT: [
    'CORE',
    'POS',
    'INVENTORY',
    'PURCHASES',
    'SUPPLIERS',
    'CUSTOMERS',
    'CASH',
    'REPORTS',
    'RETURNS',
    'EXPENSES',
    'RECIPES',
    'RESTAURANT',
    'KITCHEN',
    'EXPORTS',
  ],
  CLOTHING: [
    'CORE',
    'POS',
    'INVENTORY',
    'PURCHASES',
    'SUPPLIERS',
    'CUSTOMERS',
    'CASH',
    'REPORTS',
    'RETURNS',
    'EXPENSES',
    'VARIANTS',
    'CREDITS',
    'EXPORTS',
  ],
  HARDWARE: [
    'CORE',
    'POS',
    'INVENTORY',
    'PURCHASES',
    'SUPPLIERS',
    'CUSTOMERS',
    'CASH',
    'REPORTS',
    'RETURNS',
    'EXPENSES',
    'QUOTES',
    'CREDITS',
    'MULTIBRANCH',
    'EXPORTS',
  ],
  GENERAL: [
    'CORE',
    'POS',
    'INVENTORY',
    'PURCHASES',
    'SUPPLIERS',
    'CUSTOMERS',
    'CASH',
    'REPORTS',
    'RETURNS',
    'EXPENSES',
    'CREDITS',
    'EXPORTS',
  ],
};

export const GLOBAL_ADDON_MODULES: ModuleCode[] = [
  'ACCOUNTING',
  'FISCAL',
  'PAYMENTS',
  'MULTIBRANCH',
  'EMPLOYEES',
  'EXPORTS',
];

export const STORE_STATUSES = [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'DISABLED',
] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const STORE_STATUS_LABELS: Record<StoreStatus, string> = {
  PENDING: 'Pendiente de aprobación',
  ACTIVE: 'Activa',
  SUSPENDED: 'Suspendida temporalmente',
  DISABLED: 'Deshabilitada permanentemente',
};

export const TENANT_ROLES = [
  'OWNER',
  'ADMIN',
  'CASHIER',
  'INVENTORY',
  'ACCOUNTANT',
  'WAITER',
  'KITCHEN',
] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const TENANT_ROLE_LABELS: Record<TenantRole, string> = {
  OWNER: 'Propietario',
  ADMIN: 'Administrador de tienda',
  CASHIER: 'Cajero',
  INVENTORY: 'Inventario',
  ACCOUNTANT: 'Contabilidad',
  WAITER: 'Mesero',
  KITCHEN: 'Cocina',
};

export const PLATFORM_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PERMISSIONS = [
  'store.manage',
  'users.manage',
  'billing.manage',
  'catalog.read',
  'catalog.write',
  'inventory.read',
  'inventory.write',
  'purchases.read',
  'purchases.write',
  'customers.read',
  'customers.write',
  'suppliers.read',
  'suppliers.write',
  'sales.read',
  'sales.sell',
  'sales.discount',
  'sales.refund',
  'cash.open',
  'cash.close',
  'cash.manage',
  'expenses.manage',
  'reports.read',
  'accounting.read',
  'accounting.write',
  'credit.manage',
  'quotes.manage',
  'restaurant.read',
  'restaurant.manage',
  'kitchen.read',
  'kitchen.manage',
  'settings.manage',
  'data.export',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<TenantRole, Permission[]> = {
  OWNER: [...PERMISSIONS],
  ADMIN: PERMISSIONS.filter((p) => p !== 'billing.manage'),
  CASHIER: [
    'catalog.read',
    'inventory.read',
    'customers.read',
    'customers.write',
    'sales.read',
    'sales.sell',
    'cash.open',
    'cash.close',
    'restaurant.read',
    'restaurant.manage',
    'reports.read',
  ],
  INVENTORY: [
    'catalog.read',
    'catalog.write',
    'inventory.read',
    'inventory.write',
    'purchases.read',
    'purchases.write',
    'suppliers.read',
    'suppliers.write',
    'reports.read',
  ],
  ACCOUNTANT: [
    'catalog.read',
    'inventory.read',
    'sales.read',
    'purchases.read',
    'customers.read',
    'suppliers.read',
    'reports.read',
    'accounting.read',
    'accounting.write',
    'credit.manage',
    'data.export',
  ],
  WAITER: [
    'catalog.read',
    'restaurant.read',
    'restaurant.manage',
    'kitchen.read',
    'sales.read',
  ],
  KITCHEN: ['catalog.read', 'kitchen.read', 'kitchen.manage'],
};

export const PLATFORM_PERMISSIONS = [
  'platform.stores.read',
  'platform.stores.write',
  'platform.admins.manage',
  'platform.plans.manage',
  'platform.audit.read',
  'platform.support.access',
  'platform.jobs.manage',
  'platform.settings.manage',
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const PLATFORM_ROLE_PERMISSIONS: Record<
  PlatformRole,
  PlatformPermission[]
> = {
  SUPER_ADMIN: [...PLATFORM_PERMISSIONS],
  ADMIN: PLATFORM_PERMISSIONS.filter(
    (p) => p !== 'platform.admins.manage',
  ),
  SUPPORT: [
    'platform.stores.read',
    'platform.audit.read',
    'platform.support.access',
  ],
};

export interface AccessInput {
  storeStatus: StoreStatus;
  businessType: BusinessType;
  contractedModules: string[];
  enabledModules: string[];
  role: TenantRole;
  customPermissions?: string[];
  branchRestricted?: boolean;
}

export interface AccessResult {
  allowed: boolean;
  effectiveModules: ModuleCode[];
  permissions: Permission[];
  reason?: string;
}

/**
 * El backend repite esta evaluacion. La UI solo la usa para navegacion.
 * Estado de tienda, sector, plan, modulos contratados y permisos deben coincidir.
 */
export function resolveAccess(input: AccessInput): AccessResult {
  if (input.storeStatus !== 'ACTIVE') {
    return {
      allowed: false,
      effectiveModules: [],
      permissions: [],
      reason:
        input.storeStatus === 'PENDING'
          ? 'La tienda está pendiente de aprobación.'
          : input.storeStatus === 'SUSPENDED'
            ? 'La tienda está suspendida temporalmente.'
            : 'La tienda está deshabilitada permanentemente.',
    };
  }
  const rolePermissions = ROLE_PERMISSIONS[input.role] ?? [];
  const permissions = Array.from(
    new Set([
      ...rolePermissions,
      ...((input.customPermissions ?? []) as Permission[]),
    ]),
  );
  const sectorModules = new Set([
    ...(SECTOR_MODULES[input.businessType] ?? []),
    ...GLOBAL_ADDON_MODULES,
  ]);
  const contracted = new Set(input.contractedModules);
  const enabled = new Set(input.enabledModules);
  const effectiveModules = [...sectorModules].filter(
    (m) => contracted.has(m) || enabled.has(m) || m === 'CORE',
  );
  return { allowed: true, effectiveModules, permissions };
}

export function hasPermission(
  permissions: string[],
  permission: Permission,
): boolean {
  return permissions.includes(permission);
}

export function canUseModule(
  modules: string[],
  module: ModuleCode,
): boolean {
  return modules.includes(module);
}

export function isBusinessType(value: string): value is BusinessType {
  return (BUSINESS_TYPES as readonly string[]).includes(value);
}

export function isTenantRole(value: string): value is TenantRole {
  return (TENANT_ROLES as readonly string[]).includes(value);
}

export * from './money.js';
