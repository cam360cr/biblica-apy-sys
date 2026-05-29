# hcb-basicos-app

Sistema web de caja para registrar consumos usando la API de Básicos de Hospital Clínica Bíblica, con perfiles de acceso, historial filtrable y exportación a Excel.

## Características principales

- Backend con Node.js + Express.
- Frontend vanilla (HTML, CSS y JavaScript).
- Persistencia en SQLite para historial local.
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

1. npm install
2. cp .env.example .env
3. npm start

En PowerShell puede usar:

1. Copy-Item .env.example .env

La aplicación queda en http://localhost:3000

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
PORT=3000

HCB_INTEGRATION_MODE controla el tipo de prueba:

- api: usa la API externa real.
- local: simula validación y registro en backend local, sin llamadas externas ni llaves reales.

Para pruebas locales sin credenciales, configure:

HCB_INTEGRATION_MODE=local

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
