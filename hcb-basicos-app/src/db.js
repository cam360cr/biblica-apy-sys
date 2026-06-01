const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { COSTA_RICA_UTC_OFFSET_MINUTES, getCostaRicaTimeSnapshot } = require("./config");

const SQLITE_DB_PATH = String(process.env.SQLITE_DB_PATH || "").trim();
const DB_PATH = SQLITE_DB_PATH
  ? path.resolve(SQLITE_DB_PATH)
  : path.join(__dirname, "..", "database.sqlite");

let db;

async function initDb() {
  if (db) {
    return db;
  }

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  await db.exec("PRAGMA journal_mode = WAL;");
  await db.exec(`
    CREATE TABLE IF NOT EXISTS transacciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      eliminado_at DATETIME,
      eliminado_por TEXT,
      eliminacion_detalle TEXT,
      respuesta_api_eliminacion TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      neon_needs_sync INTEGER NOT NULL DEFAULT 1,
      neon_synced_at DATETIME,
      neon_sync_attempts INTEGER NOT NULL DEFAULT 0,
      neon_sync_error TEXT
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.exec(
    "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);"
  );
  await db.exec("CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_audit_logs_username ON audit_logs(username);");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_audit_logs_level ON audit_logs(level);");

  await ensureMissingColumns(db);

  return db;
}

async function ensureMissingColumns(database) {
  const rows = await database.all("PRAGMA table_info(transacciones)");
  const existing = new Set(rows.map((row) => String(row.name || "").toLowerCase()));

  const migrationColumns = [
    { name: "nombre_empleado", sql: "ALTER TABLE transacciones ADD COLUMN nombre_empleado TEXT" },
    {
      name: "eliminado",
      sql: "ALTER TABLE transacciones ADD COLUMN eliminado INTEGER NOT NULL DEFAULT 0"
    },
    { name: "eliminado_at", sql: "ALTER TABLE transacciones ADD COLUMN eliminado_at DATETIME" },
    { name: "eliminado_por", sql: "ALTER TABLE transacciones ADD COLUMN eliminado_por TEXT" },
    {
      name: "eliminacion_detalle",
      sql: "ALTER TABLE transacciones ADD COLUMN eliminacion_detalle TEXT"
    },
    {
      name: "respuesta_api_eliminacion",
      sql: "ALTER TABLE transacciones ADD COLUMN respuesta_api_eliminacion TEXT"
    },
    {
      name: "neon_needs_sync",
      sql: "ALTER TABLE transacciones ADD COLUMN neon_needs_sync INTEGER NOT NULL DEFAULT 1"
    },
    {
      name: "neon_synced_at",
      sql: "ALTER TABLE transacciones ADD COLUMN neon_synced_at DATETIME"
    },
    {
      name: "neon_sync_attempts",
      sql: "ALTER TABLE transacciones ADD COLUMN neon_sync_attempts INTEGER NOT NULL DEFAULT 0"
    },
    {
      name: "neon_sync_error",
      sql: "ALTER TABLE transacciones ADD COLUMN neon_sync_error TEXT"
    }
  ];

  for (const column of migrationColumns) {
    if (!existing.has(column.name)) {
      await database.exec(column.sql);
    }
  }
}

function safeSerialize(value) {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    return serialized.slice(0, 10000);
  } catch (_error) {
    return String(value).slice(0, 10000);
  }
}

function sanitizeAuditText(value, maxLength = 255) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized.slice(0, maxLength);
}

function getCostaRicaDateTimeText(date = new Date()) {
  const snapshot = getCostaRicaTimeSnapshot(date);
  return `${snapshot.date} ${snapshot.clock}`;
}

function normalizeAuditLevel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["info", "warn", "error"].includes(normalized)) {
    return normalized;
  }

  return "info";
}

function normalizeAuditFilters({ startDate, endDate, level, eventType, username, searchText }) {
  return {
    startDate: normalizeDateText(startDate),
    endDate: normalizeDateText(endDate),
    level: String(level || "")
      .trim()
      .toLowerCase(),
    eventType: String(eventType || "").trim().toLowerCase(),
    username: String(username || "")
      .trim()
      .toLowerCase(),
    searchText: String(searchText || "").trim()
  };
}

function buildAuditWhereClause(filters) {
  const where = [];
  const params = [];

  if (filters.startDate) {
    where.push("created_at >= ?");
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    where.push("created_at <= ?");
    params.push(filters.endDate);
  }

  if (filters.level && ["info", "warn", "error"].includes(filters.level)) {
    where.push("level = ?");
    params.push(filters.level);
  }

  if (filters.eventType) {
    where.push("event_type = ?");
    params.push(filters.eventType);
  }

  if (filters.username) {
    where.push("username = ?");
    params.push(filters.username);
  }

  if (filters.searchText) {
    where.push(
      "(event_type LIKE ? OR detail LIKE ? OR username LIKE ? OR codigo_empleado LIKE ? OR path LIKE ?)"
    );
    params.push(`%${filters.searchText}%`);
    params.push(`%${filters.searchText}%`);
    params.push(`%${filters.searchText}%`);
    params.push(`%${filters.searchText}%`);
    params.push(`%${filters.searchText}%`);
  }

  const sql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  return { sql, params };
}

async function saveAuditLog(entry = {}) {
  const database = await initDb();

  const fechaCr = sanitizeAuditText(entry.fecha_cr || getCostaRicaDateTimeText(new Date()), 19);
  const level = normalizeAuditLevel(entry.level);
  const eventType = sanitizeAuditText(entry.eventType, 100).toLowerCase() || "general.event";
  const success = entry.success === false ? 0 : 1;
  const username = sanitizeAuditText(entry.username, 80).toLowerCase() || null;
  const userRole = sanitizeAuditText(entry.userRole, 30).toLowerCase() || null;
  const ip = sanitizeAuditText(entry.ip, 80) || null;
  const method = sanitizeAuditText(entry.method, 10).toUpperCase() || null;
  const requestPath = sanitizeAuditText(entry.path, 180) || null;
  const statusCode = Number.isInteger(Number(entry.statusCode))
    ? Number(entry.statusCode)
    : null;
  const codigoEmpleado = sanitizeAuditText(entry.codigoEmpleado, 30) || null;
  const transactionId = Number.isInteger(Number(entry.transactionId))
    ? Number(entry.transactionId)
    : null;
  const numeroTransaccion = sanitizeAuditText(entry.numeroTransaccion, 60) || null;
  const detail = sanitizeAuditText(entry.detail, 2000) || null;
  const metadata = safeSerialize(entry.metadata);

  return database.run(
    `
      INSERT INTO audit_logs (
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
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      fechaCr,
      level,
      eventType,
      success,
      username,
      userRole,
      ip,
      method,
      requestPath,
      statusCode,
      codigoEmpleado,
      transactionId,
      numeroTransaccion,
      detail,
      metadata
    ]
  );
}

async function countAuditLogs({ startDate, endDate, level, eventType, username, searchText } = {}) {
  const database = await initDb();
  const normalizedFilters = normalizeAuditFilters({
    startDate,
    endDate,
    level,
    eventType,
    username,
    searchText
  });

  const { sql: whereSql, params } = buildAuditWhereClause(normalizedFilters);
  const row = await database.get(
    `
      SELECT COUNT(1) AS total
      FROM audit_logs
      ${whereSql}
    `,
    params
  );

  return Number(row?.total || 0);
}

async function getAuditLogs({
  startDate,
  endDate,
  level,
  eventType,
  username,
  searchText,
  offset = 0,
  limit = 50
} = {}) {
  const database = await initDb();
  const normalizedFilters = normalizeAuditFilters({
    startDate,
    endDate,
    level,
    eventType,
    username,
    searchText
  });

  const { sql: whereSql, params } = buildAuditWhereClause(normalizedFilters);
  const resolvedLimit = clampLimit(limit, 50, 5000);
  const resolvedOffset = clampOffset(offset, 0);

  params.push(resolvedLimit);
  params.push(resolvedOffset);

  return database.all(
    `
      SELECT
        id,
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
        created_at
      FROM audit_logs
      ${whereSql}
      ORDER BY id DESC
      LIMIT ?
      OFFSET ?
    `,
    params
  );
}

async function getAuditLogsPaged({
  startDate,
  endDate,
  level,
  eventType,
  username,
  searchText,
  page = 1,
  limit = 20
} = {}) {
  const resolvedLimit = clampLimit(limit, 20, 200);
  const total = await countAuditLogs({
    startDate,
    endDate,
    level,
    eventType,
    username,
    searchText
  });

  const totalPages = Math.max(1, Math.ceil(total / resolvedLimit));
  const resolvedPage = Math.min(clampPage(page, 1), totalPages);
  const offset = (resolvedPage - 1) * resolvedLimit;

  const rows = await getAuditLogs({
    startDate,
    endDate,
    level,
    eventType,
    username,
    searchText,
    limit: resolvedLimit,
    offset
  });

  return {
    rows,
    total,
    page: resolvedPage,
    limit: resolvedLimit,
    totalPages
  };
}

async function getAuditLogsAfterId({ afterId = 0, limit = 100 } = {}) {
  const database = await initDb();
  const resolvedAfterId = Number.isInteger(Number(afterId))
    ? Math.max(0, Number(afterId))
    : 0;
  const resolvedLimit = clampLimit(limit, 100, 1000);

  return database.all(
    `
      SELECT
        id,
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
        created_at
      FROM audit_logs
      WHERE id > ?
      ORDER BY id ASC
      LIMIT ?
    `,
    [resolvedAfterId, resolvedLimit]
  );
}

async function saveTransaction(transaction) {
  const database = await initDb();

  const sql = `
    INSERT INTO transacciones (
      fecha,
      nombre_empleado,
      codigo_empleado,
      tipo_consumo,
      tipo_basico,
      monto,
      soda,
      estado,
      respuesta_api,
      numero_transaccion
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  return database.run(sql, [
    transaction.fecha,
    transaction.nombre_empleado || null,
    transaction.codigo_empleado,
    transaction.tipo_consumo,
    transaction.tipo_basico,
    transaction.monto,
    transaction.soda,
    transaction.estado,
    safeSerialize(transaction.respuesta_api),
    transaction.numero_transaccion || null
  ]);
}

function clampLimit(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), max);
}

function clampPage(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(parsed));
}

function clampOffset(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.max(0, Math.floor(parsed));
}

function normalizeDateText(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
}

function normalizeEliminadoFilter(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "all") {
    return null;
  }

  if (normalized === "1" || normalized === "true" || normalized === "si") {
    return 1;
  }

  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return 0;
  }

  return fallback;
}

function normalizeEstadoFilter(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["exitoso", "fallido"].includes(normalized)) {
    return normalized;
  }

  return "";
}

function normalizeTransactionFilters({
  startDate,
  endDate,
  searchText,
  codigo,
  nombreEmpleado,
  tipoConsumo,
  estado,
  eliminado
}) {
  return {
    startDate: normalizeDateText(startDate),
    endDate: normalizeDateText(endDate),
    searchText: String(searchText || "").trim(),
    codigo: String(codigo || "").trim(),
    nombreEmpleado: String(nombreEmpleado || "").trim(),
    tipoConsumo: String(tipoConsumo || "").trim().toLowerCase(),
    estado: normalizeEstadoFilter(estado),
    eliminado: normalizeEliminadoFilter(eliminado, 0)
  };
}

function getCostaRicaDayRange(targetDate = new Date()) {
  const snapshot = getCostaRicaTimeSnapshot(targetDate);

  const startWallUtcMillis = Date.UTC(snapshot.year, snapshot.month - 1, snapshot.day, 0, 0, 0, 0);
  const endWallUtcMillis = Date.UTC(
    snapshot.year,
    snapshot.month - 1,
    snapshot.day,
    23,
    59,
    59,
    999
  );

  const offsetMillis = COSTA_RICA_UTC_OFFSET_MINUTES * 60 * 1000;
  const start = new Date(startWallUtcMillis - offsetMillis);
  const end = new Date(endWallUtcMillis - offsetMillis);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

function buildWhereClause(filters) {
  const where = [];
  const params = [];

  if (filters.startDate) {
    where.push("fecha >= ?");
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    where.push("fecha <= ?");
    params.push(filters.endDate);
  }

  if (filters.searchText) {
    where.push("(codigo_empleado LIKE ? OR nombre_empleado LIKE ?)");
    params.push(`%${filters.searchText}%`);
    params.push(`%${filters.searchText}%`);
  }

  if (filters.codigo) {
    where.push("codigo_empleado LIKE ?");
    params.push(`%${filters.codigo}%`);
  }

  if (filters.nombreEmpleado) {
    where.push("nombre_empleado LIKE ?");
    params.push(`%${filters.nombreEmpleado}%`);
  }

  if (filters.tipoConsumo) {
    where.push("tipo_consumo = ?");
    params.push(filters.tipoConsumo);
  }

  if (filters.estado) {
    where.push("estado = ?");
    params.push(filters.estado);
  }

  if (typeof filters.eliminado === "number") {
    where.push("eliminado = ?");
    params.push(filters.eliminado);
  }

  const sql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  return { sql, params };
}

async function getTransactions({
  startDate,
  endDate,
  searchText,
  codigo,
  nombreEmpleado,
  tipoConsumo,
  estado,
  eliminado = 0,
  offset = 0,
  limit = 50
} = {}) {
  const database = await initDb();

  const normalizedFilters = normalizeTransactionFilters({
    startDate,
    endDate,
    searchText,
    codigo,
    nombreEmpleado,
    tipoConsumo,
    estado,
    eliminado
  });

  const { sql: whereSql, params } = buildWhereClause(normalizedFilters);

  const resolvedLimit = clampLimit(limit, 50, 5000);
  const resolvedOffset = clampOffset(offset, 0);
  params.push(resolvedLimit);
  params.push(resolvedOffset);

  return database.all(
    `
      SELECT
        id,
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
        created_at
      FROM transacciones
      ${whereSql}
      ORDER BY id DESC
      LIMIT ?
      OFFSET ?
    `,
    params
  );
}

async function countTransactions({
  startDate,
  endDate,
  searchText,
  codigo,
  nombreEmpleado,
  tipoConsumo,
  estado,
  eliminado = 0
} = {}) {
  const database = await initDb();
  const normalizedFilters = normalizeTransactionFilters({
    startDate,
    endDate,
    searchText,
    codigo,
    nombreEmpleado,
    tipoConsumo,
    estado,
    eliminado
  });

  const { sql: whereSql, params } = buildWhereClause(normalizedFilters);
  const row = await database.get(
    `
      SELECT COUNT(1) AS total
      FROM transacciones
      ${whereSql}
    `,
    params
  );

  return Number(row?.total || 0);
}

async function getTransactionsPaged({
  startDate,
  endDate,
  searchText,
  codigo,
  nombreEmpleado,
  tipoConsumo,
  estado,
  eliminado = 0,
  page = 1,
  limit = 10
} = {}) {
  const resolvedLimit = clampLimit(limit, 10, 100);
  const total = await countTransactions({
    startDate,
    endDate,
    searchText,
    codigo,
    nombreEmpleado,
    tipoConsumo,
    estado,
    eliminado
  });

  const totalPages = Math.max(1, Math.ceil(total / resolvedLimit));
  const resolvedPage = Math.min(clampPage(page, 1), totalPages);
  const offset = (resolvedPage - 1) * resolvedLimit;

  const rows = await getTransactions({
    startDate,
    endDate,
    searchText,
    codigo,
    nombreEmpleado,
    tipoConsumo,
    estado,
    eliminado,
    limit: resolvedLimit,
    offset
  });

  return {
    rows,
    total,
    page: resolvedPage,
    limit: resolvedLimit,
    totalPages
  };
}

async function getLatestTransactions(limit = 50) {
  return getTransactions({ limit });
}

async function getTransactionById(id) {
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return null;
  }

  const database = await initDb();
  return database.get(
    `
      SELECT
        id,
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
        created_at
      FROM transacciones
      WHERE id = ?
      LIMIT 1
    `,
    [parsedId]
  );
}

async function softDeleteTransaction({ id, deletedBy, detail, apiDeletionResult }) {
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return { changes: 0 };
  }

  const database = await initDb();
  return database.run(
    `
      UPDATE transacciones
      SET
        eliminado = 1,
        eliminado_at = CURRENT_TIMESTAMP,
        eliminado_por = ?,
        eliminacion_detalle = ?,
        respuesta_api_eliminacion = ?,
        neon_needs_sync = 1,
        neon_synced_at = NULL,
        neon_sync_attempts = 0,
        neon_sync_error = NULL
      WHERE id = ?
        AND eliminado = 0
    `,
    [
      String(deletedBy || "").trim() || null,
      String(detail || "").trim() || null,
      safeSerialize(apiDeletionResult),
      parsedId
    ]
  );
}

async function getSuccessfulConsumptionsForDate({ codigo, targetDate = new Date() } = {}) {
  const normalizedCodigo = String(codigo || "").trim();
  if (!normalizedCodigo) {
    return [];
  }

  const { startIso, endIso } = getCostaRicaDayRange(targetDate);
  const database = await initDb();

  const rows = await database.all(
    `
      SELECT DISTINCT tipo_consumo
      FROM transacciones
      WHERE codigo_empleado = ?
        AND estado = 'exitoso'
        AND eliminado = 0
        AND fecha >= ?
        AND fecha <= ?
    `,
    [normalizedCodigo, startIso, endIso]
  );

  return rows
    .map((row) => String(row.tipo_consumo || "").trim().toLowerCase())
    .filter(Boolean);
}

async function getTransactionsPendingNeonSync(limit = 100) {
  const database = await initDb();
  const resolvedLimit = clampLimit(limit, 100, 1000);

  return database.all(
    `
      SELECT
        id,
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
        neon_sync_attempts
      FROM transacciones
      WHERE neon_needs_sync = 1
      ORDER BY id ASC
      LIMIT ?
    `,
    [resolvedLimit]
  );
}

async function markTransactionSyncedForNeon(id) {
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return { changes: 0 };
  }

  const database = await initDb();
  return database.run(
    `
      UPDATE transacciones
      SET
        neon_needs_sync = 0,
        neon_synced_at = CURRENT_TIMESTAMP,
        neon_sync_error = NULL
      WHERE id = ?
    `,
    [parsedId]
  );
}

async function markTransactionSyncFailedForNeon({ id, errorMessage }) {
  const parsedId = Number(id);
  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return { changes: 0 };
  }

  const database = await initDb();
  const safeMessage = String(errorMessage || "Error desconocido al sincronizar con Neon")
    .trim()
    .slice(0, 2000);

  return database.run(
    `
      UPDATE transacciones
      SET
        neon_needs_sync = 1,
        neon_sync_attempts = COALESCE(neon_sync_attempts, 0) + 1,
        neon_sync_error = ?
      WHERE id = ?
    `,
    [safeMessage || "Error desconocido al sincronizar con Neon", parsedId]
  );
}

module.exports = {
  DB_PATH,
  initDb,
  saveTransaction,
  getLatestTransactions,
  getTransactions,
  countTransactions,
  getTransactionsPaged,
  getTransactionById,
  softDeleteTransaction,
  getSuccessfulConsumptionsForDate,
  getTransactionsPendingNeonSync,
  markTransactionSyncedForNeon,
  markTransactionSyncFailedForNeon,
  saveAuditLog,
  getAuditLogs,
  countAuditLogs,
  getAuditLogsPaged,
  getAuditLogsAfterId
};
