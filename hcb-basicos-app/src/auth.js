const session = require("express-session");
const bcrypt = require("bcryptjs");

const ROLES = {
  ADMIN: "admin",
  SELLER: "seller"
};

function getRequestIp(req) {
  const forwardedFor = String(req.headers?.["x-forwarded-for"] || "").trim();
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return String(req.ip || req.socket?.remoteAddress || "").trim();
}

function emitAuditEvent(req, payload) {
  const auditLogger = req.app?.locals?.auditLogger;
  if (typeof auditLogger !== "function") {
    return;
  }

  const sessionUser = req.session?.user || null;
  void auditLogger({
    level: payload.level || "warn",
    eventType: payload.eventType || "auth.unknown",
    success: payload.success === false ? false : true,
    username: payload.username || sessionUser?.username || "",
    userRole: payload.userRole || sessionUser?.role || "",
    ip: payload.ip || getRequestIp(req),
    method: req.method,
    path: req.originalUrl || req.path,
    statusCode: payload.statusCode,
    detail: payload.detail || "",
    metadata: payload.metadata || null
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeUser(value) {
  return normalizeText(value).toLowerCase();
}

function maybeMatchesHashedPassword(plainTextPassword, storedValue) {
  const value = normalizeText(storedValue);
  if (!value.startsWith("$2")) {
    return false;
  }

  try {
    return bcrypt.compareSync(plainTextPassword, value);
  } catch (_error) {
    return false;
  }
}

function matchesPassword(plainTextPassword, storedValue) {
  const normalizedStored = normalizeText(storedValue);
  return (
    plainTextPassword === normalizedStored ||
    maybeMatchesHashedPassword(plainTextPassword, normalizedStored)
  );
}

function getUsersFromEnv() {
  return [
    {
      username: normalizeUser(process.env.APP_ADMIN_USER || "admin"),
      password: normalizeText(process.env.APP_ADMIN_PASSWORD || "admin123"),
      role: ROLES.ADMIN,
      displayName: "Administrador"
    },
    {
      username: normalizeUser(process.env.APP_SELLER_USER || "vendedor"),
      password: normalizeText(process.env.APP_SELLER_PASSWORD || "vendedor123"),
      role: ROLES.SELLER,
      displayName: "Vendedor"
    }
  ];
}

function authenticateUser(username, password) {
  const normalizedUsername = normalizeUser(username);
  const normalizedPassword = normalizeText(password);

  if (!normalizedUsername || !normalizedPassword) {
    return null;
  }

  const users = getUsersFromEnv();
  const match = users.find((user) => user.username === normalizedUsername);

  if (!match || !matchesPassword(normalizedPassword, match.password)) {
    return null;
  }

  return {
    username: match.username,
    role: match.role,
    displayName: match.displayName
  };
}

function configureSessionMiddleware(app) {
  const sessionSecret = process.env.SESSION_SECRET || "hcb-basicos-session-secret";

  app.use(
    session({
      name: "hcb.sid",
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 12 * 60 * 60 * 1000
      }
    })
  );
}

function ensureAuthenticated(req, res, next) {
  if (req.session?.user) {
    return next();
  }

  emitAuditEvent(req, {
    level: "warn",
    eventType: "auth.session.missing",
    success: false,
    statusCode: 401,
    detail: "Solicitud sin sesion activa"
  });

  return res.status(401).json({
    ok: false,
    message: "Sesion no iniciada"
  });
}

function ensureRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.session?.user) {
      emitAuditEvent(req, {
        level: "warn",
        eventType: "auth.session.missing",
        success: false,
        statusCode: 401,
        detail: "Solicitud protegida sin sesion activa",
        metadata: {
          requiredRoles: allowedRoles
        }
      });

      return res.status(401).json({
        ok: false,
        message: "Sesion no iniciada"
      });
    }

    if (!allowedRoles.includes(req.session.user.role)) {
      emitAuditEvent(req, {
        level: "warn",
        eventType: "auth.role.denied",
        success: false,
        statusCode: 403,
        detail: "Usuario sin permisos para la accion solicitada",
        metadata: {
          requiredRoles: allowedRoles,
          currentRole: req.session.user.role
        }
      });

      return res.status(403).json({
        ok: false,
        message: "No tiene permisos para esta accion"
      });
    }

    return next();
  };
}

module.exports = {
  ROLES,
  authenticateUser,
  configureSessionMiddleware,
  ensureAuthenticated,
  ensureRole
};
