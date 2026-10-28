# Pruebas y rendimiento

## Entorno de ejecución

| Elemento | Valor |
|---|---|
| Sistema | Windows 10 Pro 22H2, x64 |
| CPU | Intel Core i5-6200U, 2 núcleos / 4 hilos |
| RAM | 8 GB |
| Node.js | 24.21.0 |
| npm | 11.19.0 |
| PostgreSQL | 18.4 embebido (`embedded-postgres`) |
| Navegador E2E | Chromium (Playwright 1.64) |

## Resultados de la suite

Ejecutados el 2026-10-28:

| Suite | Comando | Resultado |
|---|---|---|
| Compartida | `npm run test -w @saldio/shared` | 7 pruebas aprobadas (cálculos, acceso, reparto). |
| Web | `npm test -w @saldio/web` | 3 pruebas aprobadas. |
| API unitarias | `npm run test -w @saldio/api` | 8 aprobadas (scrypt, políticas, tokens, AES, importes). |
| Integración PostgreSQL real | `npm run test:integration` | **12/12 aprobadas** en 76 s. |
| E2E público | `npx playwright test` | **3/3 aprobadas**. |
| Typecheck | `npm run typecheck` | Sin errores. |
| Build | `npm run build` | API y web compiladas; división por módulos. |

### Cobertura funcional de integración

1. Login de dos administradores y cambio obligatorio.
2. Protección del último superadministrador.
3. Registro, aprobación y aislamiento de dos empresas (API + RLS directo).
4. Venta con pago mixto, idempotencia, snapshot y stock.
5. Crédito, abono, devolución parcial y actualización de cartera.
6. Dos cajeros compitiendo por la última unidad (201/409).
7. Suspensión con revocación de sesiones, bloqueo comprensible, reactivación y vencimiento temporal.
8. Sesión de soporte de solo lectura y revocación.
9. Restaurante: comanda, cocina, cobro sin doble descuento y separación de cuentas.
10. Contabilidad: venta contabilizada, asiento desequilibrado rechazado y balance cuadrado.
11. Recuperación con enlace de un solo uso y revocación.
12. Webhook firmado, evento duplicado y firma inválida.

## Rendimiento de catálogo

Se cargaron **10.000 productos** en una tienda de prueba (más el producto original). Medición contra la API local, 20 solicitudes, después de calentamiento:

| Operación | Promedio | Mínimo | Máximo |
|---|---:|---:|---:|
| Listado paginado (30 productos, página 2) | 61,2 ms | 34 ms | 298 ms |
| Búsqueda por nombre (30 resultados) | 106 ms | — | — |
| Resumen de dashboard (agregados de ventas, stock y cartera) | 510 ms | — | — |
| Búsqueda por código de barras | < 50 ms en productos normales | — | — |

La base se ejecutó en el mismo equipo, sin latencia de red. Estas cifras no son una garantía de producción; sirven como referencia reproducible.

## Pruebas manuales adicionales

- Instalador NSIS: instalación silenciosa, archivos, lanzamiento del `.exe`, desinstalación y actualización conservando configuración.
- Comprobante PDF 58/80/A4 y vista HTML.
- Cambio de tema claro/oscuro/sistema y acento.
- Venta desde la UI con efectivo, cambio y reimpresión.
- Verificación de que el instalador no contiene `.env`, credenciales ni base de datos.
- Firma Authenticode: **NotSigned** (sin certificado).

## Respaldo y restauración

Se ejecutó `node scripts/test-backup-restore.mjs` con PostgreSQL 18 local:

- `pg_dump --format=custom --no-owner --no-privileges`.
- Restauración en una base temporal nueva.
- Verificación: 1 tienda, 2 ventas, 10.001 productos y 48 políticas RLS presentes.
- La base temporal se eliminó al finalizar.

El procedimiento exacto de producción está en [respaldo-recuperacion.md](respaldo-recuperacion.md).

## Instalador Windows

- Instalación silenciosa NSIS en un directorio temporal: exit 0.
- Ejecutable instalado y lanzado; la depuración confirmó `saldio://app/index.html#/app` tras iniciar sesión.
- Login desde la aplicación instalada y dashboard cargado.
- Firma Authenticode: **NotSigned**.
- Actualización reinstalando el mismo paquete: configuración de API conservada en `%APPDATA%\Saldio POS`.
- Desinstalación silenciosa: exit 0; directorio de instalación eliminado; datos de usuario preservados por diseño.
- SHA-256 del instalador publicado: `3d34d6db3693bd4e1764e5cd483e80415ac590b20cc17050772e8d0b6e70f0f4`.

## Riesgos no cubiertos

- No se probó hardware térmico real.
- No se probaron credenciales/adaptadores fiscales o de pagos productivos.
- No se hizo prueba de carga distribuida ni auditoría de seguridad externa.
- No se probó restauración de un respaldo productivo porque no hay infraestructura desplegada.
- La base de datos de pruebas es PostgreSQL 18 embebido; producción debe validar la versión elegida.

## Reproducir

```powershell
npm run test
npm run test:integration
npm run test:e2e
npm run typecheck
node scripts/perf-seed.mjs
```

`scripts/perf-seed.mjs` es solo para desarrollo. No ejecutar en producción.
