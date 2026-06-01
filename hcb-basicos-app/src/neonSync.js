const { Pool } = require("pg");

const DEFAULT_SYNC_INTERVAL_MS = 90 * 1000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_STARTUP_DELAY_MS = 15 * 1000;

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

function getNeonSyncConfigFromEnv() {
  const databaseUrl = String(process.env.NEON_DATABASE_URL || "").trim();
  const hasDatabaseUrl = Boolean(databaseUrl);

  return {
    enabled: hasDatabaseUrl
      ? normalizeBooleanEnv(process.env.NEON_SYNC_ENABLED, true)
      : false,
    databaseUrl,
    intervalMs: parsePositiveIntEnv(process.env.NEON_SYNC_INTERVAL_MS, DEFAULT_SYNC_INTERVAL_MS),
    batchSize: parsePositiveIntEnv(process.env.NEON_SYNC_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1000),
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

function mapTransactionToUpsertParams(transaction) {
  return [
    Number(transaction.id),
    String(transaction.fecha || ""),
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
    toSafeText(transaction.eliminado_at),
    toSafeText(transaction.eliminado_por),
    toSafeText(transaction.eliminacion_detalle),
    toSafeText(transaction.respuesta_api_eliminacion),
    toSafeText(transaction.created_at),
    Number(transaction.neon_sync_attempts || 0)
  ];
}

function createNeonSyncWorker({
  getTransactionsPendingNeonSync,
  markTransactionSyncedForNeon,
  markTransactionSyncFailedForNeon,
  logger = console
} = {}) {
  const config = getNeonSyncConfigFromEnv();

  let pool = null;
  let syncIntervalId = null;
  let startupTimeoutId = null;
  let isRunning = false;
  let isStopped = false;
  let remoteSchemaReady = false;

  if (!config.enabled) {
    logger.info("[NEON] Sincronizacion deshabilitada (NEON_DATABASE_URL no configurada o NEON_SYNC_ENABLED=false).");
  }

  function getPool() {
    if (pool) {
      return pool;
    }

    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 30 * 1000,
      connectionTimeoutMillis: 15 * 1000
    });

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

    remoteSchemaReady = true;
  }

  async function upsertTransaction(transaction) {
    const params = mapTransactionToUpsertParams(transaction);
    const activePool = getPool();
    await queryWithWakeupRetry(activePool, UPSERT_REMOTE_TRANSACTION_SQL, params, 3);
  }

  async function syncBatch() {
    if (!config.enabled || isRunning || isStopped) {
      return;
    }

    isRunning = true;

    try {
      await ensureRemoteSchema();

      const pending = await getTransactionsPendingNeonSync(config.batchSize);
      if (!Array.isArray(pending) || pending.length === 0) {
        return;
      }

      for (const item of pending) {
        try {
          await upsertTransaction(item);
          await markTransactionSyncedForNeon(item.id);
        } catch (error) {
          const message = String(error?.message || "Error sincronizando a Neon").slice(0, 2000);
          await markTransactionSyncFailedForNeon({
            id: item.id,
            errorMessage: message
          });
          logger.error(`[NEON] Fallo al sincronizar transaccion local #${item.id}: ${message}`);
        }
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

    logger.info(
      `[NEON] Sincronizacion activa. Intervalo=${config.intervalMs}ms, Lote=${config.batchSize}`
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
