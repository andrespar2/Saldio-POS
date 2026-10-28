# Inventario de dependencias y licencias

Inventario de dependencias directas declaradas. Las licencias deben verificarse también en dependencias transitivas antes de distribuir.

## Backend (`apps/api`)

| Dependencia | Licencia declarada |
|---|---|
| NestJS (`@nestjs/*`) | MIT |
| Prisma / `@prisma/client` | Apache-2.0 |
| `decimal.js` | MIT |
| `pdfkit` | MIT |
| `nodemailer` | MIT-0 |
| `helmet` | MIT |
| `class-validator`, `class-transformer` | MIT |
| `zod` | MIT |
| `rxjs` | Apache-2.0 |
| `reflect-metadata` | Apache-2.0 |
| PostgreSQL (servidor) | PostgreSQL License |

## Web (`apps/web`)

| Dependencia | Licencia |
|---|---|
| React / React DOM | MIT |
| React Router | MIT |
| TanStack Query | MIT |
| React Hook Form | MIT |
| Lucide React | ISC |
| Vite | MIT |
| Playwright | Apache-2.0 |
| Vitest | MIT |
| Decimal.js | MIT |

## Escritorio (`apps/desktop`)

| Dependencia | Licencia |
|---|---|
| Electron | MIT |
| electron-builder | MIT |
| NSIS (herramienta de empaquetado) | zlib/libpng |

## Herramientas de desarrollo

| Dependencia | Licencia |
|---|---|
| TypeScript | Apache-2.0 |
| embedded-postgres | MIT |
| sharp | Apache-2.0 |
| png-to-ico | MIT |
| concurrently | MIT |

## Recursos del proyecto

- Logotipo, icono SVG, PNG e ICO: creación original para Saldio POS. No se usaron recursos propietarios de Apple ni marcas de terceros.
- Tipografías: fuentes del sistema (Segoe UI/Inter/Arial) referenciadas por nombre; no se redistribuyen archivos de fuentes.
- Inspiración visual “Liquid Glass”: concepto estético general, sin copiar recursos, iconos ni componentes propietarios.

## Acciones pendientes

1. Ejecutar un escaneo de licencias transitivas con la herramienta aprobada antes de distribuir.
2. Decidir la licencia del proyecto (ver `LICENSE.md`).
3. Revisar obligaciones de avisos de licencias de Electron/Chromium si se distribuye el instalador.
4. Confirmar términos del proveedor fiscal y de pagos cuando se integren.
