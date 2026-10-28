# API

La especificación interactiva está disponible en `/docs` y el JSON en `/docs-json` cuando la API está en ejecución. Se versiona una copia en [`openapi.json`](openapi.json).

## Autenticación

- `POST /api/v1/auth/login` — usuario/correo y contraseña.
- `POST /api/v1/auth/select-tenant` — selección cuando hay varias membresías.
- `POST /api/v1/auth/refresh` — rotación de refresh token.
- `POST /api/v1/auth/logout`, `GET /auth/me`, `PATCH /auth/profile`, `PATCH /auth/preferences`.
- `POST /api/v1/auth/change-password`, `POST /auth/change-username`.
- `POST /api/v1/auth/forgot-password`, `POST /auth/reset-password`.

Cabecera: `Authorization: Bearer <accessToken>`.

## Administración

Todas bajo `/api/v1/platform`, requieren rol de plataforma:

- `GET /dashboard`, `GET /stores`, `GET /stores/:id`, `PATCH /stores/:id`.
- `POST /stores/:id/approve`, `POST /stores/:id/status`, `POST /stores/:id/plan`.
- `POST /stores/:id/support-sessions`, `DELETE /support-sessions/:id`.
- `GET/POST /admins`, `PATCH /admins/:id`, `POST /admins/:id/reset-password`.
- `GET/POST /plans`, `PATCH /plans/:id`.
- `GET /audit`, `GET /operations`, `POST /jobs/:id/retry`.
- `GET/PATCH /settings`.

## Tienda

Todas bajo `/api/v1/tenant` con `tenantId` derivado de la sesión:

- `GET /access`, `GET/PATCH /store`, `POST /store/logo`.
- `GET /branches`, `POST /branches`, `PATCH /branches/:id`.
- `GET /warehouses`, `POST /warehouses`, `GET /registers`, `POST /registers`.
- `GET /users`, `POST /users`, `PATCH /users/:id`, `POST /users/:id/reset-password`.
- `GET/POST /products`, `GET/PATCH/DELETE /products/:id`, `POST /products/:id/variants`, `GET /products/barcode/:code`.
- `GET/POST /categories`, `/taxes`, `/units`, `/customers`, `/suppliers`.
- `GET /inventory/stock`, `/inventory/movements`, `POST /inventory/adjustments`, `/inventory/transfers`.
- `GET/POST /purchases`, `GET /purchases/:id`, `POST /purchases/:id/receive`.
- `GET/POST /sales`, `GET /sales/:id`, `GET /sales/:id/receipt`, `/pdf`, `POST /sales/:id/print`, `POST /sales/:id/returns`.
- `GET/POST /cash/...` (sesiones, apertura, cierre, movimientos).
- `GET /receivables`, `POST /receivables/:id/payments`.
- `GET/POST /quotes`, `POST /quotes/:id/convert`.
- `GET/POST /expenses`.
- `GET/POST /restaurant/...` (áreas, mesas, pedidos, cocina, separar, cobrar, anular).
- `GET /accounting/...`, `PUT /config`, `GET /trial-balance`, `GET /ledger/:id`, `POST /entries`, `POST /entries/:id/reverse`.
- `GET /reports/dashboard`, `/sales`, `/products`, `/inventory`, `/sales.csv`.
- `GET /integrations`, `PUT /integrations/fiscal`, `POST /integrations/payment-accounts`, `GET /integrations/fiscal-documents`.

## Público y webhooks

- `GET /api/v1/public/plans`, `/business-types`.
- `POST /api/v1/public/stores` (multipart, logo opcional).
- `POST /api/v1/webhooks/payments/:provider` — firma HMAC en `x-saldio-signature`.

## Idempotencia

En ventas y abonos envíe `Idempotency-Key` único. La API devuelve la misma respuesta ante un reintento válido y evita duplicar documentos.

## Errores

Formato:

```json
{
  "statusCode": 409,
  "code": "INSUFFICIENT_STOCK",
  "message": "Existencias insuficientes para Arroz 1kg.",
  "path": "/api/v1/tenant/sales",
  "timestamp": "2026-10-28T21:00:00.000Z"
}
```

Códigos relevantes: `STORE_PENDING`, `STORE_SUSPENDED`, `STORE_DISABLED`, `MODULE_NOT_CONTRACTED`, `PERMISSION_DENIED`, `PASSWORD_CHANGE_REQUIRED`, `SUPPORT_READ_ONLY`, `INSUFFICIENT_STOCK`, `DISCOUNT_NOT_AUTHORIZED`, `LAST_PLATFORM_ADMIN`, `NETWORK_ERROR` (cliente).

## Ejemplo de venta

```http
POST /api/v1/tenant/sales
Authorization: Bearer ...
Idempotency-Key: 6f1c...
Content-Type: application/json

{
  "branchId": "uuid",
  "registerId": "uuid",
  "cashSessionId": "uuid",
  "items": [{ "productId": "uuid", "quantity": "1.500" }],
  "payments": [
    { "method": "CASH", "amount": "10000", "received": "12000" },
    { "method": "CARD", "amount": "7850" }
  ],
  "tip": "0",
  "tipAccepted": false
}
```

El servidor ignora precios enviados salvo autorización de descuento, recalcula totales, valida stock y caja y devuelve el snapshot del comprobante.
