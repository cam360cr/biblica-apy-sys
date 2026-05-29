const session = require("express-session");
const bcrypt = require("bcryptjs");

const ROLES = {
  ADMIN: "admin",
  SELLER: "seller"
};

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

  return res.status(401).json({
    ok: false,
    message: "Sesion no iniciada"
  });
}

function ensureRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.session?.user) {
      return res.status(401).json({
        ok: false,
        message: "Sesion no iniciada"
      });
    }

    if (!allowedRoles.includes(req.session.user.role)) {
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
