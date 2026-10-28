# Changelog

Formato basado en Keep a Changelog. Versionado semántico mientras el proyecto permanezca en beta.

## [0.1.0-beta.1] - 2026-10-28

### Añadido

- Monorepo TypeScript con API NestJS, web React/Vite, escritorio Electron y paquete compartido.
- PostgreSQL con Prisma, claves foráneas compuestas por empresa y RLS forzado por tabla.
- Bootstrap idempotente de administradores de plataforma con cambio obligatorio de contraseña.
- Registro público, aprobación manual o automática, suspensión temporal, deshabilitación permanente y reactivación.
- Panel administrativo con tiendas, ficha, planes, módulos, usuarios, auditoría, operaciones y soporte de solo lectura.
- Recuperación por enlace de un solo uso y restablecimiento administrativo con contraseña temporal de una sola visualización.
- Catálogo, variantes, impuestos, unidades, clientes, proveedores, compras y recepciones parciales.
- Inventario por movimientos, ajustes, transferencias, lotes y control de concurrencia.
- POS con lector de código, cantidades decimales, descuentos autorizados, pagos mixtos, crédito y propina aceptada.
- Comprobantes HTML/PDF en 58 mm, 80 mm y A4, snapshot histórico y reimpresión marcada como copia.
- Devoluciones parciales/totales, cartera, abonos, gastos, cotizaciones y reportes CSV.
- Restaurante con mesas, comandas, cocina, separación de cuentas y cobro.
- Contabilidad básica con plan de cuentas, periodos, asientos, reversión, diario, mayor y balance.
- Integraciones de pagos y fiscal en modo prueba, webhooks firmados, eventos idempotentes y documentos fiscales de prueba sin CUFE.
- Identidad Saldio (SVG, PNG, ICO), temas claro/oscuro/sistema, acentos y reducción de transparencia/movimiento.
- Aplicación Windows con impresión e instalador NSIS x64.
- Pruebas unitarias, 11 pruebas de integración con PostgreSQL real y 3 pruebas E2E.

### Limitaciones conocidas

- Backend central no desplegado por el agente; requiere infraestructura y dominio.
- Adaptador fiscal de producción no implementado; solo prueba claramente identificada.
- Integración de pagos sin credenciales productivas; conciliación registrada, no liquidación automática.
- Instalador no firmado digitalmente.
- Sin modo offline completo; las operaciones protegidas requieren conexión.
- Sin integración con balanzas físicas.
