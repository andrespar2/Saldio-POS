# Saldio POS · Release beta

> Este archivo es una plantilla. La Release real se publica con notas específicas de la versión y el SHA-256 calculado.

## Funcionalidades incluidas

- Administración multiempresa de tiendas, planes, usuarios y auditoría.
- POS con pagos mixtos, crédito, devoluciones, caja y comprobantes 58/80/A4.
- Inventario, compras, proveedores, clientes y reportes.
- Restaurante con mesas, comandas, cocina y separación de cuentas.
- Contabilidad básica de partida doble.
- Aplicación Windows conectada a una API configurable.

## Requisitos

- Windows 10/11 x64.
- URL HTTPS de una API Saldio POS desplegada.
- Conexión a Internet para confirmar operaciones.

## Instalación

1. Descargue el instalador y verifique el SHA-256.
2. Ejecute el `.exe`. El instalador no está firmado; Windows puede advertirlo.
3. Abra Saldio POS y configure la URL HTTPS del servidor.
4. Inicie sesión con una cuenta autorizada.

## Limitaciones

- No hay backend central desplegado por el agente; se requiere infraestructura.
- Facturación electrónica y pagos solo en modo prueba/pendiente de configurar.
- Sin firma de código.
- Sin modo offline completo.
- Sin integración con balanzas o impresoras fiscales.

## Integridad

El archivo `SHA256SUMS.txt` adjunto contiene el hash del instalador. Verifique con:

```powershell
Get-FileHash .\Saldio-POS-Setup-*.exe -Algorithm SHA256
```

## Pruebas

Consulte `docs/pruebas-rendimiento.md` para el resumen de pruebas unitarias, integración, E2E, instalación y rendimiento. No se afirma ausencia total de errores.
