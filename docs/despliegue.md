# Despliegue

## Estado actual

El backend **no está desplegado** en un dominio público por el agente. El repositorio contiene lo necesario para desplegarlo, pero no se dispone de infraestructura, dominio, certificado ni credenciales de un proveedor cloud autorizado. El instalador publicado apunta a la URL que cada usuario configure; no incluye una API embebida.

## Requisitos de producción

- PostgreSQL 15+ administrado, con respaldo automático y cifrado en reposo.
- Contenedor o proceso Node.js con la API en HTTPS (proxy inverso).
- Almacenamiento persistente privado para `STORAGE_DIR` (volumen o bucket compatible).
- SMTP para recuperación de cuentas.
- Dominio y certificado TLS.
- Secretos en un gestor de secretos, nunca en la imagen ni en el repositorio.
- Worker de la API activo (los trabajos corren en el proceso).
- Monitoreo de `/api/v1/health` y de la cola de trabajos.

## Variables

Use `.env.example` como lista de nombres. Mínimo:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://usuario:clave@host:5432/saldio?schema=public&sslmode=require
DIRECT_URL=postgresql://usuario:clave@host:5432/saldio?schema=public&sslmode=require
JWT_ACCESS_SECRET=<secreto-de-64-bytes>
FILE_SIGNING_SECRET=<secreto>
CONFIG_ENCRYPTION_KEY=<32-bytes-hex>
WEB_PUBLIC_URL=https://pos.midominio.com
API_PUBLIC_URL=https://api.midominio.com
CORS_ORIGINS=https://pos.midominio.com,saldio://app
STORAGE_DIR=/data/uploads
SMTP_HOST=...
MAIL_FROM=Saldio POS <no-reply@midominio.com>
```

No configure `BOOTSTRAP_ENABLED` en un despliegue ya inicializado.

## Migraciones

```bash
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npm run db:seed        # planes y complementos, idempotente
```

El seed no crea tiendas ni administradores. Los administradores se crean con bootstrap desde un entorno controlado.

## Docker Compose

`infra/docker-compose.yml` incluye PostgreSQL, API y web. Antes de usarlo:

1. Copie `.env.example` a `.env` y complete secretos.
2. Cambie `POSTGRES_PASSWORD` y las URLs.
3. Monte un volumen persistente para PostgreSQL y `STORAGE_DIR`.
4. Publique detrás de un proxy TLS; no exponga PostgreSQL a Internet.
5. Verifique el logo y el CORS de escritorio (`saldio://app`).

```bash
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml exec api npx prisma migrate deploy --schema prisma/schema.prisma
docker compose -f infra/docker-compose.yml exec api npm run db:seed
```

Docker no estaba instalado en el equipo de construcción; esta configuración debe validarse en el entorno destino.

## API y web

- `apps/api/Dockerfile` compila TypeScript y ejecuta `node dist/main.js`.
- `apps/web/Dockerfile` compila Vite y sirve archivos estáticos con Nginx.
- El proxy debe enviar `/api` a la API y servir la web en la raíz.
- Configure `CORS_ORIGINS` con el dominio web y `saldio://app`.
- No use el servidor de desarrollo de Vite en producción.

## Secure cookies/CSRF

La autenticación usa bearer tokens y no cookies, por lo que CSRF no aplica al API. Almacene tokens en el cliente con cuidado; la aplicación web los guarda en `localStorage` y la sesión de soporte en `sessionStorage`. Use HTTPS obligatorio y una política CSP restrictiva.

## Actualizaciones

1. Respalde y verifique restauración.
2. Ejecute migraciones compatibles hacia adelante.
3. Despliegue API y web.
4. Ejecute health y una venta de prueba.
5. Publique un nuevo instalador; las preferencias del escritorio se conservan.

No hay migraciones destructivas automáticas. Cualquier cambio de esquema que elimine datos requiere aprobación y plan de migración.

## Rollback

Mantenga la imagen anterior. Si una migración es incompatible, restaure el respaldo en una base nueva y apunte la API; no improvise `DROP` sobre producción.
