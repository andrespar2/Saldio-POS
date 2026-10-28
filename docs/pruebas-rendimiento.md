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
| Integración PostgreSQL real | `npm run test:integration` | **11/11 aprobadas** en 58 s. |
| E2E público | `npx playwright test` | **3/3 aprobadas** en 47 s. |
| Typecheck | `npm run typecheck` | Sin errores. |
| Build | `npm run build` | API y web compiladas. |

### Cobertura funcional de integración

1. Login de dos administradores y cambio obligatorio.
2. Protección del último superadministrador.
3. Registro, aprobación y aislamiento de dos empresas (API + RLS directo).
4. Venta con pago mixto, idempotencia, snapshot y stock.
5. Crédito, abono, devolución parcial y actualización de cartera.
6. Dos cajeros compitiendo por la última unidad (201/409).
7. Suspensión con revocación de sesiones, bloqueo comprensible, reactivación y vencimiento temporal.
8. Restaurante: comanda, cocina, cobro sin doble descuento y separación de cuentas.
9. Contabilidad: venta contabilizada, asiento desequilibrado rechazado y balance cuadrado.
10. Recuperación con enlace de un solo uso y revocación.
11. Webhook firmado, evento duplicado y firma inválida.

## Rendimiento de catálogo

Se cargaron **10.000 productos** en una tienda de prueba (más el producto original). Medición contra la API local, 20 solicitudes por escenario, después de calentamiento:

| Operación | Promedio | Mínimo | Máximo |
|---|---:|---:|---:|
| Listado paginado (30 productos, página 2) | 61,2 ms | 34 ms | 298 ms |
| Búsqueda por nombre (30 resultados) | 106 ms | — | — |
| Resumen de dashboard (agregados de ventas, stock y cartera) | 510 ms | — | — |
| Búsqueda por código de barras | < 50 ms en productos normales | — | — |

La base se ejecutó en el mismo equipo, sin latencia de red. Estas cifras no son una garantía de producción; sirven como referencia reproducible.

## Pruebas manuales adicionales

- Instalador NSIS: instalación silenciosa, archivos, lanzamiento del `.exe`, desinstalación.
- Comprobante PDF 58/80/A4 y vista HTML.
- Cambio de tema claro/oscuro/sistema y acento.
- Venta desde la UI con efectivo, cambio y reimpresión.
- Verificación de que el instalador no contiene `.env`, credenciales ni base de datos.
- Firma Authenticode: **NotSigned** (sin certificado).

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
node scripts/perf-seed.mjs
```

`scripts/perf-seed.mjs` es solo para desarrollo. No ejecutar en producción.

## Respaldo y restauraci�n

Se ejecut� `node scripts/test-backup-restore.mjs` con PostgreSQL 18 local:

- `pg_dump --format=custom --no-owner --no-privileges`.
- Restauraci�n en una base temporal nueva.
- Verificaci�n: 1 tienda, 2 ventas, 10.001 productos y 48 pol�ticas RLS presentes.
- La base temporal se elimin� al finalizar.

El procedimiento exacto de producci�n est� en [respaldo-recuperacion.md](respaldo-recuperacion.md).

## Instalador Windows

- Instalaci�n silenciosa NSIS en un directorio temporal: exit 0.
- Ejecutable instalado y lanzado; `/json` de depuraci�n confirm� `saldio://app/index.html#/login`.
- Login desde la aplicaci�n instalada y dashboard cargado.
- Firma Authenticode: **NotSigned**.
- Desinstalaci�n silenciosa: exit 0; directorio de instalaci�n eliminado; acceso directo eliminado.
