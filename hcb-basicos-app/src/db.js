const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { COSTA_RICA_UTC_OFFSET_MINUTES, getCostaRicaTimeSnapshot } = require("./config");

const DB_PATH = path.join(__dirname, "..", "database.sqlite");

let db;

async function initDb() {
  if (db) {
    return db;
  }

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

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
        respuesta_api_eliminacion = ?
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
  getSuccessfulConsumptionsForDate
};
