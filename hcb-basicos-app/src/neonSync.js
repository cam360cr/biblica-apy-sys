const { Pool } = require("pg");

const DEFAULT_SYNC_INTERVAL_MS = 90 * 1000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_STARTUP_DELAY_MS = 15 * 1000;
const DEFAULT_BACKUP_RETENTION_DAYS = 180;
const DEFAULT_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const COSTA_RICA_UTC_OFFSET_MINUTES = -6 * 60;

const CREATE_REMOTE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS transacciones_backup (
    local_id INTEGER PRIMARY KEY,
    fecha TEXT NOT NULL,
    nombre_empleado TEXT,
    codigo_empleado TEXT NOT NULL,
    tipo_consumo TEXT NOT NULL,
    tipo_basico TEXT NOT NULL,
    monto INTEGER NOT NULL,
    soda TEXT NOT NULL,
    estado TEXT NOT NULL,
    respuesta_api TEXT,
    numero_transaccion TEXT,
    eliminado INTEGER NOT NULL DEFAULT 0,
    eliminado_at TEXT,
    eliminado_por TEXT,
    eliminacion_detalle TEXT,
    respuesta_api_eliminacion TEXT,
    created_at TEXT,
    local_sync_attempts INTEGER NOT NULL DEFAULT 0,
    sync_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const CREATE_REMOTE_HISTORY_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS transacciones_backup_historial (
    id BIGSERIAL PRIMARY KEY,
    local_id INTEGER NOT NULL,
    backup_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha TEXT NOT NULL,
    nombre_empleado TEXT,
    codigo_empleado TEXT NOT NULL,
    tipo_consumo TEXT NOT NULL,
    tipo_basico TEXT NOT NULL,
    monto INTEGER NOT NULL,
    soda TEXT NOT NULL,
    estado TEXT NOT NULL,
    respuesta_api TEXT,
    numero_transaccion TEXT,
    eliminado INTEGER NOT NULL DEFAULT 0,
    eliminado_at TEXT,
    eliminado_por TEXT,
    eliminacion_detalle TEXT,
    respuesta_api_eliminacion TEXT,
    created_at TEXT,
    local_sync_attempts INTEGER NOT NULL DEFAULT 0
  )
`;

const CREATE_REMOTE_HISTORY_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_transacciones_backup_historial_local_id_backup_at
  ON transacciones_backup_historial(local_id, backup_at DESC)
`;

const CREATE_REMOTE_AUDIT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS audit_logs_backup (
    local_id INTEGER PRIMARY KEY,
    fecha_cr TEXT NOT NULL,
    level TEXT NOT NULL,
    event_type TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 1,
    username TEXT,
    user_role TEXT,
    ip TEXT,
    method TEXT,
    path TEXT,
    status_code INTEGER,
    codigo_empleado TEXT,
    transaction_id INTEGER,
    numero_transaccion TEXT,
    detail TEXT,
    metadata TEXT,
    created_at TEXT,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const CREATE_REMOTE_AUDIT_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_audit_logs_backup_created_at
  ON audit_logs_backup(created_at DESC)
`;

const UPSERT_REMOTE_TRANSACTION_SQL = `
  INSERT INTO transacciones_backup (
    local_id,
    fecha,
    nombre_empleado,
    codigo_empleado,
    tipo_consumo,
    tipo_basico,
    monto,
    soda,
    estado,
    respuesta_api,
    numero_transaccion,
    eliminado,
    eliminado_at,
    eliminado_por,
    eliminacion_detalle,
    respuesta_api_eliminacion,
    created_at,
    local_sync_attempts,
    sync_updated_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15, $16, $17, $18, NOW()
  )
  ON CONFLICT (local_id)
  DO UPDATE SET
    fecha = EXCLUDED.fecha,
    nombre_empleado = EXCLUDED.nombre_empleado,
    codigo_empleado = EXCLUDED.codigo_empleado,
    tipo_consumo = EXCLUDED.tipo_consumo,
    tipo_basico = EXCLUDED.tipo_basico,
    monto = EXCLUDED.monto,
    soda = EXCLUDED.soda,
    estado = EXCLUDED.estado,
    respuesta_api = EXCLUDED.respuesta_api,
    numero_transaccion = EXCLUDED.numero_transaccion,
    eliminado = EXCLUDED.eliminado,
    eliminado_at = EXCLUDED.eliminado_at,
    eliminado_por = EXCLUDED.eliminado_por,
    eliminacion_detalle = EXCLUDED.eliminacion_detalle,
    respuesta_api_eliminacion = EXCLUDED.respuesta_api_eliminacion,
    created_at = EXCLUDED.created_at,
    local_sync_attempts = EXCLUDED.local_sync_attempts,
    sync_updated_at = NOW()
`;

const INSERT_REMOTE_TRANSACTION_HISTORY_SQL = `
  INSERT INTO transacciones_backup_historial (
    local_id,
    fecha,
    nombre_empleado,
    codigo_empleado,
    tipo_consumo,
    tipo_basico,
    monto,
    soda,
    estado,
    respuesta_api,
    numero_transaccion,
    eliminado,
    eliminado_at,
    eliminado_por,
    eliminacion_detalle,
    respuesta_api_eliminacion,
    created_at,
    local_sync_attempts
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15, $16, $17, $18
  )
`;

const UPSERT_REMOTE_AUDIT_LOG_SQL = `
  INSERT INTO audit_logs_backup (
    local_id,
    fecha_cr,
    level,
    event_type,
    success,
    username,
    user_role,
    ip,
    method,
    path,
    status_code,
    codigo_empleado,
    transaction_id,
    numero_transaccion,
    detail,
    metadata,
    created_at,
    synced_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15, $16, $17, NOW()
  )
  ON CONFLICT (local_id)
  DO UPDATE SET
    fecha_cr = EXCLUDED.fecha_cr,
    level = EXCLUDED.level,
    event_type = EXCLUDED.event_type,
    success = EXCLUDED.success,
    username = EXCLUDED.username,
    user_role = EXCLUDED.user_role,
    ip = EXCLUDED.ip,
    method = EXCLUDED.method,
    path = EXCLUDED.path,
    status_code = EXCLUDED.status_code,
    codigo_empleado = EXCLUDED.codigo_empleado,
    transaction_id = EXCLUDED.transaction_id,
    numero_transaccion = EXCLUDED.numero_transaccion,
    detail = EXCLUDED.detail,
    metadata = EXCLUDED.metadata,
    created_at = EXCLUDED.created_at,
    synced_at = NOW()
`;

const SELECT_REMOTE_MAX_AUDIT_LOCAL_ID_SQL = `
  SELECT COALESCE(MAX(local_id), 0) AS max_local_id
  FROM audit_logs_backup
`;

const CLEANUP_REMOTE_TRANSACTION_HISTORY_SQL = `
  DELETE FROM transacciones_backup_historial
  WHERE backup_at < NOW() - make_interval(days => $1::int)
`;

const CLEANUP_REMOTE_AUDIT_LOGS_SQL = `
  DELETE FROM audit_logs_backup
  WHERE synced_at < NOW() - make_interval(days => $1::int)
`;

function normalizeBooleanEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "si"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parsePositiveIntEnv(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function parseNonNegativeIntEnv(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function normalizeNeonConnectionString(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return {
      connectionString: "",
      enableChannelBinding: false
    };
  }

  try {
    const parsed = new URL(raw);
    const channelBinding = String(parsed.searchParams.get("channel_binding") || "")
      .trim()
      .toLowerCase();

    if (channelBinding) {
      parsed.searchParams.delete("channel_binding");
    }

    return {
      connectionString: parsed.toString(),
      enableChannelBinding: channelBinding === "require" || channelBinding === "prefer"
    };
  } catch (_error) {
    return {
      connectionString: raw,
      enableChannelBinding: false
    };
  }
}

function getNeonSyncConfigFromEnv() {
  const normalizedConnection = normalizeNeonConnectionString(process.env.NEON_DATABASE_URL);
  const databaseUrl = normalizedConnection.connectionString;
  const hasDatabaseUrl = Boolean(databaseUrl);

  return {
    enabled: hasDatabaseUrl
      ? normalizeBooleanEnv(process.env.NEON_SYNC_ENABLED, true)
      : false,
    databaseUrl,
    enableChannelBinding: normalizedConnection.enableChannelBinding,
    intervalMs: parsePositiveIntEnv(process.env.NEON_SYNC_INTERVAL_MS, DEFAULT_SYNC_INTERVAL_MS),
    batchSize: parsePositiveIntEnv(process.env.NEON_SYNC_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1000),
    backupRetentionDays: parseNonNegativeIntEnv(
      process.env.NEON_BACKUP_RETENTION_DAYS,
      DEFAULT_BACKUP_RETENTION_DAYS,
      3650
    ),
    cleanupIntervalMs: parsePositiveIntEnv(
      process.env.NEON_CLEANUP_INTERVAL_MS,
      DEFAULT_CLEANUP_INTERVAL_MS,
      7 * 24 * 60 * 60 * 1000
    ),
    startupDelayMs: parsePositiveIntEnv(
      process.env.NEON_SYNC_STARTUP_DELAY_MS,
      DEFAULT_STARTUP_DELAY_MS,
      10 * 60 * 1000
    )
  };
}

function toRetryableErrorCode(error) {
  return String(error?.code || "").trim().toUpperCase();
}

function isRetryableNeonError(error) {
  const code = toRetryableErrorCode(error);
  const message = String(error?.message || "").trim().toLowerCase();

  if (["57P01", "57P03", "53300", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT"].includes(code)) {
    return true;
  }

  return (
    message.includes("timeout") ||
    message.includes("terminating connection") ||
    message.includes("connection refused") ||
    message.includes("could not connect") ||
    message.includes("the database system is starting up")
  );
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function queryWithWakeupRetry(pool, sql, params = [], maxAttempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await pool.query(sql, params);
    } catch (error) {
      lastError = error;
      if (!isRetryableNeonError(error) || attempt === maxAttempts) {
        throw error;
      }

      await sleep(attempt * 2000);
    }
  }

  throw lastError || new Error("No se pudo ejecutar consulta en Neon.");
}

function toSafeText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text === "" ? null : text;
}

function parseDateValue(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const sqliteUtcPattern = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d{1,3})?$/;
  const sqliteMatch = sqliteUtcPattern.exec(raw);
  if (sqliteMatch) {
    const sqliteIso = `${sqliteMatch[1]}T${sqliteMatch[2]}${sqliteMatch[3] || ""}Z`;
    const parsedSqliteDate = new Date(sqliteIso);
    if (!Number.isNaN(parsedSqliteDate.getTime())) {
      return parsedSqliteDate;
    }
  }

  const isoWithoutZonePattern = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)$/;
  const isoWithoutZoneMatch = isoWithoutZonePattern.exec(raw);
  if (isoWithoutZoneMatch) {
    const parsedIsoNoZoneDate = new Date(`${isoWithoutZoneMatch[1]}T${isoWithoutZoneMatch[2]}Z`);
    if (!Number.isNaN(parsedIsoNoZoneDate.getTime())) {
      return parsedIsoNoZoneDate;
    }
  }

  const parsedDate = new Date(raw);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

function padTwo(value) {
  return String(value).padStart(2, "0");
}

function toCostaRicaDateTimeText(value) {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return toSafeText(value);
  }

  const costaRicaDate = new Date(parsed.getTime() + COSTA_RICA_UTC_OFFSET_MINUTES * 60 * 1000);
  const year = costaRicaDate.getUTCFullYear();
  const month = padTwo(costaRicaDate.getUTCMonth() + 1);
  const day = padTwo(costaRicaDate.getUTCDate());
  const hour = padTwo(costaRicaDate.getUTCHours());
  const minute = padTwo(costaRicaDate.getUTCMinutes());
  const second = padTwo(costaRicaDate.getUTCSeconds());

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function mapTransactionToUpsertParams(transaction) {
  return [
    Number(transaction.id),
    toCostaRicaDateTimeText(transaction.fecha) || "",
    toSafeText(transaction.nombre_empleado),
    String(transaction.codigo_empleado || ""),
    String(transaction.tipo_consumo || ""),
    String(transaction.tipo_basico || ""),
    Number(transaction.monto || 0),
    String(transaction.soda || ""),
    String(transaction.estado || ""),
    toSafeText(transaction.respuesta_api),
    toSafeText(transaction.numero_transaccion),
    Number(transaction.eliminado || 0),
    toCostaRicaDateTimeText(transaction.eliminado_at),
    toSafeText(transaction.eliminado_por),
    toSafeText(transaction.eliminacion_detalle),
    toSafeText(transaction.respuesta_api_eliminacion),
    toCostaRicaDateTimeText(transaction.created_at),
    Number(transaction.neon_sync_attempts || 0)
  ];
}

function mapAuditLogToUpsertParams(auditLog) {
  return [
    Number(auditLog.id),
    String(auditLog.fecha_cr || ""),
    String(auditLog.level || "info"),
    String(auditLog.event_type || "general.event"),
    Number(auditLog.success || 0),
    toSafeText(auditLog.username),
    toSafeText(auditLog.user_role),
    toSafeText(auditLog.ip),
    toSafeText(auditLog.method),
    toSafeText(auditLog.path),
    Number.isInteger(Number(auditLog.status_code)) ? Number(auditLog.status_code) : null,
    toSafeText(auditLog.codigo_empleado),
    Number.isInteger(Number(auditLog.transaction_id)) ? Number(auditLog.transaction_id) : null,
    toSafeText(auditLog.numero_transaccion),
    toSafeText(auditLog.detail),
    toSafeText(auditLog.metadata),
    toCostaRicaDateTimeText(auditLog.created_at)
  ];
}

function createNeonSyncWorker({
  getTransactionsPendingNeonSync,
  markTransactionSyncedForNeon,
  markTransactionSyncFailedForNeon,
  getAuditLogsAfterId,
  logger = console
} = {}) {
  const config = getNeonSyncConfigFromEnv();

  const hasAuditSync = typeof getAuditLogsAfterId === "function";

  let pool = null;
  let syncIntervalId = null;
  let startupTimeoutId = null;
  let isRunning = false;
  let isStopped = false;
  let remoteSchemaReady = false;
  let lastCleanupAtMs = 0;

  if (!config.enabled) {
    logger.info("[NEON] Sincronizacion deshabilitada (NEON_DATABASE_URL no configurada o NEON_SYNC_ENABLED=false).");
  } else if (!hasAuditSync) {
    logger.info("[NEON] Respaldo de auditoria deshabilitado (lector incremental no disponible).");
  }

  function getPool() {
    if (pool) {
      return pool;
    }

    const poolConfig = {
      connectionString: config.databaseUrl,
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 30 * 1000,
      connectionTimeoutMillis: 15 * 1000
    };

    if (config.enableChannelBinding) {
      poolConfig.enableChannelBinding = true;
    }

    pool = new Pool(poolConfig);

    pool.on("error", (error) => {
      logger.error("[NEON] Error de conexion en pool:", error.message);
    });

    return pool;
  }

  async function ensureRemoteSchema() {
    if (remoteSchemaReady) {
      return;
    }

    const activePool = getPool();

    // Neon en plan gratuito puede estar en standby; este ping ayuda a "despertar" la DB.
    await queryWithWakeupRetry(activePool, "SELECT 1", [], 3);
    await queryWithWakeupRetry(activePool, CREATE_REMOTE_TABLE_SQL, [], 3);
    await queryWithWakeupRetry(activePool, CREATE_REMOTE_HISTORY_TABLE_SQL, [], 3);
    await queryWithWakeupRetry(activePool, CREATE_REMOTE_HISTORY_INDEX_SQL, [], 3);
    await queryWithWakeupRetry(activePool, CREATE_REMOTE_AUDIT_TABLE_SQL, [], 3);
    await queryWithWakeupRetry(activePool, CREATE_REMOTE_AUDIT_INDEX_SQL, [], 3);

    remoteSchemaReady = true;
  }

  async function upsertTransaction(transaction) {
    const params = mapTransactionToUpsertParams(transaction);
    const activePool = getPool();
    await queryWithWakeupRetry(activePool, UPSERT_REMOTE_TRANSACTION_SQL, params, 3);
    await queryWithWakeupRetry(activePool, INSERT_REMOTE_TRANSACTION_HISTORY_SQL, params, 3);
  }

  async function upsertAuditLog(auditLog) {
    const params = mapAuditLogToUpsertParams(auditLog);
    const activePool = getPool();
    await queryWithWakeupRetry(activePool, UPSERT_REMOTE_AUDIT_LOG_SQL, params, 3);
  }

  async function getRemoteMaxAuditLocalId() {
    const activePool = getPool();
    const result = await queryWithWakeupRetry(activePool, SELECT_REMOTE_MAX_AUDIT_LOCAL_ID_SQL, [], 3);

    const value = Number(result?.rows?.[0]?.max_local_id || 0);
    if (!Number.isInteger(value) || value < 0) {
      return 0;
    }

    return value;
  }

  async function syncTransactionsBatch() {
    const pending = await getTransactionsPendingNeonSync(config.batchSize);
    if (!Array.isArray(pending) || pending.length === 0) {
      return {
        processed: 0,
        synced: 0,
        failed: 0
      };
    }

    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        await upsertTransaction(item);
        await markTransactionSyncedForNeon(item.id);
        synced += 1;
      } catch (error) {
        const message = String(error?.message || "Error sincronizando a Neon").slice(0, 2000);
        await markTransactionSyncFailedForNeon({
          id: item.id,
          errorMessage: message
        });
        failed += 1;
        logger.error(`[NEON] Fallo al sincronizar transaccion local #${item.id}: ${message}`);
      }
    }

    return {
      processed: pending.length,
      synced,
      failed
    };
  }

  async function syncAuditLogsBatch() {
    if (!hasAuditSync) {
      return {
        processed: 0,
        synced: 0,
        failed: 0,
        skipped: true
      };
    }

    const maxRemoteLocalId = await getRemoteMaxAuditLocalId();
    const pendingAuditLogs = await getAuditLogsAfterId({
      afterId: maxRemoteLocalId,
      limit: config.batchSize
    });

    if (!Array.isArray(pendingAuditLogs) || pendingAuditLogs.length === 0) {
      return {
        processed: 0,
        synced: 0,
        failed: 0,
        skipped: false
      };
    }

    let synced = 0;
    let failed = 0;

    for (const item of pendingAuditLogs) {
      try {
        await upsertAuditLog(item);
        synced += 1;
      } catch (error) {
        failed += 1;
        logger.error(
          `[NEON] Fallo al respaldar auditoria local #${item.id}: ${String(error?.message || "Error desconocido")}`
        );
      }
    }

    return {
      processed: pendingAuditLogs.length,
      synced,
      failed,
      skipped: false
    };
  }

  async function cleanupOldBackupsIfNeeded(force = false) {
    if (config.backupRetentionDays <= 0) {
      return;
    }

    const now = Date.now();
    if (!force && now - lastCleanupAtMs < config.cleanupIntervalMs) {
      return;
    }

    const activePool = getPool();
    await queryWithWakeupRetry(
      activePool,
      CLEANUP_REMOTE_TRANSACTION_HISTORY_SQL,
      [config.backupRetentionDays],
      3
    );
    await queryWithWakeupRetry(activePool, CLEANUP_REMOTE_AUDIT_LOGS_SQL, [config.backupRetentionDays], 3);

    lastCleanupAtMs = now;
  }

  async function syncBatch() {
    if (!config.enabled || isRunning || isStopped) {
      return;
    }

    isRunning = true;

    try {
      await ensureRemoteSchema();

      const transactionResult = await syncTransactionsBatch();
      const auditResult = await syncAuditLogsBatch();

      await cleanupOldBackupsIfNeeded(false);

      if (
        transactionResult.processed > 0 ||
        auditResult.processed > 0 ||
        transactionResult.failed > 0 ||
        auditResult.failed > 0
      ) {
        logger.info(
          `[NEON] Resumen sync -> transacciones: ${transactionResult.synced}/${transactionResult.processed} ok, ${transactionResult.failed} fallos; auditoria: ${auditResult.synced}/${auditResult.processed} ok, ${auditResult.failed} fallos.`
        );
      }
    } catch (error) {
      logger.error("[NEON] Fallo en ciclo de sincronizacion:", error.message);
    } finally {
      isRunning = false;
    }
  }

  async function start() {
    if (!config.enabled) {
      return;
    }

    isStopped = false;

    if (syncIntervalId) {
      clearInterval(syncIntervalId);
    }

    syncIntervalId = setInterval(() => {
      void syncBatch();
    }, config.intervalMs);

    if (startupTimeoutId) {
      clearTimeout(startupTimeoutId);
    }

    startupTimeoutId = setTimeout(() => {
      if (!isStopped) {
        void syncBatch();
      }
    }, config.startupDelayMs);

    lastCleanupAtMs = 0;

    logger.info(
      `[NEON] Sincronizacion activa. Intervalo=${config.intervalMs}ms, Lote=${config.batchSize}, Retencion=${config.backupRetentionDays} dias`
    );
  }

  async function stop() {
    isStopped = true;

    if (startupTimeoutId) {
      clearTimeout(startupTimeoutId);
      startupTimeoutId = null;
    }

    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }

    if (pool) {
      const currentPool = pool;
      pool = null;
      await currentPool.end().catch(() => undefined);
    }
  }

  return {
    enabled: config.enabled,
    config,
    start,
    stop,
    syncNow: syncBatch
  };
}

module.exports = {
  createNeonSyncWorker
};
