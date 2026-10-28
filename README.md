# Saldio POS

Plataforma multiempresa para administrar tiendas y operar punto de venta, inventario, caja, cartera, restaurante y contabilidad básica. Monolito modular con API NestJS, web React/TypeScript, PostgreSQL con aislamiento por empresa y aplicación de escritorio Windows conectada al mismo backend.

> **Estado:** `0.1.0-beta.1`. El backend no está desplegado en infraestructura pública. El instalador incluido en la Release apunta a la API que usted configure; no incorpora base de datos ni secretos.

## Qué está implementado

- Registro público de tiendas, aprobación, suspensión temporal, deshabilitación permanente y reactivación auditada.
- Panel de administración de plataforma: tiendas, planes, módulos, usuarios, auditoría, trabajos, integraciones y sesiones de soporte de solo lectura.
- Autenticación con sesiones revocables, scrypt, cambio obligatorio de contraseña, recuperación por enlace de un solo uso y restablecimiento administrativo temporal mostrado una sola vez.
- Aislamiento multiempresa con `tenantId`, claves foráneas compuestas y políticas RLS de PostgreSQL.
- Catálogo con productos, variantes, unidades, impuestos, precios minorista/mayorista, lotes y stock por bodega.
- Compras con recepciones parciales, movimientos inmutables, ajustes y transferencias.
- POS con lector de código, cantidades decimales, descuentos autorizados, pagos mixtos, propina aceptada, crédito, abonos e idempotencia.
- Comprobantes con snapshot histórico, impresión 58 mm/80 mm/A4, PDF, reimpresión marcada como copia y leyenda fiscal honesta.
- Restaurante con áreas, mesas, comandas, cocina, separación de cuentas, propina y cobro sin doble descuento de inventario.
- Cartera, cotizaciones, gastos, reportes y exportación CSV.
- Contabilidad básica de partida doble, periodos, asientos, reversión y balance de prueba.
- Integraciones desacopladas en modo prueba para pagos y facturación electrónica, con webhooks firmados e idempotencia.
- Aplicación Windows (Electron) con UI empaquetada, API configurable, impresión y actualización que conserva preferencias.
- Suite de pruebas unitarias, integración con PostgreSQL real y E2E de la experiencia pública.

## Inicio rápido (Windows)

Requisitos: Node.js 22.12 o superior, npm 11 y Git. Docker es opcional; para desarrollo local se incluye PostgreSQL embebido.

```powershell
# 1. Dependencias
npm install

# 2. Configuración local (nunca versionar .env)
Copy-Item .env.example .env
# Genere secretos largos y aleatorios para JWT_ACCESS_SECRET,
# FILE_SIGNING_SECRET y CONFIG_ENCRYPTION_KEY.

# 3. Base de datos local (PostgreSQL embebido, puerto 5433)
npm run dev:db
# En otra terminal:
npm run db:migrate
npm run db:seed
Copy-Item .env apps/api/.env

# 4. Administradores iniciales: configure BOOTSTRAP_* en el entorno
#    (ver docs/instalacion.md). No escriba contraseñas en archivos versionados.
$env:BOOTSTRAP_ENABLED = "true"
npm run bootstrap

# 5. API y web
npm run dev
```

- Web: <http://localhost:5173>
- API: <http://localhost:3000/api/v1>
- OpenAPI: <http://localhost:3000/docs>
- Salud: <http://localhost:3000/api/v1/health>

El primer acceso administrativo exige cambiar la contraseña. El bootstrap es idempotente, no restablece cuentas existentes y se desactiva con el marcador `bootstrap.completed`.

## Estructura

```
apps/api        API NestJS, Prisma, migraciones, RLS, pruebas
apps/web        React + Vite + TypeScript, temas Liquid Glass ligera
apps/desktop    Shell Electron, impresión e instalador NSIS
packages/shared Capacidades por sector, permisos y motor monetario
docs            Arquitectura, guías, ADR, limitaciones y tablero
infra           Docker Compose, Dockerfiles y Nginx
scripts         PostgreSQL embebido, pruebas de integración e iconos
```

## Pruebas

```powershell
npm run test              # unitarias compartidas, web y API
npm run test:integration  # PostgreSQL real efímero + 11 pruebas de integración
npm run test:e2e          # Playwright sobre la experiencia pública
npm run typecheck
npm run build
```

Resultados de referencia y entorno en [docs/pruebas-rendimiento.md](docs/pruebas-rendimiento.md). No se afirma “cero bugs”: se documentan los defectos conocidos y las limitaciones.

## Escritorio e instalador

```powershell
npm run desktop:build
npm run desktop:dist
```

Artefacto: `apps/desktop/release/Saldio-POS-Setup-0.1.0-beta.1-x64.exe` (Windows x64, NSIS). El instalador no está firmado digitalmente porque no se dispone de certificado. No se debe desactivar la protección de Windows para ejecutarlo; Windows puede mostrar una advertencia de editor desconocido.

La aplicación incluye la interfaz local y solicita la URL HTTPS de la API en el primer uso. Las preferencias se conservan en `%APPDATA%` al actualizar; el desinstalador no borra automáticamente los datos locales.

## Documentación

- [Instalación y bootstrap](docs/instalacion.md)
- [Arquitectura](docs/arquitectura.md) · [Modelo de datos](docs/modelo-datos.md)
- [Administración de plataforma](docs/administrador.md)
- [Vendedor y módulos por sector](docs/vendedor.md)
- [Matriz de permisos, planes y sectores](docs/permisos-planes-sectores.md)
- [Despliegue](docs/despliegue.md) · [Respaldo y recuperación](docs/respaldo-recuperacion.md)
- [Seguridad y recuperación de cuentas](docs/seguridad-cuentas.md)
- [Facturación y pagos](docs/fiscal-pagos.md) · [Impresión](docs/impresion.md)
- [Pruebas y rendimiento](docs/pruebas-rendimiento.md) · [Limitaciones](docs/limitaciones.md)
- [ADR](docs/adr/) · [Tablero](docs/tablero.md) · [CHANGELOG](CHANGELOG.md)

## Licencia

No se ha seleccionado una licencia de código abierto. El proyecto figura como `UNLICENSED` y todos los derechos quedan reservados hasta que el propietario autorice una licencia. Ver [LICENSE.md](LICENSE.md) y [docs/dependencias-licencias.md](docs/dependencias-licencias.md).

## Advertencia fiscal

El comprobante generado es un **comprobante interno de venta**. Mientras no exista un adaptador fiscal certificado y credenciales productivas verificadas, no es una factura electrónica validada por la DIAN, no contiene CUFE real y no debe presentarse como cumplimiento tributario completo.
