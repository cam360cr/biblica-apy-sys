const axios = require("axios");
const bcrypt = require("bcryptjs");
const {
  APP_CONFIG,
  CONSUMOS,
  COSTA_RICA_UTC_OFFSET_MINUTES,
  getValidationOrderForCurrentSlot
} = require("./config");

const TOKEN_DEFAULT_CACHE_MS = 4 * 60 * 1000;
const TOKEN_MIN_TTL_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 15000;

let cachedToken = null;
let tokenExpiresAt = 0;

function isLocalIntegrationMode() {
  return APP_CONFIG.integrationMode === "local";
}

function buildLocalTransactionNumber() {
  const random = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `LOCAL-${Date.now()}-${random}`;
}

function buildClientTransactionNumber() {
  const base = `${Date.now()}${Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0")}`;
  return base.slice(-16).padStart(16, "0");
}

function createApiError(message, status = 500, details = null) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

function safeLog(eventName, data) {
  try {
    console.info(`[HCB] ${eventName}`, data);
  } catch (_error) {
    // No se interrumpe el flujo por un error de logging.
  }
}

function getEnvConfig() {
  return {
    baseUrl: (process.env.HCB_BASE_URL || "").replace(/\/+$/, ""),
    publicKey: process.env.HCB_PUBLIC_KEY || "",
    servicio: process.env.HCB_SERVICIO || "",
    usuario: process.env.HCB_USUARIO || "",
    llavePrivada: process.env.HCB_LLAVE_PRIVADA || ""
  };
}

function assertRequiredEnv() {
  const env = getEnvConfig();
  const missing = [];

  if (!env.baseUrl) missing.push("HCB_BASE_URL");
  if (!env.publicKey) missing.push("HCB_PUBLIC_KEY");
  if (!env.servicio) missing.push("HCB_SERVICIO");
  if (!env.usuario) missing.push("HCB_USUARIO");
  if (!env.llavePrivada) missing.push("HCB_LLAVE_PRIVADA");

  if (missing.length > 0) {
    throw createApiError(
      `Faltan variables de entorno: ${missing.join(", ")}. Revise el archivo .env.`,
      500
    );
  }

  return env;
}

function pad(value, size = 2) {
  return String(value).padStart(size, "0");
}

function formatTimestampWithTimezone(date = new Date()) {
  const sourceDate = date instanceof Date ? date : new Date(date);
  const costaRicaDate = new Date(sourceDate.getTime() + COSTA_RICA_UTC_OFFSET_MINUTES * 60 * 1000);

  const year = costaRicaDate.getUTCFullYear();
  const month = pad(costaRicaDate.getUTCMonth() + 1);
  const day = pad(costaRicaDate.getUTCDate());
  const hour = pad(costaRicaDate.getUTCHours());
  const minute = pad(costaRicaDate.getUTCMinutes());
  const second = pad(costaRicaDate.getUTCSeconds());

  const fractional = `${pad(costaRicaDate.getUTCMilliseconds(), 3)}0000`;

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${fractional}-06:00`;
}

function truncateUtf8ForBcrypt(value) {
  const bytes = Buffer.from(String(value || ""), "utf8");
  return bytes.subarray(0, 72).toString("utf8");
}

function normalizeBcryptPrefix(hash) {
  if (typeof hash !== "string") {
    return hash;
  }

  if (hash.startsWith("$2y$")) {
    return hash;
  }

  if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2x$")) {
    return `$2y$${hash.slice(4)}`;
  }

  return hash;
}

function generateHmac(timestamp) {
  const env = assertRequiredEnv();
  const rawPayload = `${timestamp}${env.usuario}${env.llavePrivada}`;
  const truncatedPayload = truncateUtf8ForBcrypt(rawPayload);
  const hash = bcrypt.hashSync(truncatedPayload, bcrypt.genSaltSync(6));

  return normalizeBcryptPrefix(hash);
}

function extractToken(data) {
  return data?.access_token || data?.token || data?.Token || data?.AccessToken || null;
}

function resolveTokenTtlMs(data) {
  const configuredTtl = Number(APP_CONFIG.tokenCacheMs) > 0
    ? Number(APP_CONFIG.tokenCacheMs)
    : TOKEN_DEFAULT_CACHE_MS;

  const expiresInRaw = data?.expires_in ?? data?.expiresIn ?? data?.ExpiresIn ?? data?.expires;
  const expiresInSeconds = Number(expiresInRaw);

  if (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0) {
    const ttlFromApi = Math.max(TOKEN_MIN_TTL_MS, expiresInSeconds * 1000 - 10000);
    return Math.min(configuredTtl, ttlFromApi);
  }

  return configuredTtl;
}

function isTokenStillValid() {
  return Boolean(cachedToken) && Date.now() < tokenExpiresAt;
}

async function requestToken() {
  const env = assertRequiredEnv();
  const timestamp = formatTimestampWithTimezone();
  const hmac = generateHmac(timestamp);

  const body = new URLSearchParams({
    grant_type: "hcbauth",
    PublicKey: env.publicKey,
    Servicio: env.servicio,
    TimeStamp: timestamp,
    HMAC: hmac
  });

  safeLog("token.request", {
    endpoint: `${env.baseUrl}/api/token`,
    timestamp
  });

  try {
    const response = await axios.post(`${env.baseUrl}/api/token`, body.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      timeout: REQUEST_TIMEOUT_MS
    });

    const token = extractToken(response.data);
    if (!token) {
      throw createApiError("La respuesta de /api/token no incluyo un token valido.", 502, response.data);
    }

    cachedToken = token;
    tokenExpiresAt = Date.now() + resolveTokenTtlMs(response.data);

    safeLog("token.response", {
      endpoint: `${env.baseUrl}/api/token`,
      status: response.status,
      cacheSeconds: Math.floor((tokenExpiresAt - Date.now()) / 1000)
    });

    return token;
  } catch (error) {
    if (error.status) {
      throw error;
    }

    if (error.response) {
      throw createApiError(
        "No se pudo obtener token desde la API externa.",
        Number(error.response.status) || 502,
        error.response.data
      );
    }

    if (error.request) {
      throw createApiError("No hubo respuesta del endpoint de token.", 502, null);
    }

    throw createApiError(error.message || "Error desconocido al solicitar token.", 500, null);
  }
}

async function getHcbToken(forceRefresh = false) {
  if (isLocalIntegrationMode()) {
    return "LOCAL-TOKEN";
  }

  if (!forceRefresh && isTokenStillValid()) {
    return cachedToken;
  }

  return requestToken();
}

const getValidToken = getHcbToken;

function isUnauthorizedError(error) {
  const status = Number(error?.response?.status || error?.status);
  return status === 401 || status === 403;
}

function normalizeApiError(error, defaultMessage) {
  if (error?.status) {
    return error;
  }

  if (error?.response) {
    const details = error.response.data;
    const message =
      details?.error_description ||
      details?.message ||
      details?.Message ||
      defaultMessage;

    return createApiError(message, Number(error.response.status) || 502, details || null);
  }

  if (error?.request) {
    return createApiError("No hubo respuesta de la API externa.", 502, null);
  }

  return createApiError(error?.message || defaultMessage, 500, null);
}

async function executeAuthorizedRequest({ requestFactory, defaultMessage }) {
  let token = await getHcbToken();

  try {
    return await requestFactory(token);
  } catch (error) {
    if (isUnauthorizedError(error)) {
      token = await getHcbToken(true);
      return requestFactory(token);
    }

    throw normalizeApiError(error, defaultMessage);
  }
}

function toComparableText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isEmployeeNotFoundMessage(message) {
  const normalized = toComparableText(message);
  return normalized.includes("no corresponde a ningun empleado") || normalized.includes("ningun empleado o tarjeta");
}

function isHorarioRestrictionMessage(message) {
  const normalized = toComparableText(message);
  return (
    normalized.includes("no se ha encontrado un horario de comida") ||
    normalized.includes("despues de las horas definidas") ||
    normalized.includes("horario de comida definidos para la hora actual")
  );
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseXmlValores(xmlText) {
  const text = String(xmlText || "");
  if (!text.trim()) {
    return {};
  }

  const valoresMatch = /<valores\b[^>]*>([\s\S]*?)<\/valores>/i.exec(text);
  const target = valoresMatch ? valoresMatch[1] : text;
  const values = {};

  const nodeRegex = /<([A-Za-z0-9_:-]+)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = nodeRegex.exec(target)) !== null) {
    const key = String(match[1] || "").trim();
    if (!key || Object.prototype.hasOwnProperty.call(values, key)) {
      continue;
    }

    const rawInner = String(match[2] || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, "")
      .trim();

    values[key] = decodeXmlEntities(rawInner);
  }

  const emptyRegex = /<([A-Za-z0-9_:-]+)\b[^>]*\/>/g;
  while ((match = emptyRegex.exec(target)) !== null) {
    const key = String(match[1] || "").trim();
    if (!key || Object.prototype.hasOwnProperty.call(values, key)) {
      continue;
    }

    values[key] = "";
  }

  return values;
}

function pickFirstNonEmpty(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value === undefined || value === null) {
      continue;
    }

    const normalized = String(value).trim();
    if (normalized !== "") {
      return normalized;
    }
  }

  return "";
}

function toParsedNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function parsePossibleJsonText(value) {
  const rawText = String(value || "").trim();
  if (!rawText) {
    return rawText;
  }

  if (!(rawText.startsWith("{") || rawText.startsWith("["))) {
    return rawText;
  }

  try {
    return JSON.parse(rawText);
  } catch (_error) {
    return rawText;
  }
}

function normalizeConsultaPayload(payload) {
  let values = {};

  if (typeof payload === "string") {
    const parsedPayload = parsePossibleJsonText(payload);
    if (typeof parsedPayload === "string") {
      values = parseXmlValores(parsedPayload);
    } else if (parsedPayload && typeof parsedPayload === "object") {
      values = parsedPayload.dataset?.valores || parsedPayload.valores || parsedPayload;
    }
  } else if (payload && typeof payload === "object") {
    values = payload.dataset?.valores || payload.valores || payload;
  }

  const resultadoRaw = pickFirstNonEmpty(values, ["resultado", "Resultado"]);
  const mensaje = pickFirstNonEmpty(values, ["mensaje", "Mensaje"]);
  const empleadoNombre = pickFirstNonEmpty(values, [
    "empleado_Nombre",
    "empleadoNombre",
    "NombreEmpleado",
    "nombreEmpleado"
  ]);
  const numeroTransaccion = pickFirstNonEmpty(values, [
    "numTransaccion",
    "numeroTransaccion",
    "NumeroTransaccion",
    "Numero_Transaccion"
  ]);

  const parsedResultado = Number.parseInt(resultadoRaw, 10);

  return {
    resultado: Number.isInteger(parsedResultado) ? parsedResultado : null,
    mensaje,
    empleadoNombre,
    numeroTransaccion,
    montoExcedente: toParsedNumber(pickFirstNonEmpty(values, ["Monto_excedente", "montoExcedente"])),
    montoCxp: toParsedNumber(pickFirstNonEmpty(values, ["Monto_cxp", "montoCxp"])),
    montoSub: toParsedNumber(pickFirstNonEmpty(values, ["Monto_sub", "montoSub"])),
    employeeNotFound: isEmployeeNotFoundMessage(mensaje),
    horarioNoDisponible: isHorarioRestrictionMessage(mensaje),
    rawValues: values
  };
}

function inferEmployeeExistence(parsedConsulta) {
  if (!parsedConsulta) {
    return null;
  }

  if (parsedConsulta.resultado === 1) {
    return true;
  }

  if (parsedConsulta.employeeNotFound) {
    return false;
  }

  if (String(parsedConsulta.empleadoNombre || "").trim()) {
    return true;
  }

  if (parsedConsulta.resultado === -1) {
    return null;
  }

  return null;
}

function buildConsultarBasicoUrl(baseUrl, { soda, numeroEmpleado, tipoBasico, monto }) {
  const encodedSoda = encodeURIComponent(String(soda || "").trim());
  const encodedNumeroEmpleado = encodeURIComponent(String(numeroEmpleado || "").trim());
  const encodedTipoBasico = encodeURIComponent(String(tipoBasico || "").trim());
  const encodedMonto = encodeURIComponent(String(monto || "").trim());

  return `${baseUrl}/api/Basicos/V2/Empleado/${encodedSoda}/${encodedNumeroEmpleado}/${encodedTipoBasico}/${encodedMonto}`;
}

function buildRegistrarBasicoUrl(baseUrl, { soda, numeroEmpleado }) {
  const encodedSoda = encodeURIComponent(String(soda || "").trim());
  const encodedNumeroEmpleado = encodeURIComponent(String(numeroEmpleado || "").trim());
  return `${baseUrl}/api/Basicos/V2/Empleado/${encodedSoda}/${encodedNumeroEmpleado}`;
}

function buildReversarBasicoUrl(baseUrl, { soda, numeroTransaccion }) {
  const encodedSoda = encodeURIComponent(String(soda || "").trim());
  const encodedNumeroTransaccion = encodeURIComponent(String(numeroTransaccion || "").trim());
  return `${baseUrl}/api/Basicos/V2/Empleado/${encodedSoda}/${encodedNumeroTransaccion}`;
}

function normalizeBasicoResponsePayload(payload) {
  if (typeof payload === "string") {
    return parsePossibleJsonText(payload);
  }

  return payload;
}

function extractNumeroTransaccion(payload) {
  const normalized = normalizeBasicoResponsePayload(payload);

  if (normalized && typeof normalized === "object") {
    const fromObject = pickFirstNonEmpty(normalized, [
      "numeroTransaccion",
      "NumeroTransaccion",
      "numero_transaccion",
      "Numero_Transaccion",
      "idTransaccion",
      "IdTransaccion"
    ]);

    if (fromObject) {
      return fromObject;
    }
  }

  const parsedConsulta = normalizeConsultaPayload(payload);
  return parsedConsulta.numeroTransaccion || null;
}

async function consultarBasico({ soda, numeroEmpleado, tipoBasico, monto }) {
  const normalizedNumeroEmpleado = String(numeroEmpleado || "").trim();
  const normalizedTipoBasico = String(tipoBasico || "").trim().toUpperCase();
  const parsedMonto = Number(monto);

  if (!normalizedNumeroEmpleado) {
    throw createApiError("NumeroEmpleado es requerido para consultar básico.", 400);
  }

  if (!normalizedTipoBasico) {
    throw createApiError("TipoBasico es requerido para consultar básico.", 400);
  }

  if (!Number.isFinite(parsedMonto) || parsedMonto <= 0) {
    throw createApiError("Monto invalido para consultar básico.", 400);
  }

  if (isLocalIntegrationMode()) {
    const payload = {
      resultado: 1,
      mensaje: "Consulta simulada en modo local.",
      empleado_Nombre: `Empleado ${normalizedNumeroEmpleado}`,
      numTransaccion: "0000000000000000"
    };

    return {
      status: 200,
      url: "local://api/Basicos/V2/Empleado",
      data: payload,
      parsed: normalizeConsultaPayload(payload)
    };
  }

  const env = assertRequiredEnv();
  const url = buildConsultarBasicoUrl(env.baseUrl, {
    soda,
    numeroEmpleado: normalizedNumeroEmpleado,
    tipoBasico: normalizedTipoBasico,
    monto: parsedMonto
  });

  return executeAuthorizedRequest({
    defaultMessage: "Error al consultar básico en API externa.",
    requestFactory: async (token) => {
      const requestTimestamp = formatTimestampWithTimezone();
      safeLog("consultar.request", {
        endpoint: url,
        timestamp: requestTimestamp,
        numeroEmpleado: normalizedNumeroEmpleado,
        tipoBasico: normalizedTipoBasico,
        monto: parsedMonto
      });

      const response = await axios.get(url, {
        headers: {
          Accept: "application/json, application/xml, text/xml",
          Authorization: `Bearer ${token}`
        },
        timeout: REQUEST_TIMEOUT_MS,
        responseType: "text"
      });

      const normalizedData = normalizeBasicoResponsePayload(response.data);
      const parsed = normalizeConsultaPayload(normalizedData);

      safeLog("consultar.response", {
        endpoint: url,
        status: response.status,
        resultado: parsed.resultado,
        mensaje: parsed.mensaje || ""
      });

      return {
        status: response.status,
        url,
        data: normalizedData,
        parsed
      };
    }
  });
}

async function registrarBasico({ soda, numeroEmpleado, tipoBasico, monto, numeroTransaccion }) {
  const normalizedNumeroEmpleado = String(numeroEmpleado || "").trim();
  const normalizedTipoBasico = String(tipoBasico || "").trim().toUpperCase();
  const parsedMonto = Number(monto);
  const trx = String(numeroTransaccion || buildClientTransactionNumber()).trim();

  if (!normalizedNumeroEmpleado) {
    throw createApiError("NumeroEmpleado es requerido para registrar básico.", 400);
  }

  if (!normalizedTipoBasico) {
    throw createApiError("TipoBasico es requerido para registrar básico.", 400);
  }

  if (!Number.isFinite(parsedMonto) || parsedMonto <= 0) {
    throw createApiError("Monto invalido para registrar básico.", 400);
  }

  if (!trx) {
    throw createApiError("NumeroTransaccion invalido para registrar básico.", 400);
  }

  if (isLocalIntegrationMode()) {
    const localNumeroTransaccion = buildLocalTransactionNumber();

    return {
      status: 200,
      url: "local://api/Basicos/V2/Empleado",
      numeroTransaccion: localNumeroTransaccion,
      data: {
        resultado: 1,
        mensaje: "Registro simulado en modo local.",
        numeroTransaccion: localNumeroTransaccion,
        numeroEmpleado: normalizedNumeroEmpleado,
        tipoBasico: normalizedTipoBasico,
        monto: parsedMonto
      }
    };
  }

  const env = assertRequiredEnv();
  const url = buildRegistrarBasicoUrl(env.baseUrl, {
    soda,
    numeroEmpleado: normalizedNumeroEmpleado
  });

  return executeAuthorizedRequest({
    defaultMessage: "Error al registrar básico en API externa.",
    requestFactory: async (token) => {
      const requestTimestamp = formatTimestampWithTimezone();
      safeLog("registrar.request", {
        endpoint: url,
        timestamp: requestTimestamp,
        numeroEmpleado: normalizedNumeroEmpleado,
        tipoBasico: normalizedTipoBasico,
        monto: parsedMonto
      });

      const response = await axios.post(
        url,
        {
          TipoBasico: normalizedTipoBasico,
          Monto: parsedMonto,
          NumeroTransaccion: trx
        },
        {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, application/xml, text/xml",
            Authorization: `Bearer ${token}`
          },
          timeout: REQUEST_TIMEOUT_MS,
          responseType: "text"
        }
      );

      const normalizedData = normalizeBasicoResponsePayload(response.data);
      const numeroExtraido = extractNumeroTransaccion(normalizedData) || trx;

      safeLog("registrar.response", {
        endpoint: url,
        status: response.status,
        numeroTransaccion: numeroExtraido
      });

      return {
        status: response.status,
        url,
        numeroTransaccion: numeroExtraido,
        data: normalizedData
      };
    }
  });
}

async function reversarBasico({ soda, numeroTransaccion }) {
  const normalizedNumeroTransaccion = String(numeroTransaccion || "").trim();

  if (!normalizedNumeroTransaccion) {
    throw createApiError("NumeroTransaccion es requerido para reversar básico.", 400);
  }

  if (isLocalIntegrationMode()) {
    return {
      status: 200,
      url: "local://api/Basicos/V2/Empleado",
      data: {
        resultado: 1,
        mensaje: "Reversa simulada en modo local.",
        numeroTransaccion: normalizedNumeroTransaccion
      }
    };
  }

  const env = assertRequiredEnv();
  const url = buildReversarBasicoUrl(env.baseUrl, {
    soda,
    numeroTransaccion: normalizedNumeroTransaccion
  });

  return executeAuthorizedRequest({
    defaultMessage: "Error al reversar básico en API externa.",
    requestFactory: async (token) => {
      const requestTimestamp = formatTimestampWithTimezone();
      safeLog("reversar.request", {
        endpoint: url,
        timestamp: requestTimestamp,
        numeroTransaccion: normalizedNumeroTransaccion
      });

      const response = await axios.delete(url, {
        headers: {
          Accept: "application/json, application/xml, text/xml",
          Authorization: `Bearer ${token}`
        },
        timeout: REQUEST_TIMEOUT_MS,
        responseType: "text"
      });

      const normalizedData = normalizeBasicoResponsePayload(response.data);

      safeLog("reversar.response", {
        endpoint: url,
        status: response.status
      });

      return {
        status: response.status,
        url,
        data: normalizedData
      };
    }
  });
}

async function consultarEstadoEmpleadoEnApi({ codigo, soda, includeDisponibilidad = false }) {
  const numeroEmpleado = String(codigo || "").trim();

  if (!numeroEmpleado) {
    return {
      verificado: false,
      registrado: null,
      activo: null,
      nombreEmpleado: null,
      message: "Debe indicar el codigo de empleado.",
      disponibilidadPorConsumo: {}
    };
  }

  if (isLocalIntegrationMode()) {
    const disponibilidadPorConsumo = {};

    for (const consumoKey of Object.keys(CONSUMOS)) {
      disponibilidadPorConsumo[consumoKey] = {
        resultado: 1,
        mensaje: "Disponible en modo local.",
        puedeConsumirEnApi: true,
        numeroTransaccion: null
      };
    }

    return {
      verificado: true,
      registrado: true,
      activo: true,
      nombreEmpleado: `Empleado ${numeroEmpleado}`,
      message: "Validacion simulada en modo local.",
      disponibilidadPorConsumo: includeDisponibilidad ? disponibilidadPorConsumo : {}
    };
  }

  const consultaByConsumo = {};
  const validationOrder = getValidationOrderForCurrentSlot();
  let nombreEmpleado = "";
  let registrado = null;
  let activo = null;
  let verificado = false;
  let message = "No se pudo validar empleado en API externa.";

  const runConsulta = async (consumoKey) => {
    if (consultaByConsumo[consumoKey]) {
      return consultaByConsumo[consumoKey];
    }

    const consumoConfig = CONSUMOS[consumoKey];
    if (!consumoConfig) {
      return null;
    }

    try {
      const consulta = await consultarBasico({
        soda,
        numeroEmpleado,
        tipoBasico: consumoConfig.tipoBasico,
        monto: consumoConfig.monto
      });

      const employeeExists = inferEmployeeExistence(consulta.parsed);
      const item = {
        ok: true,
        key: consumoKey,
        status: consulta.status,
        resultado: consulta.parsed.resultado,
        mensaje: consulta.parsed.mensaje,
        empleadoNombre: consulta.parsed.empleadoNombre,
        numeroTransaccion: consulta.parsed.numeroTransaccion || null,
        puedeConsumirEnApi: consulta.parsed.resultado === 1,
        employeeNotFound: consulta.parsed.employeeNotFound,
        horarioNoDisponible: consulta.parsed.horarioNoDisponible,
        employeeExists
      };

      consultaByConsumo[consumoKey] = item;
      return item;
    } catch (error) {
      const normalizedError = normalizeApiError(error, "No se pudo consultar disponibilidad del empleado.");

      const item = {
        ok: false,
        key: consumoKey,
        status: normalizedError.status,
        resultado: null,
        mensaje: normalizedError.message,
        empleadoNombre: "",
        numeroTransaccion: null,
        puedeConsumirEnApi: null,
        employeeNotFound: false,
        horarioNoDisponible: false,
        employeeExists: null,
        details: normalizedError.details || null
      };

      consultaByConsumo[consumoKey] = item;
      return item;
    }
  };

  for (const consumoKey of validationOrder) {
    const result = await runConsulta(consumoKey);
    if (!result) {
      continue;
    }

    if (result.ok) {
      verificado = true;
    }

    if (!nombreEmpleado && String(result.empleadoNombre || "").trim()) {
      nombreEmpleado = String(result.empleadoNombre || "").trim();
    }

    if (result.employeeExists === true) {
      registrado = true;
      activo = true;
      message = result.mensaje || "Empleado validado en API externa.";
      break;
    }

    if (result.employeeExists === false) {
      registrado = false;
      activo = false;
      message = result.mensaje || "Empleado no encontrado en API externa.";

      if (result.employeeNotFound) {
        break;
      }

      continue;
    }

    if (result.mensaje) {
      message = result.mensaje;
    }
  }

  if (registrado === null && nombreEmpleado) {
    registrado = true;
    activo = true;
  }

  const disponibilidadPorConsumo = {};

  if (includeDisponibilidad) {
    for (const consumoKey of Object.keys(CONSUMOS)) {
      let result = consultaByConsumo[consumoKey];

      if (!result && registrado !== false) {
        result = await runConsulta(consumoKey);

        if (result?.ok) {
          verificado = true;
        }

        if (!nombreEmpleado && String(result?.empleadoNombre || "").trim()) {
          nombreEmpleado = String(result.empleadoNombre || "").trim();
        }

        if (registrado === null && result?.employeeExists === true) {
          registrado = true;
          activo = true;
        }

        if (registrado === null && result?.employeeExists === false && result?.employeeNotFound) {
          registrado = false;
          activo = false;
        }
      }

      disponibilidadPorConsumo[consumoKey] = {
        resultado: result?.resultado ?? null,
        mensaje: result?.mensaje || "No se pudo validar disponibilidad en API externa.",
        puedeConsumirEnApi: result?.puedeConsumirEnApi ?? null,
        numeroTransaccion: result?.numeroTransaccion || null
      };
    }
  }

  return {
    verificado,
    registrado,
    activo,
    nombreEmpleado: nombreEmpleado || null,
    message,
    disponibilidadPorConsumo,
    raw: {
      consultas: consultaByConsumo
    }
  };
}

async function registrarConsumoEnApi({ soda, codigo, tipoBasico, monto, numeroTransaccion }) {
  const response = await registrarBasico({
    soda,
    numeroEmpleado: codigo,
    tipoBasico,
    monto,
    numeroTransaccion
  });

  return {
    status: response.status,
    data: response.data,
    numeroTransaccion: response.numeroTransaccion || null
  };
}

async function reversarConsumoEnApi({ soda, numeroTransaccion }) {
  if (isLocalIntegrationMode()) {
    return {
      verificada: true,
      realizada: true,
      message: "Reversa simulada en local.",
      data: {
        mode: "local",
        soda,
        numeroTransaccion
      }
    };
  }

  const numero = String(numeroTransaccion || "").trim();
  if (!numero) {
    return {
      verificada: false,
      realizada: false,
      message: "La transaccion no tiene NumeroTransaccion para reversar en API externa."
    };
  }

  try {
    const response = await reversarBasico({
      soda,
      numeroTransaccion: numero
    });

    return {
      verificada: true,
      realizada: true,
      message: "Reversa aplicada en API externa.",
      status: response.status,
      data: response.data
    };
  } catch (error) {
    const normalized = normalizeApiError(error, "No se pudo reversar consumo en API externa.");

    if (Number(normalized.status) === 404) {
      return {
        verificada: true,
        realizada: false,
        message: "No se encontro transaccion en API externa para reversar.",
        status: 404,
        data: normalized.details || null
      };
    }

    throw normalized;
  }
}

module.exports = {
  generateHmac,
  formatTimestampWithTimezone,
  getHcbToken,
  getValidToken,
  consultarBasico,
  registrarBasico,
  reversarBasico,
  consultarEstadoEmpleadoEnApi,
  registrarConsumoEnApi,
  reversarConsumoEnApi
};
