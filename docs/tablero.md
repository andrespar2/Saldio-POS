# Tablero de trabajo

GitHub Projects no pudo crearse: el token disponible solo tiene los alcances `gist`, `repo` y `workflow`; la API de Projects v2 exige `read:project`/`project`. El repositorio es personal (`andrespar2/Saldio-POS`), no de una organización. No se creó un Project en la cuenta personal ni se inventó un Project de repositorio. El seguimiento se mantiene con issues, milestones y este tablero versionado. Ver el bloqueo documentado en la Release.

Estados: **Pendiente**, **En desarrollo**, **En pruebas**, **Bloqueado**, **Terminado**.

| Fase / entrega | Estado | Evidencia |
|---|---|---|
| 1. Inspección, arquitectura, monorepo y ADR | Terminado | `docs/arquitectura.md`, `docs/adr/`, monorepo compilado. |
| 2. Multiempresa, RLS, auth, bootstrap y administradores | Terminado | Migración con RLS, pruebas de aislamiento, 2 admins de prueba. |
| 3. Panel administrativo | Terminado | `/admin` con tiendas, planes, admins, auditoría, operación y soporte. |
| 4. Ciclo de vida de tiendas y recuperación | Terminado | Registro/aprobación/suspensión/expiración; pruebas de recuperación. |
| 5. Identidad y diseño Liquid Glass ligera | Terminado | SVG/PNG/ICO, temas, acentos, accesibilidad, capturas. |
| 6. Catálogo, compras e inventario | Terminado | Productos, variantes, compras, recepción, movimientos, ajustes. |
| 7. POS, ventas, caja, comprobantes y devoluciones | Terminado | Venta UI/API, idempotencia, concurrencia, PDF, devolución. |
| 8. Restaurante, cocina y cuentas separadas | Terminado | Prueba de comanda, cobro sin doble descuento y split. |
| 9. Ropa, ferretería y tienda general | Terminado (alcance beta) | Variantes, unidades, cotizaciones, cartera; UI y API. |
| 10. Planes, permisos, cartera, gastos y reportes | Terminado | Matriz, guards, cartera, CSV, dashboard. |
| 11. Contabilidad básica | Terminado (básico) | Asientos, reversión, balance; validación contable pendiente externa. |
| 12. Integraciones fiscales y de pagos | Bloqueado (producción) | Modo prueba implementado; faltan credenciales/contrato/DIAN. |
| 13. Aplicación Windows e instalador | Terminado | Instalador NSIS x64 generado; sin firma. |
| 14. Pruebas y seguridad | Terminado (beta) | 8 unitarias API, 11 integración, 3 E2E; limitaciones documentadas. |
| 15. Documentación y Release | Terminado | Documentación completa; Release `v0.1.0-beta.1` publicada con instalador y SHA-256 verificado. |
| 16. Backend central desplegado | Bloqueado | No hay infraestructura/dominio/certificado autorizado. |
| 17. GitHub Project moderno | Bloqueado | Token sin alcance Projects; alternativa con issues/milestones/tablero. |

## Issues y milestones

Los issues en español contienen objetivo, alcance, dependencias, criterios de aceptación y evidencia de cierre. Los milestones agrupan las fases 1–12. Las referencias de commit se añaden al cerrar cada issue cuando el cambio está en `main`.

## Regla de cierre

Un issue solo pasa a **Terminado** si sus criterios se cumplen en la rama principal y hay evidencia reproducible. Las integraciones productivas y el despliegue central permanecen **Bloqueados** hasta recibir credenciales e infraestructura.
