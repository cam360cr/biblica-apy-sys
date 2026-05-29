require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const XLSX = require("xlsx");

const {
  CONSUMOS,
  CONSUMO_HORARIOS_CR,
  COSTA_RICA_UTC_OFFSET_MINUTES,
  APP_CONFIG,
  getConsumosPublicos,
  getCostaRicaTimeSnapshot,
  getCurrentConsumoSlot,
  isConsumoInSchedule
} = require("./src/config");
const {
  initDb,
  saveTransaction,
  getTransactions,
  getTransactionsPaged,
  getTransactionById,
  softDeleteTransaction,
  getSuccessfulConsumptionsForDate
} = require("./src/db");
const {
  registrarConsumoEnApi,
  consultarEstadoEmpleadoEnApi,
  reversarConsumoEnApi
} = require("./src/hcbApi");
const {
  ROLES,
  authenticateUser,
  configureSessionMiddleware,
  ensureAuthenticated,
  ensureRole
} = require("./src/auth");

const app = express();
const PORT = Number(process.env.PORT) || 2934;

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "same-site" },
    contentSecurityPolicy: {
      directives: {
        "upgrade-insecure-requests": null
      }
    }
  })
);
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
configureSessionMiddleware(app);
app.use(express.static(path.join(__dirname, "public")));

const COSTA_RICA_TIME_ZONE = "America/Costa_Rica";
const COSTA_RICA_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: COSTA_RICA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

function sanitizeCodigo(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const cleaned = String(value).trim();
  if (!cleaned) {
    return "";
  }

  if (cleaned.length > 30) {
    return "";
  }

  if (!/^[0-9A-Za-z-]+$/.test(cleaned)) {
    return "";
  }

  return cleaned;
}

function normalizeConsumo(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function normalizeEstadoFilter(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  if (["exitoso", "fallido"].includes(normalized)) {
    return normalized;
  }

  return "";
}

function sanitizeMonto(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) {
    return null;
  }

  const monto = Number.parseInt(raw, 10);
  if (!Number.isFinite(monto) || monto <= 0 || monto > 1000000) {
    return null;
  }

  return monto;
}

function sanitizeFilterText(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!normalized) {
    return "";
  }

  return normalized.slice(0, 80);
}

function parseStoredDate(value) {
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
    const parsedIsoNoZoneDate = new Date(
      `${isoWithoutZoneMatch[1]}T${isoWithoutZoneMatch[2]}Z`
    );
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

function formatDateTimeCostaRica(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const parsedDate = parseStoredDate(raw);
  if (!parsedDate) {
    return raw;
  }

  const parts = COSTA_RICA_DATE_TIME_FORMATTER.formatToParts(parsedDate);
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (
    !partMap.year ||
    !partMap.month ||
    !partMap.day ||
    !partMap.hour ||
    !partMap.minute ||
    !partMap.second
  ) {
    return raw;
  }

  return `${partMap.year}-${partMap.month}-${partMap.day} ${partMap.hour}:${partMap.minute}:${partMap.second}`;
}

function parseCostaRicaDateOnlyToIso(value, endOfDay = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) {
    return "";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return "";
  }

  const validator = new Date(Date.UTC(year, month - 1, day));
  if (
    validator.getUTCFullYear() !== year ||
    validator.getUTCMonth() !== month - 1 ||
    validator.getUTCDate() !== day
  ) {
    return "";
  }

  const wallUtcMillis = Date.UTC(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
  const utcMillis = wallUtcMillis - COSTA_RICA_UTC_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMillis).toISOString();
}

function parseCostaRicaDateTimeToIso(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
      String(value || "").trim()
    );
  if (!match) {
    return "";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || 0);
  const millisecond = Number((match[7] || "").padEnd(3, "0") || 0);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second) ||
    !Number.isInteger(millisecond)
  ) {
    return "";
  }

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59 ||
    millisecond < 0 ||
    millisecond > 999
  ) {
    return "";
  }

  const validator = new Date(Date.UTC(year, month - 1, day));
  if (
    validator.getUTCFullYear() !== year ||
    validator.getUTCMonth() !== month - 1 ||
    validator.getUTCDate() !== day
  ) {
    return "";
  }

  const wallUtcMillis = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const utcMillis = wallUtcMillis - COSTA_RICA_UTC_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMillis).toISOString();
}

function parseDateFilter(value, endOfDay = false) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyPattern.test(raw)) {
    return parseCostaRicaDateOnlyToIso(raw, endOfDay);
  }

  const dateTimeWithoutZonePattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;
  if (dateTimeWithoutZonePattern.test(raw)) {
    return parseCostaRicaDateTimeToIso(raw);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString();
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeHistoryLimit(value) {
  const parsed = parsePositiveInt(value, 10);
  const allowed = [10, 20, 50, 100];
  return allowed.includes(parsed) ? parsed : 10;
}

function buildHistorialFilters(query) {
  return {
    startDate: parseDateFilter(query.desde || query.startDate, false),
    endDate: parseDateFilter(query.hasta || query.endDate, true),
    searchText: sanitizeFilterText(query.busqueda || query.search),
    codigo: sanitizeFilterText(query.codigo),
    nombreEmpleado: sanitizeFilterText(query.nombre || query.nombreEmpleado),
    tipoConsumo: normalizeConsumo(query.consumo || query.tipoConsumo),
    estado: normalizeEstadoFilter(query.estado),
    eliminado: query.eliminado,
    page: parsePositiveInt(query.page, 1),
    limit: normalizeHistoryLimit(query.limit)
  };
}

function toExcelRows(transactions) {
  return transactions.map((item) => ({
    Fecha: formatDateTimeCostaRica(item.fecha || item.created_at || ""),
    NombreEmpleado: item.nombre_empleado || "",
    Codigo: item.codigo_empleado || "",
    Consumo: item.tipo_consumo || "",
    TipoBasico: item.tipo_basico || "",
    Monto: item.monto || 0,
    Soda: item.soda || "",
    Estado: item.estado || "",
    Eliminado: Number(item.eliminado) === 1 ? "Si" : "No",
    EliminadoEn: formatDateTimeCostaRica(item.eliminado_at || ""),
    EliminadoPor: item.eliminado_por || "",
    MotivoEliminacion: item.eliminacion_detalle || "",
    NumeroTransaccion: item.numero_transaccion || "",
    CreadoEn: formatDateTimeCostaRica(item.created_at || "")
  }));
}

function getAuthUserResponse(user) {
  return {
    username: user.username,
    role: user.role,
    displayName: user.displayName
  };
}

function getErrorMessage(error) {
  if (error?.details?.error_description) {
    return error.details.error_description;
  }

  if (error?.details?.message) {
    return error.details.message;
  }

  if (error?.message) {
    return error.message;
  }

  return "Error desconocido";
}

function parseTransactionId(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getConsumoHorarioLabel(consumoKey) {
  const horario = CONSUMO_HORARIOS_CR[String(consumoKey || "").trim().toLowerCase()];
  if (!horario) {
    return "Horario no definido";
  }

  return `${horario.start}-${horario.end} CR`;
}

function buildConsumoAvailability({
  consumosConsumidosHoy,
  blockedReason = "",
  remoteDisponibilidad = {},
  now = new Date()
}) {
  const consumedSet = new Set(
    (consumosConsumidosHoy || []).map((item) => String(item || "").trim().toLowerCase())
  );

  const requireApiAvailability = APP_CONFIG.integrationMode === "api";

  return Object.entries(CONSUMOS).map(([key, config]) => {
    const consumidoHoy = consumedSet.has(key);
    const enHorario = isConsumoInSchedule(key, now);
    const horario = getConsumoHorarioLabel(key);
    const disponibilidadApi = remoteDisponibilidad?.[key] || null;

    let disponible = true;
    let motivo = "Disponible";

    if (blockedReason) {
      disponible = false;
      motivo = "No disponible";
    } else if (!enHorario) {
      disponible = false;
      motivo = `Fuera de horario (${horario})`;
    } else if (consumidoHoy) {
      disponible = false;
      motivo = "Ya consumido hoy";
    } else if (disponibilidadApi?.puedeConsumirEnApi === false) {
      disponible = false;
      motivo = "No disponible";
    } else if (requireApiAvailability && disponibilidadApi?.puedeConsumirEnApi === null) {
      disponible = false;
      motivo = "No disponible";
    }

    return {
      key,
      label: config.label,
      tipoBasico: config.tipoBasico,
      montoDefault: config.monto,
      consumidoHoy,
      enHorario,
      disponible,
      horario,
      apiResultado: disponibilidadApi?.resultado ?? null,
      motivo
    };
  });
}

function buildEstadoEmpleadoMessage({
  registrado,
  activo,
  verificadoRemotamente,
  remoteMessage,
  consumos
}) {
  if (registrado === false) {
    return remoteMessage || "El codigo no aparece registrado en la API externa.";
  }

  if (activo === false) {
    return remoteMessage || "El empleado existe, pero esta marcado como inactivo en la API externa.";
  }

  const consumosList = Array.isArray(consumos) ? consumos : [];
  const consumosDisponibles = consumosList.filter((item) => item?.disponible);

  if (consumosDisponibles.length > 0) {
    const labels = consumosDisponibles.map((item) => item.label).filter(Boolean);
    const listado = labels.join(", ");

    return `Consumos disponibles: ${listado}.`;
  }

  if (remoteMessage) {
    return remoteMessage;
  }

  const motivosUnicos = Array.from(
    new Set(
      consumosList
        .map((item) => String(item?.motivo || "").trim())
        .filter(Boolean)
    )
  );

  if (motivosUnicos.length === 1) {
    return `No hay consumos disponibles. ${motivosUnicos[0]}.`;
  }

  if (motivosUnicos.length > 1) {
    return `No hay consumos disponibles. ${motivosUnicos.slice(0, 2).join(". ")}.`;
  }

  return "No hay consumos disponibles para este empleado en este momento.";
}

async function persistTransactionSafely(transaction) {
  try {
    await saveTransaction(transaction);
  } catch (dbError) {
    console.error("No se pudo guardar transaccion en SQLite:", dbError.message);
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "hcb-basicos-app" });
});

app.post("/api/auth/login", (req, res) => {
  const username = req.body?.username;
  const password = req.body?.password;
  const user = authenticateUser(username, password);

  if (!user) {
    return res.status(401).json({
      ok: false,
      message: "Credenciales invalidas"
    });
  }

  req.session.user = user;
  return res.json({
    ok: true,
    data: getAuthUserResponse(user)
  });
});

app.post("/api/auth/logout", ensureAuthenticated, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("hcb.sid");
    return res.json({
      ok: true,
      message: "Sesion finalizada"
    });
  });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({
      ok: false,
      message: "Sesion no iniciada"
    });
  }

  return res.json({
    ok: true,
    data: getAuthUserResponse(req.session.user)
  });
});

app.get("/api/consumos", ensureAuthenticated, (_req, res) => {
  res.json({
    ok: true,
    data: getConsumosPublicos()
  });
});

app.post("/api/empleado/estado", ensureRole([ROLES.ADMIN, ROLES.SELLER]), async (req, res) => {
  const codigo = sanitizeCodigo(req.body?.codigo);

  if (!codigo) {
    return res.status(400).json({
      ok: false,
      message: "Debe ingresar un codigo valido."
    });
  }

  try {
    const now = new Date();
    const [consumosConsumidosHoy, remoteStatus] = await Promise.all([
      getSuccessfulConsumptionsForDate({ codigo }),
      consultarEstadoEmpleadoEnApi({
        codigo,
        soda: APP_CONFIG.soda,
        includeDisponibilidad: true
      })
    ]);

    const registrado = remoteStatus?.registrado ?? null;
    const activo = remoteStatus?.activo ?? null;

    const blockedReason =
      registrado === false
        ? remoteStatus?.message || "Codigo no registrado en API externa."
        : activo === false
        ? remoteStatus?.message || "Empleado inactivo en API externa."
        : "";

    const consumos = buildConsumoAvailability({
      consumosConsumidosHoy,
      blockedReason,
      remoteDisponibilidad: remoteStatus?.disponibilidadPorConsumo || {},
      now
    });
    const tieneConsumosDisponibles = consumos.some((item) => item.disponible);

    let mensajeEstado = buildEstadoEmpleadoMessage({
      registrado,
      activo,
      verificadoRemotamente: Boolean(remoteStatus?.verificado),
      remoteMessage: remoteStatus?.message,
      consumos
    });

    if (!blockedReason && !tieneConsumosDisponibles && !mensajeEstado) {
      mensajeEstado = "El empleado no tiene consumos disponibles para el horario actual o ya fueron utilizados.";
    }

    const puedeConsumir = !blockedReason && tieneConsumosDisponibles;
    const snapshotCR = getCostaRicaTimeSnapshot(now);
    const consumoSlotActual = getCurrentConsumoSlot(now);

    return res.json({
      ok: true,
      data: {
        codigo,
        nombreEmpleado: remoteStatus?.nombreEmpleado || null,
        registrado,
        activo,
        verificadoRemotamente: Boolean(remoteStatus?.verificado),
        puedeConsumir,
        mensajeEstado,
        horarioActual: {
          fecha: snapshotCR.date,
          hora: snapshotCR.clock,
          consumoReferencia: consumoSlotActual
        },
        consumosConsumidosHoy,
        consumos
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "No se pudo validar el codigo del empleado.",
      detail: error.message
    });
  }
});

app.post("/api/consumo", ensureRole([ROLES.ADMIN, ROLES.SELLER]), async (req, res) => {
  const codigo = sanitizeCodigo(req.body?.codigo);
  const consumo = normalizeConsumo(req.body?.consumo);

  if (!codigo) {
    return res.status(400).json({
      ok: false,
      message: "Debe ingresar un codigo valido."
    });
  }

  if (!Object.prototype.hasOwnProperty.call(CONSUMOS, consumo)) {
    return res.status(400).json({
      ok: false,
      message: "El tipo de consumo no existe."
    });
  }

  const consumoConfig = CONSUMOS[consumo];
  const monto = Number(consumoConfig.monto);

  if (!Number.isFinite(monto) || monto <= 0) {
    return res.status(500).json({
      ok: false,
      message: "El monto configurado para este consumo no es valido."
    });
  }

  const fecha = new Date().toISOString();

  const transactionBase = {
    fecha,
    nombre_empleado: null,
    codigo_empleado: codigo,
    tipo_consumo: consumo,
    tipo_basico: consumoConfig.tipoBasico,
    monto,
    soda: APP_CONFIG.soda
  };

  try {
    const remoteStatus = await consultarEstadoEmpleadoEnApi({
      codigo,
      soda: APP_CONFIG.soda,
      includeDisponibilidad: true
    });
    const nombreEmpleado = String(remoteStatus?.nombreEmpleado || "").trim() || null;
    const transactionWithName = {
      ...transactionBase,
      nombre_empleado: nombreEmpleado
    };

    if (remoteStatus?.registrado === false || remoteStatus?.activo === false) {
      const detail =
        remoteStatus.registrado === false
          ? "Codigo no registrado en la API externa"
          : "Empleado inactivo en la API externa";

      await persistTransactionSafely({
        ...transactionWithName,
        estado: "fallido",
        respuesta_api: {
          message: detail,
          details: remoteStatus?.details || null,
          status: 403
        },
        numero_transaccion: null
      });

      return res.status(403).json({
        ok: false,
        message: "No autorizado para consumir",
        detail
      });
    }

    if (!isConsumoInSchedule(consumo)) {
      const detail = `El consumo ${consumoConfig.label} no esta disponible en este horario (${getConsumoHorarioLabel(consumo)}).`;

      await persistTransactionSafely({
        ...transactionWithName,
        estado: "fallido",
        respuesta_api: {
          message: detail,
          details: null,
          status: 409
        },
        numero_transaccion: null
      });

      return res.status(409).json({
        ok: false,
        message: "Consumo fuera de horario",
        detail
      });
    }

    const disponibilidadApiConsumo = remoteStatus?.disponibilidadPorConsumo?.[consumo] || null;
    if (APP_CONFIG.integrationMode === "api") {
      if (disponibilidadApiConsumo?.puedeConsumirEnApi === false) {
        const detail =
          disponibilidadApiConsumo?.mensaje ||
          `El consumo ${consumoConfig.label} no esta disponible segun API externa.`;

        await persistTransactionSafely({
          ...transactionWithName,
          estado: "fallido",
          respuesta_api: {
            message: detail,
            details: disponibilidadApiConsumo,
            status: 409
          },
          numero_transaccion: null
        });

        return res.status(409).json({
          ok: false,
          message: "Consumo no disponible",
          detail
        });
      }

      if (disponibilidadApiConsumo?.puedeConsumirEnApi === null) {
        const detail =
          disponibilidadApiConsumo?.mensaje ||
          "No se pudo validar disponibilidad con API externa para este consumo.";

        await persistTransactionSafely({
          ...transactionWithName,
          estado: "fallido",
          respuesta_api: {
            message: detail,
            details: disponibilidadApiConsumo,
            status: 502
          },
          numero_transaccion: null
        });

        return res.status(502).json({
          ok: false,
          message: "No se pudo validar disponibilidad",
          detail
        });
      }
    }

    const consumosConsumidosHoy = await getSuccessfulConsumptionsForDate({ codigo });
    if (consumosConsumidosHoy.includes(consumo)) {
      const detail = `El consumo ${consumoConfig.label} ya fue registrado hoy para el codigo ${codigo}.`;

      await persistTransactionSafely({
        ...transactionWithName,
        estado: "fallido",
        respuesta_api: {
          message: detail,
          details: null,
          status: 409
        },
        numero_transaccion: null
      });

      return res.status(409).json({
        ok: false,
        message: "Consumo ya registrado hoy",
        detail
      });
    }

    const apiResponse = await registrarConsumoEnApi({
      soda: APP_CONFIG.soda,
      codigo,
      tipoBasico: consumoConfig.tipoBasico,
      monto
    });

    await persistTransactionSafely({
      ...transactionWithName,
      estado: "exitoso",
      respuesta_api: apiResponse.data,
      numero_transaccion: apiResponse.numeroTransaccion
    });

    return res.json({
      ok: true,
      message: "Consumo registrado correctamente",
      data: {
        codigo,
        nombreEmpleado,
        consumo,
        tipoBasico: consumoConfig.tipoBasico,
        monto,
        soda: APP_CONFIG.soda,
        numeroTransaccion: apiResponse.numeroTransaccion,
        respuestaApi: apiResponse.data
      }
    });
  } catch (error) {
    const status =
      Number(error?.status) >= 400 && Number(error?.status) < 600
        ? Number(error.status)
        : 500;

    const detail = getErrorMessage(error);

    await persistTransactionSafely({
      ...transactionBase,
      estado: "fallido",
      respuesta_api: {
        message: detail,
        details: error?.details || null,
        status
      },
      numero_transaccion: null
    });

    return res.status(status).json({
      ok: false,
      message: "Error al registrar consumo",
      detail
    });
  }
});

app.get("/api/historial", ensureRole([ROLES.ADMIN]), async (req, res) => {
  try {
    const filters = buildHistorialFilters(req.query);
    const paged = await getTransactionsPaged(filters);
    return res.json({
      ok: true,
      data: paged.rows,
      pagination: {
        page: paged.page,
        limit: paged.limit,
        total: paged.total,
        totalPages: paged.totalPages
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "No se pudo cargar historial",
      detail: error.message
    });
  }
});

app.post("/api/transacciones/:id/eliminar", ensureRole([ROLES.ADMIN]), async (req, res) => {
  const id = parseTransactionId(req.params.id);
  if (!id) {
    return res.status(400).json({
      ok: false,
      message: "Id de transaccion invalido"
    });
  }

  const detail = sanitizeFilterText(req.body?.detalle || req.body?.motivo || "");

  try {
    const transaction = await getTransactionById(id);
    if (!transaction) {
      return res.status(404).json({
        ok: false,
        message: "No se encontro la transaccion solicitada"
      });
    }

    if (Number(transaction.eliminado) === 1) {
      return res.status(409).json({
        ok: false,
        message: "La transaccion ya fue movida a eliminados"
      });
    }

    if (transaction.estado !== "exitoso") {
      return res.status(409).json({
        ok: false,
        message: "Solo se pueden eliminar transacciones exitosas"
      });
    }

    const apiDeletionResult = await reversarConsumoEnApi({
      soda: transaction.soda || APP_CONFIG.soda,
      numeroTransaccion: transaction.numero_transaccion
    });

    if (APP_CONFIG.integrationMode === "api" && !apiDeletionResult?.realizada) {
      return res.status(409).json({
        ok: false,
        message: "No se pudo completar reversa en API externa",
        detail: apiDeletionResult?.message || "La API no confirmo la reversa"
      });
    }

    const result = await softDeleteTransaction({
      id,
      deletedBy: req.session?.user?.username || "admin",
      detail,
      apiDeletionResult
    });

    if (!result || Number(result.changes) === 0) {
      return res.status(409).json({
        ok: false,
        message: "No fue posible mover la transaccion a eliminados"
      });
    }

    const updated = await getTransactionById(id);
    return res.json({
      ok: true,
      message: "Transaccion movida a eliminados",
      data: {
        transaction: updated,
        apiDeletionResult
      }
    });
  } catch (error) {
    const status =
      Number(error?.status) >= 400 && Number(error?.status) < 600
        ? Number(error.status)
        : 500;

    return res.status(status).json({
      ok: false,
      message: "No se pudo eliminar la transaccion",
      detail: getErrorMessage(error)
    });
  }
});

app.get("/api/historial/export", ensureRole([ROLES.ADMIN]), async (req, res) => {
  try {
    const filters = {
      ...buildHistorialFilters(req.query),
      page: 1,
      offset: 0,
      limit: 5000
    };

    const transactions = await getTransactions(filters);
    const workbook = XLSX.utils.book_new();
    const rows = toExcelRows(transactions);
    const worksheet = XLSX.utils.json_to_sheet(rows);

    XLSX.utils.book_append_sheet(workbook, worksheet, "Transacciones");

    const snapshotCR = getCostaRicaTimeSnapshot(new Date());
    const fileTimestamp = `${snapshotCR.date}_${snapshotCR.clock.replace(/:/g, "-")}_CR`;
    const fileName = `transacciones_${fileTimestamp}.xlsx`;
    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx"
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);

    return res.send(buffer);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "No se pudo exportar historial",
      detail: error.message
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor activo en http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("No se pudo inicializar la base de datos:", error.message);
    process.exit(1);
  });
