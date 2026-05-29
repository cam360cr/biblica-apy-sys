const CONSUMOS = {
  desayuno: {
    label: "Desayuno",
    tipoBasico: "D",
    monto: 6000
  },
  almuerzo: {
    label: "Almuerzo",
    tipoBasico: "A",
    monto: 6000
  },
  cena: {
    label: "Cena",
    tipoBasico: "C",
    monto: 6000
  },
  cafe: {
    label: "Café",
    tipoBasico: "F",
    monto: 1000
  }
};

const COSTA_RICA_UTC_OFFSET_MINUTES = -6 * 60;

const CONSUMO_HORARIOS_CR = {
  desayuno: {
    start: "05:00",
    end: "10:55"
  },
  almuerzo: {
    start: "11:00",
    end: "15:50"
  },
  cena: {
    start: "16:00",
    end: "23:59"
  },
  cafe: {
    start: "00:00",
    end: "23:59"
  }
};

const VALIDATION_PRIORITY_BY_SLOT = {
  desayuno: ["desayuno", "cafe", "almuerzo", "cena"],
  almuerzo: ["almuerzo", "cafe", "desayuno", "cena"],
  cena: ["cena", "cafe", "almuerzo", "desayuno"],
  cafe: ["cafe", "desayuno", "almuerzo", "cena"]
};

const APP_CONFIG = {
  soda: process.env.HCB_SODA || "SUBWAY",
  tokenRefreshBufferMs: 60 * 1000,
  tokenCacheMs: 4 * 60 * 1000,
  consumoMethod: (process.env.HCB_CONSUMO_METHOD || "GET").toUpperCase(),
  integrationMode:
    String(process.env.HCB_INTEGRATION_MODE || "api").trim().toLowerCase() === "local"
      ? "local"
      : "api"
};

function pad(value, size = 2) {
  return String(value).padStart(size, "0");
}

function toCostaRicaWallDate(date = new Date()) {
  const sourceDate = date instanceof Date ? date : new Date(date);
  return new Date(sourceDate.getTime() + COSTA_RICA_UTC_OFFSET_MINUTES * 60 * 1000);
}

function getCostaRicaTimeSnapshot(date = new Date()) {
  const wallDate = toCostaRicaWallDate(date);
  const year = wallDate.getUTCFullYear();
  const month = wallDate.getUTCMonth() + 1;
  const day = wallDate.getUTCDate();
  const hour = wallDate.getUTCHours();
  const minute = wallDate.getUTCMinutes();
  const second = wallDate.getUTCSeconds();

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    minuteOfDay: hour * 60 + minute,
    clock: `${pad(hour)}:${pad(minute)}:${pad(second)}`,
    date: `${year}-${pad(month)}-${pad(day)}`
  };
}

function timeStringToMinutes(value) {
  const normalized = String(value || "").trim();
  const match = /^(\d{2}):(\d{2})$/.exec(normalized);
  if (!match) {
    return -1;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return -1;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return -1;
  }

  return hours * 60 + minutes;
}

function isMinuteInsideRange(minuteOfDay, startText, endText) {
  const start = timeStringToMinutes(startText);
  const end = timeStringToMinutes(endText);

  if (start < 0 || end < 0) {
    return false;
  }

  if (start <= end) {
    return minuteOfDay >= start && minuteOfDay <= end;
  }

  return minuteOfDay >= start || minuteOfDay <= end;
}

function isConsumoInSchedule(consumoKey, date = new Date()) {
  const key = String(consumoKey || "").trim().toLowerCase();
  const horario = CONSUMO_HORARIOS_CR[key];

  if (!horario) {
    return false;
  }

  const snapshot = getCostaRicaTimeSnapshot(date);
  return isMinuteInsideRange(snapshot.minuteOfDay, horario.start, horario.end);
}

function getCurrentConsumoSlot(date = new Date()) {
  const snapshot = getCostaRicaTimeSnapshot(date);
  const priority = ["desayuno", "almuerzo", "cena", "cafe"];

  for (const key of priority) {
    const horario = CONSUMO_HORARIOS_CR[key];
    if (!horario) {
      continue;
    }

    if (isMinuteInsideRange(snapshot.minuteOfDay, horario.start, horario.end)) {
      return key;
    }
  }

  return "cafe";
}

function getValidationOrderForCurrentSlot(date = new Date()) {
  const slot = getCurrentConsumoSlot(date);
  return VALIDATION_PRIORITY_BY_SLOT[slot] || VALIDATION_PRIORITY_BY_SLOT.cafe;
}

function getConsumosPublicos() {
  return Object.entries(CONSUMOS).map(([key, value]) => ({
    key,
    label: value.label,
    montoDefault: value.monto
  }));
}

module.exports = {
  CONSUMOS,
  CONSUMO_HORARIOS_CR,
  COSTA_RICA_UTC_OFFSET_MINUTES,
  getCostaRicaTimeSnapshot,
  getCurrentConsumoSlot,
  isConsumoInSchedule,
  getValidationOrderForCurrentSlot,
  APP_CONFIG,
  getConsumosPublicos
};
