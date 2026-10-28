# Instalación y primer acceso

## Requisitos

- Windows 10/11 x64 para el instalador de escritorio.
- Node.js 22.12+ y npm 11 para desarrollo.
- PostgreSQL 15+ (probado con PostgreSQL 18 embebido en desarrollo y compatible con 17 en Docker).
- HTTPS y un dominio para producción.
- Opcional: Docker Desktop/Compose.

## Desarrollo local sin Docker

```powershell
npm install
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Use el valor generado para `JWT_ACCESS_SECRET` y `FILE_SIGNING_SECRET`; genere 32 bytes hexadecimales para `CONFIG_ENCRYPTION_KEY`. No comparta ni versiones `.env`.

```powershell
npm run dev:db
```

En otra terminal:

```powershell
Copy-Item .env apps/api/.env
npm run db:migrate
npm run db:seed
```

El script `dev:db` crea el rol `saldio` y la base `saldio` en el puerto 5433. Es una comodidad de desarrollo, no un servidor de producción.

## Administradores iniciales (bootstrap)

Configure **en el entorno**, nunca en un archivo versionado:

| Variable | Contenido |
|---|---|
| `BOOTSTRAP_ENABLED` | `true` solo para el primer arranque. |
| `BOOTSTRAP_ADMIN_1_NAME` | Nombre del primer administrador. |
| `BOOTSTRAP_ADMIN_1_USERNAME` | Usuario del primer administrador. |
| `BOOTSTRAP_ADMIN_1_PASSWORD` | Contraseña inicial, mínimo 10 caracteres. |
| `BOOTSTRAP_ADMIN_2_*` | Equivalentes para el segundo administrador. |

Ejemplo de ejecución (sin valores reales):

```powershell
$env:BOOTSTRAP_ENABLED = "true"
# Defina las variables con su gestor de secretos o la consola.
npm run bootstrap
Remove-Item Env:BOOTSTRAP_ADMIN_1_PASSWORD, Env:BOOTSTRAP_ADMIN_2_PASSWORD
```

El bootstrap:

- no hace nada si ya existe cualquier administrador de plataforma;
- no restablece contraseñas existentes;
- crea el marcador `bootstrap.completed`;
- obliga cambio de contraseña en el primer acceso;
- no escribe contraseñas en logs ni en la base en claro.

Después del primer acceso, cambie el usuario y la contraseña desde **Mi perfil**. No vuelva a habilitar el bootstrap.

## Docker Compose (referencia)

```powershell
Copy-Item .env.example .env
# Ajuste POSTGRES_PASSWORD y las URLs en .env
docker compose -f infra/docker-compose.yml up -d --build
docker compose -f infra/docker-compose.yml exec api npx prisma migrate deploy
```

Consulte [despliegue.md](despliegue.md) y [respaldo-recuperacion.md](respaldo-recuperacion.md). Docker no estaba instalado en el entorno de construcción, por lo que el Compose es una referencia reproducible, no una ejecución verificada localmente.

## Aplicación Windows

1. Descargue `Saldio-POS-Setup-0.1.0-beta.1-x64.exe` desde la Release.
2. Ejecute el instalador. Windows puede advertir que el editor no está verificado porque **no hay certificado de firma**.
3. Abra **Saldio POS** desde el menú Inicio o el acceso directo.
4. Pulse **Configurar servidor** e ingrese la URL HTTPS de la API, por ejemplo `https://pos.midominio.com` (sin `/api/v1`).
5. Inicie sesión. La configuración y preferencias quedan en `%APPDATA%` y se conservan al actualizar.
6. Para desinstalar, use **Configuración → Aplicaciones** o el desinstalador. No se borran automáticamente los datos de preferencias.

El instalador no contiene credenciales de base de datos, claves privadas ni secretos administrativos.

## Verificación

```powershell
curl http://localhost:3000/api/v1/health
npm run test
npm run test:integration
npm run test:e2e
```
