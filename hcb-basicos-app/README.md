# hcb-basicos-app

Sistema web de caja para registrar consumos usando la API de Básicos de Hospital Clínica Bíblica, con perfiles de acceso, historial filtrable y exportación a Excel.

## Características principales

- Backend con Node.js + Express.
- Frontend vanilla (HTML, CSS y JavaScript).
- Persistencia en SQLite para historial local.
- Respaldo opcional en Neon Postgres sincronizado en background (SQLite sigue siendo fuente primaria).
- Monto fijo por tipo de consumo (sin digitación manual).
- Botón visual de escaneo junto al código (demo de cámara/láser).
- Flujo código primero: se verifica y luego se habilitan consumos disponibles.
- Validación por horario CR (UTC-6): desayuno 05:00-10:55, almuerzo 11:00-15:50, cena 16:00-23:59, café 00:00-23:59.
- Bloqueo por día: si el empleado ya consumió un tipo hoy, queda deshabilitado.
- Eliminación lógica de consumos desde admin (se mueven a sección Eliminados).
- Perfil vendedor: registra consumos por código y tipo.
- Perfil admin: registra, visualiza historial completo, filtra y exporta a Excel.
- Token HCB cacheado por ~4 minutos y reintento automático ante error de autorización.

## Perfiles

- Vendedor:
  - Puede registrar transacciones.
  - No puede ver historial ni exportar.
- Admin:
  - Puede registrar transacciones.
  - Puede ver historial con filtros por fecha, código y tipo de consumo.
  - Puede eliminar transacciones exitosas y enviarlas a Eliminados.
  - Puede exportar los resultados filtrados a Excel.

## Instalación

1. Desde la raiz del repositorio, ejecute: npm install
2. Copie variables de entorno:
  - macOS/Linux: cp hcb-basicos-app/.env.example hcb-basicos-app/.env
  - PowerShell: Copy-Item hcb-basicos-app/.env.example hcb-basicos-app/.env
3. Desde la raiz del repositorio, ejecute: npm start

La aplicación queda en http://localhost:2934

## Variables de entorno

Archivo .env:

HCB_BASE_URL=https://servicios.clinicabiblica.com/apipruebas/HCBAPI
HCB_PUBLIC_KEY=colocar_aqui_public_key
HCB_SERVICIO=colocar_aqui_id_servicio
HCB_USUARIO=colocar_aqui_usuario
HCB_LLAVE_PRIVADA=colocar_aqui_llave_privada
HCB_SODA=SUBWAY
HCB_INTEGRATION_MODE=api
APP_ADMIN_USER=admin
APP_ADMIN_PASSWORD=admin123
APP_SELLER_USER=vendedor
APP_SELLER_PASSWORD=vendedor123
SESSION_SECRET=colocar_un_secreto_largo_aqui
PORT=2934
NEON_DATABASE_URL=colocar_connection_string_neon
NEON_SYNC_ENABLED=true
NEON_SYNC_INTERVAL_MS=90000
NEON_SYNC_BATCH_SIZE=100
NEON_SYNC_STARTUP_DELAY_MS=15000
NEON_BACKUP_RETENTION_DAYS=180
NEON_CLEANUP_INTERVAL_MS=21600000
SQLITE_DB_PATH=

HCB_INTEGRATION_MODE controla el tipo de prueba:

- api: usa la API externa real.
- local: simula validación y registro en backend local, sin llamadas externas ni llaves reales.

Para pruebas locales sin credenciales, configure:

HCB_INTEGRATION_MODE=local

SQLITE_DB_PATH es opcional. Si no se define, el sistema usa hcb-basicos-app/database.sqlite.
En Docker se recomienda definir SQLITE_DB_PATH=/data/database.sqlite para persistir en volumen.

## Docker (VPS puerto 2934)

Prerequisitos:

- Docker Engine instalado
- Docker Compose v2 (comando docker compose)

Pasos desde la raiz del repositorio:

1. Copiar variables: Copy-Item hcb-basicos-app/.env.example hcb-basicos-app/.env
2. Editar hcb-basicos-app/.env con credenciales reales
3. Construir imagen: docker compose build
4. Levantar servicio: docker compose up -d
5. Ver logs: docker compose logs -f

El servicio queda publicado en:

- http://IP_DEL_VPS:2934

Comandos utiles:

- Bajar servicio: docker compose down
- Reiniciar: docker compose restart

## Sincronizacion en Neon (opcional)

El sistema utiliza siempre SQLite para operar rapido en lectura/escritura local.

Si configura NEON_DATABASE_URL, se activa un proceso en background que:

- Toma transacciones pendientes en SQLite.
- Hace upsert en Neon en lotes para estado actual.
- Guarda historial versionado por cambio en Neon para reconstruir estado por momento.
- Respalda auditoria operativa en Neon.
- Reintenta cuando Neon esta en standby (plan gratuito) para permitir que "despierte".

Tablas remotas que mantiene:

- transacciones_backup: estado mas reciente por transaccion local.
- transacciones_backup_historial: versionado temporal (append-only) por cambio sincronizado.
- audit_logs_backup: respaldo de auditoria (login, errores, validaciones, consumos, eliminaciones, etc).

Variables recomendadas:

- NEON_DATABASE_URL: connection string de Neon Postgres.
- NEON_SYNC_ENABLED: true/false para activar o desactivar la sincronizacion.
- NEON_SYNC_INTERVAL_MS: cada cuantos ms correr un ciclo de sync (default 90000).
- NEON_SYNC_BATCH_SIZE: cantidad maxima por lote (default 100).
- NEON_SYNC_STARTUP_DELAY_MS: espera inicial al arrancar antes del primer sync (default 15000).
- NEON_BACKUP_RETENTION_DAYS: dias de retencion para historial y auditoria en Neon (default 180, 0 desactiva limpieza).
- NEON_CLEANUP_INTERVAL_MS: intervalo de limpieza de retencion en ms (default 21600000 = 6h).

Consulta de estado en un momento especifico (point-in-time):

```sql
WITH ranked AS (
  SELECT
    h.*,
    ROW_NUMBER() OVER (PARTITION BY h.local_id ORDER BY h.backup_at DESC) AS rn
  FROM transacciones_backup_historial h
  WHERE h.backup_at <= TIMESTAMPTZ '2026-06-01 18:30:00+00'
)
SELECT *
FROM ranked
WHERE rn = 1
ORDER BY local_id;
```

Ver historial de cambios de una transaccion puntual:

```sql
SELECT *
FROM transacciones_backup_historial
WHERE local_id = 123
ORDER BY backup_at DESC;
```

## Configuración de consumos

Edite src/config.js para cambiar etiquetas y tipo básico:

const CONSUMOS = {
  desayuno: { label: "Desayuno", tipoBasico: "D", monto: 6000 },
  almuerzo: { label: "Almuerzo", tipoBasico: "A", monto: 6000 },
  cena: { label: "Cena", tipoBasico: "C", monto: 6000 },
  cafe: { label: "Café", tipoBasico: "F", monto: 1000 }
};

Nota: el backend usa siempre el monto configurado por tipo de consumo.

## Endpoints internos

- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- GET /api/consumos
- POST /api/empleado/estado
- POST /api/consumo
- POST /api/transacciones/:id/eliminar (solo admin)
- GET /api/historial (solo admin)
- GET /api/historial/export (solo admin)

Nota: en GET /api/historial puede enviar eliminado=0 (activos) o eliminado=1 (sección eliminados).

Body de ejemplo para registro:

{
  "codigo": "5294",
  "consumo": "almuerzo"
}

El frontend no solicita monto. El backend usa siempre el monto configurado por tipo de consumo.

## Filtros y exportación

Panel admin permite filtrar por:

- Fecha desde
- Fecha hasta
- Código
- Tipo de consumo

Después del filtro puede exportar exactamente esos resultados en archivo .xlsx.

## Flujo HCB Básicos V2 implementado

Consulta de básico (validación):

GET /api/Basicos/V2/Empleado/{Soda}/{NumeroEmpleado}/{TipoBasico}/{Monto}

Registro de básico:

POST /api/Basicos/V2/Empleado/{Soda}/{NumeroEmpleado}

Body JSON:

{
  "TipoBasico": "A",
  "Monto": 3700,
  "NumeroTransaccion": "0000000000000529"
}

Durante la validación de empleado, el backend consulta disponibilidad por consumo y usa el campo resultado/mensaje para habilitar o deshabilitar cada botón. Si viene empleado_Nombre, se muestra en pantalla y se guarda en la transacción cuando se consume.

## Nota sobre reversa en API externa

En el manual Básicos V2 extraído se documenta reversa con verbo DELETE usando Soda y NumeroTransaccion:

/api/Basicos/V2/Empleado/{Soda}/{NumeroTransaccion}

Esta app intenta esa reversa cuando un admin elimina una transacción exitosa. Luego la marca como eliminada en SQLite para auditoría local (no se borra físicamente).

## Nota sobre HMAC y token

La función generateHmac(timestamp) en src/hcbApi.js usa este flujo:

- TimeStamp en hora Costa Rica (UTC-6), formato yyyy-MM-ddTHH:mm:ss.fffffff-06:00
- texto = TimeStamp + HCB_USUARIO + HCB_LLAVE_PRIVADA
- texto UTF-8 truncado a 72 bytes
- bcrypt con costo 6
- si el hash sale con prefijo $2a$ o $2b$, se reemplaza por $2y$

El token se solicita en /api/token con grant_type=hcbauth y se cachea internamente por ~4 minutos para evitar pedir token en cada request.

## Seguridad

- Credenciales y secretos solo en backend (.env).
- Frontend sin exposición de llaves de API.
- Uso de helmet y cors.
- Backend como único consumidor de la API externa.

## Auditoria y trazabilidad

Para control operativo completo, la app guarda auditoria en SQLite (tabla audit_logs), no en .txt.

Por que SQLite y no archivo de texto:

- Menor costo de mantenimiento con mucho volumen.
- Permite filtros por fecha, usuario, evento y nivel.
- Facil paginacion y consulta desde endpoint.
- Evita archivos gigantes y parsing manual.

Eventos auditados (entre otros):

- Inicio de sesion exitoso y fallido.
- Cierre de sesion.
- Accesos sin sesion o sin permisos.
- Validacion de codigo (valido, invalido, sin disponibilidad, error).
- Registro de consumo (exito y todos los fallos de negocio/API).
- Eliminacion de transacciones (exito y fallos).
- Consulta y exportacion de historial.
- Errores no controlados del proceso.

Cada registro incluye fecha/hora/segundo CR, usuario, rol, IP, endpoint, estado HTTP y detalle.

Endpoint para consultar auditoria (solo admin):

- GET /api/auditoria

Filtros soportados:

- desde, hasta
- level (info|warn|error)
- eventType
- username
- search o busqueda
- page, limit

Ejemplo:

GET /api/auditoria?desde=2026-06-01&hasta=2026-06-01&level=error&page=1&limit=20


##

cd /home/loshinchassportbar-biblica/htdocs/biblica.loshinchassportbar.com/biblica-apy-sys
git pull

docker compose down --remove-orphans

docker compose build --no-cache --pull

docker compose up -d --force-recreate --remove-orphans

docker image prune -f

docker builder prune -f


#
Sí. Aquí tienes las 3 consultas listas.

1. Ver el estado actual de una transacción o de todo el backup actual:

```sql
SELECT *
FROM transacciones_backup
ORDER BY local_id DESC;
```

2. Ver cómo estaba la información en un momento exacto:

```sql
WITH ranked AS (
  SELECT
    h.*,
    ROW_NUMBER() OVER (
      PARTITION BY h.local_id
      ORDER BY h.backup_at DESC
    ) AS rn
  FROM transacciones_backup_historial h
  WHERE h.backup_at <= TIMESTAMPTZ '2026-06-01 18:30:00+00'
)
SELECT *
FROM ranked
WHERE rn = 1
ORDER BY local_id;
```

3. Ver el historial completo de una transacción puntual:

```sql
SELECT *
FROM transacciones_backup_historial
WHERE local_id = 123
ORDER BY backup_at DESC;
```

Y para auditoría operativa:

```sql
SELECT *
FROM audit_logs_backup
ORDER BY created_at DESC;
```

Si quieres, te preparo ahora mismo una versión filtrada por código de empleado, por fecha o por usuario.