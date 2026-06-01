const ROLES = {
  ADMIN: "admin",
  SELLER: "seller"
};

const fallbackConsumos = [
  { key: "desayuno", label: "Desayuno", montoDefault: 6000 },
  { key: "almuerzo", label: "Almuerzo", montoDefault: 6000 },
  { key: "cena", label: "Cena", montoDefault: 6000 },
  { key: "cafe", label: "Café", montoDefault: 1000 }
];

const consumoIcons = {
  desayuno: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 8h13v5a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8Z" />
      <path d="M16 10h2a2 2 0 0 1 0 4h-2" />
      <path d="M7 21h7" />
      <path d="M10.5 17v4" />
      <path d="M7.2 5.2c0-.85.5-1.38 1.05-1.92" />
      <path d="M10.5 5.2c0-.85.5-1.38 1.05-1.92" />
    </svg>
  `,
  almuerzo: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 3v8" />
      <path d="M8 3v8" />
      <path d="M5 7h3" />
      <path d="M6.5 11v10" />
      <path d="M15.5 3v7" />
      <path d="M15.5 10 19 9v12" />
    </svg>
  `,
  cena: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 13h18" />
      <path d="M5 13a7 7 0 0 1 14 0" />
      <path d="M12 6V5" />
      <path d="M8.5 17h7" />
    </svg>
  `,
  cafe: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 8h11v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z" />
      <path d="M15 10h2a2 2 0 1 1 0 4h-2" />
      <path d="M7.2 5.2c0-.85.5-1.38 1.05-1.92" />
      <path d="M10.5 5.2c0-.85.5-1.38 1.05-1.92" />
    </svg>
  `,
  default: `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 12h16" />
      <path d="M8 8h8" />
      <path d="M6 16h12" />
    </svg>
  `
};

const COSTA_RICA_TIME_ZONE = "America/Costa_Rica";

const state = {
  currentUser: null,
  isSubmitting: false,
  isLoadingHistory: false,
  isLoadingDeletedHistory: false,
  isExporting: false,
  isDeletingTransaction: false,
  consumos: [],
  employeeCheck: null,
  canConsume: false,
  adminTab: "active",
  historyPageSize: 10,
  activePagination: {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1
  },
  deletedPagination: {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1
  },
  purchaseConfirmResolver: null
};

const SCAN_BARCODE_FORMATS = [
  "code_128",
  "code_39",
  "codabar",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "itf"
];

const ZXING_BROWSER_UMD_URL = "https://unpkg.com/@zxing/browser@0.2.0/umd/zxing-browser.min.js";

const scanRuntime = {
  stream: null,
  detector: null,
  active: false,
  timerId: null,
  zxingReader: null,
  zxingControls: null,
  zxingLoadPromise: null,
  engine: ""
};

const elements = {
  authSection: document.getElementById("auth-section"),
  appSection: document.getElementById("app-section"),
  loginForm: document.getElementById("login-form"),
  loginStatus: document.getElementById("login-status"),
  usernameInput: document.getElementById("username"),
  passwordInput: document.getElementById("password"),
  loginButton: document.getElementById("login-btn"),
  logoutButton: document.getElementById("logout-btn"),
  userName: document.getElementById("user-name"),
  userRole: document.getElementById("user-role"),
  registroForm: document.getElementById("registro-form"),
  entryGrid: document.getElementById("entry-grid"),
  codigoInput: document.getElementById("codigo"),
  scanDemoButton: document.getElementById("scan-demo-btn"),
  verifyCodeButton: document.getElementById("verify-code-btn"),
  scanModal: document.getElementById("scan-modal"),
  scanModalClose: document.getElementById("scan-modal-close"),
  scanModalAction: document.getElementById("scan-modal-action"),
  scanVideo: document.getElementById("scan-video"),
  scanModalStatus: document.getElementById("scan-modal-status"),
  purchaseConfirmModal: document.getElementById("purchase-confirm-modal"),
  purchaseConfirmClose: document.getElementById("purchase-confirm-close"),
  purchaseConfirmCancel: document.getElementById("purchase-confirm-cancel"),
  purchaseConfirmAccept: document.getElementById("purchase-confirm-accept"),
  purchaseConfirmCliente: document.getElementById("purchase-confirm-cliente"),
  purchaseConfirmConsumo: document.getElementById("purchase-confirm-consumo"),
  purchaseConfirmMonto: document.getElementById("purchase-confirm-monto"),
  employeeCheckStatus: document.getElementById("employee-check-status"),
  consumosSection: document.getElementById("consumos-section"),
  consumosGrid: document.getElementById("consumos-grid"),
  status: document.getElementById("status"),
  adminPanel: document.getElementById("admin-panel"),
  filtersForm: document.getElementById("filters-form"),
  filterDesde: document.getElementById("filter-desde"),
  filterHasta: document.getElementById("filter-hasta"),
  filterCodigo: document.getElementById("filter-codigo"),
  filterNombre: document.getElementById("filter-nombre"),
  filterConsumo: document.getElementById("filter-consumo"),
  filterEstado: document.getElementById("filter-estado"),
  filterButton: document.getElementById("filter-btn"),
  clearFiltersButton: document.getElementById("clear-filters-btn"),
  exportButton: document.getElementById("export-btn"),
  tabActiveButton: document.getElementById("tab-active-btn"),
  tabDeletedButton: document.getElementById("tab-deleted-btn"),
  activeTabPanel: document.getElementById("active-tab-panel"),
  deletedTabPanel: document.getElementById("deleted-tab-panel"),
  pageSizeSelect: document.getElementById("page-size-select"),
  activePrevPageButton: document.getElementById("active-prev-page-btn"),
  activeNextPageButton: document.getElementById("active-next-page-btn"),
  activePageInfo: document.getElementById("active-page-info"),
  deletedPrevPageButton: document.getElementById("deleted-prev-page-btn"),
  deletedNextPageButton: document.getElementById("deleted-next-page-btn"),
  deletedPageInfo: document.getElementById("deleted-page-info"),
  historyBody: document.getElementById("history-body"),
  deletedHistoryBody: document.getElementById("deleted-history-body")
};

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  wireEvents();
  await restoreSession();
}

function wireEvents() {
  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleLogin();
  });

  elements.logoutButton.addEventListener("click", async () => {
    await handleLogout();
  });

  elements.registroForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleVerifyCodigo();
  });

  elements.verifyCodeButton.addEventListener("click", async () => {
    await handleVerifyCodigo();
  });

  elements.codigoInput.addEventListener("input", () => {
    const currentCode = readCodigo();
    const validatedCode = state.employeeCheck?.codigo || "";

    if (state.employeeCheck && currentCode !== validatedCode) {
      resetEmployeeValidation();
    }
  });

  elements.codigoInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleVerifyCodigo();
    }
  });

  elements.scanDemoButton.addEventListener("click", () => {
    void openScanModal();
  });

  elements.scanModalClose.addEventListener("click", () => {
    closeScanModal();
  });

  elements.scanModalAction.addEventListener("click", () => {
    closeScanModal();
    focusCodigo();
  });

  elements.purchaseConfirmClose.addEventListener("click", () => {
    closePurchaseConfirmModal(false);
  });

  elements.purchaseConfirmCancel.addEventListener("click", () => {
    closePurchaseConfirmModal(false);
  });

  elements.purchaseConfirmAccept.addEventListener("click", () => {
    closePurchaseConfirmModal(true);
  });

  elements.scanModal.addEventListener("click", (event) => {
    if (event.target === elements.scanModal) {
      closeScanModal();
    }
  });

  elements.purchaseConfirmModal.addEventListener("click", (event) => {
    if (event.target === elements.purchaseConfirmModal) {
      closePurchaseConfirmModal(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.scanModal.classList.contains("hidden")) {
      closeScanModal();
    }

    if (event.key === "Escape" && !elements.purchaseConfirmModal.classList.contains("hidden")) {
      closePurchaseConfirmModal(false);
    }
  });

  elements.consumosGrid.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-consumo]");
    if (!button) {
      return;
    }

    await handleRegister(button.dataset.consumo);
  });

  elements.filtersForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    resetHistoryPages();
    await Promise.all([loadHistory(), loadDeletedHistory()]);
  });

  elements.clearFiltersButton.addEventListener("click", async () => {
    clearFilters();
    resetHistoryPages();
    await Promise.all([loadHistory(), loadDeletedHistory()]);
  });

  elements.tabActiveButton.addEventListener("click", () => {
    setAdminTab("active");
  });

  elements.tabDeletedButton.addEventListener("click", () => {
    setAdminTab("deleted");
  });

  elements.pageSizeSelect.addEventListener("change", async () => {
    const nextSize = Number.parseInt(elements.pageSizeSelect.value, 10);
    if (![10, 20, 50, 100].includes(nextSize)) {
      return;
    }

    state.historyPageSize = nextSize;
    state.activePagination.limit = nextSize;
    state.deletedPagination.limit = nextSize;
    resetHistoryPages();
    await Promise.all([loadHistory(), loadDeletedHistory()]);
  });

  elements.activePrevPageButton.addEventListener("click", async () => {
    if (state.activePagination.page <= 1) {
      return;
    }

    state.activePagination.page -= 1;
    await loadHistory();
  });

  elements.activeNextPageButton.addEventListener("click", async () => {
    if (state.activePagination.page >= state.activePagination.totalPages) {
      return;
    }

    state.activePagination.page += 1;
    await loadHistory();
  });

  elements.deletedPrevPageButton.addEventListener("click", async () => {
    if (state.deletedPagination.page <= 1) {
      return;
    }

    state.deletedPagination.page -= 1;
    await loadDeletedHistory();
  });

  elements.deletedNextPageButton.addEventListener("click", async () => {
    if (state.deletedPagination.page >= state.deletedPagination.totalPages) {
      return;
    }

    state.deletedPagination.page += 1;
    await loadDeletedHistory();
  });

  elements.exportButton.addEventListener("click", async () => {
    await exportHistory();
  });

  elements.historyBody.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-delete-transaction]");
    if (!button) {
      return;
    }

    await handleDeleteTransaction(button.dataset.deleteTransaction);
  });
}

function isAdmin() {
  return state.currentUser?.role === ROLES.ADMIN;
}

function resetHistoryPages() {
  state.activePagination.page = 1;
  state.deletedPagination.page = 1;
}

function setAdminTab(tab) {
  state.adminTab = tab === "deleted" ? "deleted" : "active";

  const isActive = state.adminTab === "active";
  elements.tabActiveButton.classList.toggle("is-active", isActive);
  elements.tabDeletedButton.classList.toggle("is-active", !isActive);
  elements.tabActiveButton.setAttribute("aria-selected", isActive ? "true" : "false");
  elements.tabDeletedButton.setAttribute("aria-selected", isActive ? "false" : "true");
  elements.activeTabPanel.classList.toggle("hidden", !isActive);
  elements.deletedTabPanel.classList.toggle("hidden", isActive);
}

function sanitizePaginationPayload(pagination, fallbackLimit) {
  const safeLimit = Number.isInteger(fallbackLimit) && fallbackLimit > 0 ? fallbackLimit : 10;
  const total = Number(pagination?.total || 0);
  const limit = Number(pagination?.limit || safeLimit) || safeLimit;
  const totalPages = Math.max(1, Number(pagination?.totalPages || 1));
  const page = Math.min(
    Math.max(1, Number(pagination?.page || 1)),
    totalPages
  );

  return {
    page,
    limit,
    total: Number.isFinite(total) && total > 0 ? Math.floor(total) : 0,
    totalPages
  };
}

function renderPaginationControls(kind) {
  const isActiveKind = kind === "active";
  const pagination = isActiveKind ? state.activePagination : state.deletedPagination;
  const loading = isActiveKind ? state.isLoadingHistory : state.isLoadingDeletedHistory;
  const isBusy =
    loading ||
    state.isLoadingHistory ||
    state.isLoadingDeletedHistory ||
    state.isExporting ||
    state.isDeletingTransaction;

  const previousButton = isActiveKind
    ? elements.activePrevPageButton
    : elements.deletedPrevPageButton;
  const nextButton = isActiveKind
    ? elements.activeNextPageButton
    : elements.deletedNextPageButton;
  const pageInfo = isActiveKind ? elements.activePageInfo : elements.deletedPageInfo;

  previousButton.disabled = isBusy || pagination.page <= 1;
  nextButton.disabled = isBusy || pagination.page >= pagination.totalPages;
  pageInfo.textContent = `Página ${pagination.page} de ${pagination.totalPages} (${pagination.total} registros)`;
}

function setLoginStatus(message, type = "info") {
  elements.loginStatus.textContent = message;
  elements.loginStatus.className = `status ${type}`;
}

function setStatus(message, type = "info") {
  if (!message) {
    elements.status.textContent = "";
    elements.status.classList.add("hidden");
    return;
  }

  elements.status.classList.remove("hidden");
  elements.status.textContent = message;
  elements.status.className = `status ${type}`;
}

function setEmployeeCheckStatus(message, type = "info") {
  if (!message) {
    elements.employeeCheckStatus.textContent = "";
    elements.employeeCheckStatus.classList.add("hidden");
    return;
  }

  elements.employeeCheckStatus.classList.remove("hidden");
  elements.employeeCheckStatus.textContent = message;
  elements.employeeCheckStatus.className = `status ${type}`;
}

function setConsumosSectionVisible(visible) {
  elements.consumosSection.classList.toggle("hidden", !visible);
}

function setRegistrationFieldsVisible(visible) {
  elements.entryGrid.classList.add("single-mode");
}

function resetEmployeeValidation() {
  state.employeeCheck = null;
  state.canConsume = false;
  setRegistrationFieldsVisible(false);
  setConsumosSectionVisible(false);
  setEmployeeCheckStatus("");
}

function showAuthSection() {
  elements.authSection.classList.remove("hidden");
  elements.appSection.classList.add("hidden");
}

function showAppSection() {
  elements.authSection.classList.add("hidden");
  elements.appSection.classList.remove("hidden");
}

function renderSessionInfo() {
  const user = state.currentUser;
  if (!user) {
    elements.userName.textContent = "-";
    elements.userRole.textContent = "-";
    return;
  }

  elements.userName.textContent = user.displayName || user.username;
  elements.userRole.textContent = user.role === ROLES.ADMIN ? "Administrador" : "Vendedor";
}

function focusCodigo() {
  window.requestAnimationFrame(() => {
    elements.codigoInput.focus();
    elements.codigoInput.select();
  });
}

function clearRegistroInputs() {
  elements.codigoInput.value = "";
  resetEmployeeValidation();
}

function setScanModalStatus(message, type = "info") {
  if (!elements.scanModalStatus) {
    return;
  }

  const text = String(message || "").trim();
  if (!text) {
    elements.scanModalStatus.textContent = "";
    elements.scanModalStatus.classList.add("hidden");
    return;
  }

  elements.scanModalStatus.classList.remove("hidden");
  elements.scanModalStatus.className = `status ${type} scan-modal-status`;
  elements.scanModalStatus.textContent = text;
}

function sanitizeScannedCodigo(rawValue) {
  const normalized = String(rawValue || "")
    .trim()
    .replace(/\s+/g, "");

  if (!normalized) {
    return "";
  }

  const cleaned = normalized.replace(/[^0-9A-Za-z-]/g, "");
  return cleaned.slice(0, 30);
}

async function getBarcodeDetector() {
  if (scanRuntime.detector) {
    return scanRuntime.detector;
  }

  if (typeof window.BarcodeDetector !== "function") {
    return null;
  }

  try {
    if (typeof window.BarcodeDetector.getSupportedFormats === "function") {
      const supportedFormats = await window.BarcodeDetector.getSupportedFormats();
      const preferredFormats = SCAN_BARCODE_FORMATS.filter((format) =>
        supportedFormats.includes(format)
      );

      scanRuntime.detector =
        preferredFormats.length > 0
          ? new window.BarcodeDetector({ formats: preferredFormats })
          : new window.BarcodeDetector();
    } else {
      scanRuntime.detector = new window.BarcodeDetector();
    }

    return scanRuntime.detector;
  } catch (_error) {
    return null;
  }
}

function getPreferredZxingFormats(zxingRuntime) {
  const barcodeFormat = zxingRuntime?.BarcodeFormat;
  if (!barcodeFormat) {
    return [];
  }

  const preferred = [
    barcodeFormat.CODE_128,
    barcodeFormat.CODE_39,
    barcodeFormat.CODABAR,
    barcodeFormat.EAN_13,
    barcodeFormat.EAN_8,
    barcodeFormat.UPC_A,
    barcodeFormat.UPC_E,
    barcodeFormat.ITF
  ];

  return preferred.filter((item) => Number.isInteger(item));
}

async function loadZxingBrowserRuntime() {
  if (window.ZXingBrowser) {
    return window.ZXingBrowser;
  }

  if (!scanRuntime.zxingLoadPromise) {
    scanRuntime.zxingLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = ZXING_BROWSER_UMD_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.ZXingBrowser) {
          resolve(window.ZXingBrowser);
          return;
        }

        reject(new Error("No se pudo inicializar la libreria de escaneo."));
      };
      script.onerror = () => {
        reject(new Error("No se pudo cargar el lector de codigos para este navegador."));
      };

      document.head.appendChild(script);
    }).finally(() => {
      scanRuntime.zxingLoadPromise = null;
    });
  }

  return scanRuntime.zxingLoadPromise;
}

async function startZxingFallbackScan() {
  if (!scanRuntime.active || !elements.scanVideo) {
    return;
  }

  if (scanRuntime.zxingControls) {
    return;
  }

  const zxingRuntime = await loadZxingBrowserRuntime();
  if (!scanRuntime.active || !elements.scanVideo) {
    return;
  }

  const ReaderConstructor = zxingRuntime?.BrowserMultiFormatReader;
  if (typeof ReaderConstructor !== "function") {
    throw new Error("No fue posible iniciar la compatibilidad de escaneo en este navegador.");
  }

  if (!scanRuntime.zxingReader) {
    scanRuntime.zxingReader = new ReaderConstructor();
  }

  const preferredFormats = getPreferredZxingFormats(zxingRuntime);
  if (preferredFormats.length > 0) {
    scanRuntime.zxingReader.possibleFormats = preferredFormats;
  }

  scanRuntime.engine = "zxing";
  scanRuntime.zxingControls = await scanRuntime.zxingReader.decodeFromVideoElement(
    elements.scanVideo,
    (result, _error, controls) => {
      if (!scanRuntime.active) {
        return;
      }

      if (controls && !scanRuntime.zxingControls) {
        scanRuntime.zxingControls = controls;
      }

      if (!result) {
        return;
      }

      const rawValue =
        typeof result.getText === "function"
          ? result.getText()
          : String(result.text || result.rawValue || "");

      if (rawValue) {
        onBarcodeScanned(rawValue);
      }
    }
  );
}

async function startScanCameraStream() {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    throw new Error("Este navegador no permite abrir cámara para escanear.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  });

  scanRuntime.stream = stream;

  if (elements.scanVideo) {
    elements.scanVideo.srcObject = stream;
    await elements.scanVideo.play();
  }
}

async function getCameraPermissionState() {
  if (!navigator.permissions || typeof navigator.permissions.query !== "function") {
    return "";
  }

  try {
    const result = await navigator.permissions.query({ name: "camera" });
    return String(result?.state || "").trim().toLowerCase();
  } catch (_error) {
    return "";
  }
}

function isPrivateNetworkHost(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) {
    return false;
  }

  if (host.endsWith(".local")) {
    return true;
  }

  const ipv4Match = /^(\d{1,3})(?:\.(\d{1,3})){3}$/.exec(host);
  if (!ipv4Match) {
    return false;
  }

  const parts = host.split(".").map((item) => Number(item));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  if (parts[0] === 10) {
    return true;
  }

  if (parts[0] === 192 && parts[1] === 168) {
    return true;
  }

  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }

  return false;
}

function getCameraOpenErrorMessage(error, permissionState = "") {
  const name = String(error?.name || "").trim();
  const rawMessage = String(error?.message || "").trim();
  const normalizedRawMessage = rawMessage.toLowerCase();

  if (!window.isSecureContext) {
    const host = String(window.location?.hostname || "").trim();
    if (isPrivateNetworkHost(host)) {
      return "Está usando la app por IP local (http://...) y el navegador móvil bloquea la cámara en sitios no seguros. Abra la app con HTTPS (por ejemplo con un túnel HTTPS) o desde localhost en el mismo dispositivo.";
    }

    return "El navegador bloqueó la cámara porque el sitio no es seguro. Abra la app en localhost o HTTPS.";
  }

  if (
    permissionState === "denied" ||
    name === "NotAllowedError" ||
    normalizedRawMessage.includes("permission denied") ||
    normalizedRawMessage.includes("permission denied by system")
  ) {
    return "Permiso de cámara denegado. Habilítelo en el candado del navegador para este sitio y vuelva a intentar. En Windows también revise Configuración > Privacidad y seguridad > Cámara.";
  }

  if (name === "NotFoundError" || normalizedRawMessage.includes("requested device not found")) {
    return "No se detectó una cámara disponible en este equipo.";
  }

  if (
    name === "NotReadableError" ||
    normalizedRawMessage.includes("could not start video source") ||
    normalizedRawMessage.includes("device in use")
  ) {
    return "La cámara está en uso por otra aplicación. Cierre la app que la esté usando y vuelva a intentar.";
  }

  if (name === "OverconstrainedError") {
    return "No se pudo abrir la cámara con la configuración solicitada. Intente nuevamente.";
  }

  if (rawMessage) {
    return `No se pudo abrir la cámara: ${rawMessage}`;
  }

  return "No se pudo abrir la cámara. Revise permisos del navegador y del sistema operativo.";
}

function stopScanCameraStream() {
  scanRuntime.active = false;
  scanRuntime.engine = "";

  if (scanRuntime.timerId !== null) {
    window.clearTimeout(scanRuntime.timerId);
    scanRuntime.timerId = null;
  }

  if (scanRuntime.zxingControls && typeof scanRuntime.zxingControls.stop === "function") {
    try {
      scanRuntime.zxingControls.stop();
    } catch (_error) {
      // Si el lector ya fue detenido, solo se continúa con el cierre.
    }
  }
  scanRuntime.zxingControls = null;

  if (scanRuntime.stream) {
    const tracks = scanRuntime.stream.getTracks();
    tracks.forEach((track) => track.stop());
    scanRuntime.stream = null;
  }

  if (elements.scanVideo) {
    elements.scanVideo.srcObject = null;
  }
}

function onBarcodeScanned(codigo) {
  const parsedCodigo = sanitizeScannedCodigo(codigo);
  if (!parsedCodigo) {
    setScanModalStatus("No se pudo leer un código válido. Intente nuevamente.", "error");
    return;
  }

  closeScanModal();
  elements.codigoInput.value = parsedCodigo;
  focusCodigo();
  void handleVerifyCodigo();
}

function scheduleScanStep(delayMs = 140) {
  if (!scanRuntime.active) {
    return;
  }

  if (scanRuntime.timerId !== null) {
    window.clearTimeout(scanRuntime.timerId);
  }

  scanRuntime.timerId = window.setTimeout(() => {
    void runScanStep();
  }, delayMs);
}

async function runScanStep() {
  if (!scanRuntime.active) {
    return;
  }

  const detector = await getBarcodeDetector();
  if (!detector) {
    try {
      setScanModalStatus(
        "Este navegador no tiene lector nativo. Cargando compatibilidad de escaneo...",
        "loading"
      );
      await startZxingFallbackScan();
      if (scanRuntime.active) {
        setScanModalStatus("Escaneando... acerque el código de barras al recuadro.", "info");
      }
    } catch (error) {
      const detail = String(error?.message || "").trim();
      const baseMessage =
        "La cámara se abrió, pero no fue posible habilitar lectura automática en este navegador. Use digitación manual.";
      setScanModalStatus(detail ? `${baseMessage} ${detail}` : baseMessage, "error");
      stopScanCameraStream();
      if (elements.scanModalAction) {
        elements.scanModalAction.focus();
      }
    }
    return;
  }

  scanRuntime.engine = "barcode-detector";

  if (!elements.scanVideo || elements.scanVideo.readyState < 2) {
    scheduleScanStep(160);
    return;
  }

  try {
    const detections = await detector.detect(elements.scanVideo);
    if (Array.isArray(detections) && detections.length > 0) {
      const rawValue = String(detections[0]?.rawValue || "").trim();
      if (rawValue) {
        onBarcodeScanned(rawValue);
        return;
      }
    }
  } catch (_error) {
    // Se continúa escaneando mientras no se cierre el modal.
  }

  scheduleScanStep(140);
}

async function openScanModal() {
  elements.scanModal.classList.remove("hidden");
  setScanModalStatus("Solicitando acceso a la cámara...", "loading");

  try {
    const permissionState = await getCameraPermissionState();
    if (permissionState === "denied") {
      throw new Error(getCameraOpenErrorMessage({ name: "NotAllowedError" }, permissionState));
    }

    await startScanCameraStream();
    scanRuntime.active = true;
    setScanModalStatus("Iniciando escáner...", "loading");
    scheduleScanStep(220);
  } catch (error) {
    stopScanCameraStream();
    const permissionState = await getCameraPermissionState();
    setScanModalStatus(getCameraOpenErrorMessage(error, permissionState), "error");

    if (elements.scanModalAction) {
      elements.scanModalAction.focus();
    }
  }
}

function closeScanModal() {
  stopScanCameraStream();
  elements.scanModal.classList.add("hidden");
  setScanModalStatus("");
}

function getConsumoLabel(consumoKey) {
  const key = String(consumoKey || "").trim().toLowerCase();
  const fromState = state.consumos.find((item) => item.key === key)?.label;
  if (fromState) {
    return fromState;
  }

  const fromFallback = fallbackConsumos.find((item) => item.key === key)?.label;
  if (fromFallback) {
    return fromFallback;
  }

  return key || "-";
}

function getClienteDisplayName(codigo) {
  const nombre = String(state.employeeCheck?.nombreEmpleado || "").trim();
  if (nombre) {
    return nombre;
  }

  const code = String(codigo || "").trim();
  return code ? `Código ${code}` : "Sin cliente";
}

function closePurchaseConfirmModal(confirmed) {
  elements.purchaseConfirmModal.classList.add("hidden");
  const resolver = state.purchaseConfirmResolver;
  state.purchaseConfirmResolver = null;

  if (typeof resolver === "function") {
    resolver(Boolean(confirmed));
  }
}

function openPurchaseConfirmModal({ cliente, consumo, monto }) {
  if (state.purchaseConfirmResolver) {
    closePurchaseConfirmModal(false);
  }

  elements.purchaseConfirmCliente.textContent = cliente;
  elements.purchaseConfirmConsumo.textContent = consumo;
  elements.purchaseConfirmMonto.textContent = formatMonto(monto);
  elements.purchaseConfirmModal.classList.remove("hidden");

  window.requestAnimationFrame(() => {
    elements.purchaseConfirmAccept.focus();
  });

  return new Promise((resolve) => {
    state.purchaseConfirmResolver = resolve;
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseServerDateValue(dateValue) {
  if (dateValue instanceof Date) {
    return Number.isNaN(dateValue.getTime()) ? null : dateValue;
  }

  const raw = String(dateValue || "").trim();
  if (!raw) {
    return null;
  }

  const sqliteUtcMatch = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d{1,3})?$/.exec(raw);
  if (sqliteUtcMatch) {
    const isoValue = `${sqliteUtcMatch[1]}T${sqliteUtcMatch[2]}${sqliteUtcMatch[3] || ""}Z`;
    const parsedSqliteDate = new Date(isoValue);
    if (!Number.isNaN(parsedSqliteDate.getTime())) {
      return parsedSqliteDate;
    }
  }

  const isoWithoutZoneMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)$/.exec(
    raw
  );
  if (isoWithoutZoneMatch) {
    const parsedIsoWithoutZone = new Date(`${isoWithoutZoneMatch[1]}T${isoWithoutZoneMatch[2]}Z`);
    if (!Number.isNaN(parsedIsoWithoutZone.getTime())) {
      return parsedIsoWithoutZone;
    }
  }

  const parsedDate = new Date(raw);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  return null;
}

function formatDate(dateValue) {
  const date = parseServerDateValue(dateValue);
  if (!date) {
    return "-";
  }

  return date.toLocaleString("es-CR", {
    timeZone: COSTA_RICA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function formatMonto(monto) {
  return `₡${Number(monto || 0).toLocaleString("es-CR")}`;
}

function readCodigo() {
  return elements.codigoInput.value.trim();
}

function toPositiveAmount(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getMontoDefaultForConsumo(consumoKey) {
  const key = String(consumoKey || "").trim().toLowerCase();
  if (!key) {
    return null;
  }

  const fromEmployeeCheck = Array.isArray(state.employeeCheck?.consumos)
    ? state.employeeCheck.consumos.find((item) => String(item?.key || "").trim().toLowerCase() === key)
        ?.montoDefault
    : null;
  const fromState = state.consumos.find((item) => String(item?.key || "").trim().toLowerCase() === key)
    ?.montoDefault;
  const fromFallback = fallbackConsumos.find((item) => item.key === key)?.montoDefault;

  return (
    toPositiveAmount(fromEmployeeCheck) ||
    toPositiveAmount(fromState) ||
    toPositiveAmount(fromFallback)
  );
}

function validateRegistroInputs() {
  const codigo = readCodigo();
  if (!codigo) {
    setStatus("Debe digitar un código antes de elegir el consumo.", "error");
    focusCodigo();
    return false;
  }

  if (!state.employeeCheck || state.employeeCheck.codigo !== codigo) {
    setStatus("Primero debe verificar el código de empleado.", "error");
    setEmployeeCheckStatus("Código pendiente de verificación.", "error");
    focusCodigo();
    return false;
  }

  if (!state.canConsume) {
    setStatus("Este código no está habilitado para registrar consumos.", "error");
    focusCodigo();
    return false;
  }

  setStatus("Datos listos. Seleccione el tipo de consumo.", "info");
  return true;
}

async function handleVerifyCodigo({ keepMainStatus = false, fromSuccessfulRegister = false } = {}) {
  if (state.isSubmitting) {
    return;
  }

  const codigo = readCodigo();
  if (!codigo) {
    resetEmployeeValidation();
    setStatus("Debe digitar un código para validar.", "error");
    focusCodigo();
    return;
  }

  elements.verifyCodeButton.disabled = true;
  setEmployeeCheckStatus("Validando código de empleado...", "loading");

  try {
    const payload = await fetchJson("/api/empleado/estado", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ codigo })
    });

    if (!payload?.ok || !payload.data) {
      throw new Error("Respuesta inválida al validar empleado.");
    }

    state.employeeCheck = payload.data;
    state.canConsume = Boolean(payload.data.puedeConsumir);

    const isValidAndActive = payload.data.registrado !== false && payload.data.activo !== false;

    renderConsumos(payload.data.consumos);
    setRegistrationFieldsVisible(isValidAndActive);
    setConsumosSectionVisible(isValidAndActive);
    const employeeName = String(payload.data.nombreEmpleado || "").trim();
    const employeeStatusMessage = payload.data.mensajeEstado || "Código validado.";
    const unavailableMessage = "El código no está habilitado para consumir en este momento.";
    const noMoreConsumesAfterSuccessMessage =
      "Consumo registrado correctamente. Ya no hay más consumos disponibles para hoy.";
    const showPostSuccessNoMoreConsumes =
      fromSuccessfulRegister && !state.canConsume && isValidAndActive;
    const showUnavailableAfterName = employeeName && !state.canConsume && isValidAndActive;
    const employeeDisplayMessage = showPostSuccessNoMoreConsumes
      ? employeeName
        ? `Empleado: ${employeeName}. ${noMoreConsumesAfterSuccessMessage}`
        : noMoreConsumesAfterSuccessMessage
      : employeeName
        ? showUnavailableAfterName
          ? `Empleado: ${employeeName}. ${unavailableMessage}`
          : `Empleado: ${employeeName}.`
        : employeeStatusMessage;
    const employeeStatusType = showPostSuccessNoMoreConsumes
      ? "success"
      : state.canConsume && isValidAndActive
        ? "success"
        : "error";

    setEmployeeCheckStatus(employeeDisplayMessage, employeeStatusType);

    if (!isValidAndActive) {
      if (!keepMainStatus) {
        setStatus("Código no válido o empleado inactivo.", "error");
      }
      focusCodigo();
      return;
    }

    if (!state.canConsume) {
      if (!keepMainStatus) {
        setStatus("El código no está habilitado para consumir en este momento.", "error");
      }
      focusCodigo();
      return;
    }

    if (!keepMainStatus) {
      setStatus("");
    }
  } catch (error) {
    state.employeeCheck = null;
    state.canConsume = false;
    setRegistrationFieldsVisible(false);
    setConsumosSectionVisible(false);
    setEmployeeCheckStatus(`No se pudo validar: ${error.message}`, "error");

    if (!keepMainStatus) {
      setStatus("Error de validación. Revise el código e intente nuevamente.", "error");
    }

    focusCodigo();
  } finally {
    elements.verifyCodeButton.disabled = false;
  }
}

async function fetchJson(url, options = {}, { allowUnauthorized = false } = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options
  });

  const contentType = response.headers.get("content-type") || "";
  let payload = null;

  if (contentType.includes("application/json")) {
    payload = await response.json();
  }

  if (!response.ok) {
    if (response.status === 401 && !allowUnauthorized) {
      forceSignOutUI("Sesión expirada, vuelva a iniciar sesión.");
    }

    throw new Error(payload?.detail || payload?.message || `Error ${response.status}`);
  }

  return payload;
}

function forceSignOutUI(message) {
  state.currentUser = null;
  resetEmployeeValidation();
  showAuthSection();
  setLoginStatus(message, "error");
}

async function restoreSession() {
  try {
    const payload = await fetchJson("/api/auth/me", {}, { allowUnauthorized: true });
    state.currentUser = payload.data;
    await afterSignIn();
  } catch (_error) {
    state.currentUser = null;
    showAuthSection();
    setLoginStatus("Ingrese sus credenciales para continuar.", "info");
  }
}

async function handleLogin() {
  const username = elements.usernameInput.value.trim();
  const password = elements.passwordInput.value;

  if (!username || !password) {
    setLoginStatus("Debe ingresar usuario y contraseña.", "error");
    return;
  }

  elements.loginButton.disabled = true;
  setLoginStatus("Validando credenciales...", "loading");

  try {
    const payload = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    state.currentUser = payload.data;
    elements.passwordInput.value = "";
    await afterSignIn();
  } catch (error) {
    setLoginStatus(`No se pudo iniciar sesión: ${error.message}`, "error");
  } finally {
    elements.loginButton.disabled = false;
  }
}

async function afterSignIn() {
  renderSessionInfo();
  showAppSection();
  setLoginStatus("Sesión iniciada correctamente.", "success");
  await loadConsumos();
  resetEmployeeValidation();

  if (isAdmin()) {
    elements.adminPanel.classList.remove("hidden");
    state.historyPageSize = 10;
    state.activePagination.limit = 10;
    state.deletedPagination.limit = 10;
    resetHistoryPages();
    elements.pageSizeSelect.value = "10";
    setAdminTab("active");
    renderPaginationControls("active");
    renderPaginationControls("deleted");
    await Promise.all([loadHistory(), loadDeletedHistory()]);
  } else {
    elements.adminPanel.classList.add("hidden");
    elements.historyBody.innerHTML =
      '<tr><td colspan="8" class="empty-row">Historial disponible solo para administradores.</td></tr>';
    elements.deletedHistoryBody.innerHTML =
      '<tr><td colspan="8" class="empty-row">Historial disponible solo para administradores.</td></tr>';
  }

  setStatus("");
  focusCodigo();
}

async function handleLogout() {
  elements.logoutButton.disabled = true;

  try {
    await fetchJson("/api/auth/logout", { method: "POST" }, { allowUnauthorized: true });
  } catch (_error) {
    // No se bloquea el cierre local de sesión si ya expiró en backend.
  }

  state.currentUser = null;
  clearRegistroInputs();
  showAuthSection();
  setLoginStatus("Sesión cerrada.", "info");
  elements.logoutButton.disabled = false;
}

function setSubmitting(value) {
  state.isSubmitting = value;
  const buttons = elements.consumosGrid.querySelectorAll("button[data-consumo]");
  buttons.forEach((button) => {
    const isAvailable = button.dataset.disponible === "1";
    button.disabled = value || !isAvailable;
  });

  elements.codigoInput.disabled = value;
  elements.scanDemoButton.disabled = value;
  elements.verifyCodeButton.disabled = value;
  elements.status.setAttribute("aria-busy", value ? "true" : "false");
}

function setAdminActionsDisabled(value) {
  elements.filterButton.disabled = value;
  elements.clearFiltersButton.disabled = value;
  elements.exportButton.disabled = value;
  elements.pageSizeSelect.disabled = value;
  elements.tabActiveButton.disabled = value;
  elements.tabDeletedButton.disabled = value;
  elements.activePrevPageButton.disabled = value;
  elements.activeNextPageButton.disabled = value;
  elements.deletedPrevPageButton.disabled = value;
  elements.deletedNextPageButton.disabled = value;
  const deleteButtons = elements.historyBody.querySelectorAll("button[data-delete-transaction]");
  deleteButtons.forEach((button) => {
    button.disabled = value;
  });

  if (!value) {
    renderPaginationControls("active");
    renderPaginationControls("deleted");
  }
}

function renderConsumos(consumosDisponibles = []) {
  const items =
    Array.isArray(consumosDisponibles) && consumosDisponibles.length > 0
      ? consumosDisponibles
      : state.consumos.map((item) => ({
          key: item.key,
          label: item.label,
          disponible: false,
          motivo: "Valide el código para habilitar consumos."
        }));

  elements.consumosGrid.innerHTML = items
    .map((consumo) => {
      const consumoKey = String(consumo.key || "").trim().toLowerCase();
      const iconSvg = consumoIcons[consumoKey] || consumoIcons.default;
      const disponible = Boolean(consumo.disponible);
      const montoDefault = toPositiveAmount(consumo.montoDefault);
      const motivoBase = consumo.motivo || (disponible ? "Disponible" : "No disponible");
      const motivo = montoDefault
        ? `${motivoBase}. Monto por defecto: ${formatMonto(montoDefault)}`
        : motivoBase;
      const disabledClass = disponible ? "" : " not-available";
      const metaClass = disponible ? "is-available" : "is-unavailable";

      return `
        <button
          type="button"
          class="consumo-btn${disabledClass}"
          data-consumo="${escapeHtml(consumo.key)}"
          data-disponible="${disponible ? "1" : "0"}"
          ${disponible && !state.isSubmitting ? "" : "disabled"}
        >
          <span class="consumo-icon-wrap">${iconSvg}</span>
          <span class="consumo-content-wrap">
            <span class="consumo-label">${escapeHtml(consumo.label)}</span>
            <span class="consumo-meta ${metaClass}">${escapeHtml(motivo)}</span>
          </span>
        </button>
      `;
    })
    .join("");

  renderConsumosFilterOptions();
}

function renderConsumosFilterOptions() {
  const currentValue = elements.filterConsumo.value;
  const options = [
    '<option value="">Todos</option>',
    ...state.consumos.map(
      (consumo) => `<option value="${escapeHtml(consumo.key)}">${escapeHtml(consumo.label)}</option>`
    )
  ];

  elements.filterConsumo.innerHTML = options.join("");

  if (
    currentValue &&
    state.consumos.some((consumo) => consumo.key === currentValue)
  ) {
    elements.filterConsumo.value = currentValue;
  }
}

async function loadConsumos() {
  try {
    const payload = await fetchJson("/api/consumos");

    if (!payload?.ok || !Array.isArray(payload.data)) {
      throw new Error("No se pudo cargar configuración de consumos.");
    }

    state.consumos = payload.data;
  } catch (_error) {
    state.consumos = fallbackConsumos;
    setStatus("Usando consumos locales por error de conexión.", "error");
  }

  renderConsumos();
}

function buildHistoryQuery({ eliminado, page = 1, includePagination = true } = {}) {
  const params = new URLSearchParams();

  const desde = elements.filterDesde.value;
  const hasta = elements.filterHasta.value;
  const codigo = elements.filterCodigo.value.trim();
  const nombre = elements.filterNombre.value.trim();
  const consumo = elements.filterConsumo.value;
  const estado = elements.filterEstado.value;

  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);
  if (codigo) params.set("codigo", codigo);
  if (nombre) params.set("nombre", nombre);
  if (consumo) params.set("consumo", consumo);
  if (estado) params.set("estado", estado);
  if (eliminado !== undefined && eliminado !== null) {
    params.set("eliminado", String(eliminado));
  }

  if (includePagination) {
    params.set("page", String(page));
    params.set("limit", String(state.historyPageSize));
  }

  return params.toString();
}

function clearFilters() {
  elements.filterDesde.value = "";
  elements.filterHasta.value = "";
  elements.filterCodigo.value = "";
  elements.filterNombre.value = "";
  elements.filterConsumo.value = "";
  elements.filterEstado.value = "";
}

function renderHistory(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    elements.historyBody.innerHTML =
      '<tr><td colspan="8" class="empty-row">No hay transacciones para este filtro.</td></tr>';
    return;
  }

  elements.historyBody.innerHTML = rows
    .map((row) => {
      const statusClass = row.estado === "exitoso" ? "exitoso" : "fallido";
      const canDelete = row.estado === "exitoso" && Number(row.eliminado) !== 1;

      return `
        <tr>
          <td>${escapeHtml(formatDate(row.fecha || row.created_at))}</td>
          <td>${escapeHtml(row.nombre_empleado || "-")}</td>
          <td>${escapeHtml(row.codigo_empleado || "-")}</td>
          <td>${escapeHtml(row.tipo_consumo || "-")}</td>
          <td>${escapeHtml(formatMonto(row.monto))}</td>
          <td><span class="estado-badge ${statusClass}">${escapeHtml(row.estado || "-")}</span></td>
          <td>${escapeHtml(row.numero_transaccion || "-")}</td>
          <td>
            ${
              canDelete
                ? `<button
                    type="button"
                    class="danger-btn"
                    data-delete-transaction="${escapeHtml(row.id)}"
                    ${state.isDeletingTransaction ? "disabled" : ""}
                  >Eliminar</button>`
                : "-"
            }
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderDeletedHistory(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    elements.deletedHistoryBody.innerHTML =
      '<tr><td colspan="8" class="empty-row">No hay transacciones eliminadas para este filtro.</td></tr>';
    return;
  }

  elements.deletedHistoryBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(formatDate(row.fecha || row.created_at))}</td>
          <td>${escapeHtml(formatDate(row.eliminado_at || ""))}</td>
          <td>${escapeHtml(row.nombre_empleado || "-")}</td>
          <td>${escapeHtml(row.codigo_empleado || "-")}</td>
          <td>${escapeHtml(row.tipo_consumo || "-")}</td>
          <td>${escapeHtml(formatMonto(row.monto))}</td>
          <td>${escapeHtml(row.numero_transaccion || "-")}</td>
          <td>${escapeHtml(row.eliminado_por || "-")}</td>
        </tr>
      `
    )
    .join("");
}

async function loadHistory() {
  if (!isAdmin() || state.isLoadingHistory) {
    return;
  }

  state.isLoadingHistory = true;
  setAdminActionsDisabled(true);

  try {
    const query = buildHistoryQuery({
      eliminado: 0,
      page: state.activePagination.page
    });
    const payload = await fetchJson(`/api/historial?${query}`);

    const rows = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : null;

    if (!payload?.ok || !Array.isArray(rows)) {
      throw new Error("No se pudo obtener historial.");
    }

    state.activePagination = sanitizePaginationPayload(
      payload.pagination,
      state.historyPageSize
    );
    if (!payload.pagination) {
      state.activePagination.total = rows.length;
      state.activePagination.totalPages = 1;
      state.activePagination.page = 1;
    }
    renderHistory(rows);
  } catch (error) {
    elements.historyBody.innerHTML =
      `<tr><td colspan="8" class="empty-row">Error cargando historial: ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    state.isLoadingHistory = false;
    renderPaginationControls("active");
    if (!state.isLoadingDeletedHistory && !state.isExporting && !state.isDeletingTransaction) {
      setAdminActionsDisabled(false);
    }
  }
}

async function loadDeletedHistory() {
  if (!isAdmin() || state.isLoadingDeletedHistory) {
    return;
  }

  state.isLoadingDeletedHistory = true;
  setAdminActionsDisabled(true);

  try {
    const query = buildHistoryQuery({
      eliminado: 1,
      page: state.deletedPagination.page
    });
    const payload = await fetchJson(`/api/historial?${query}`);

    const rows = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : null;

    if (!payload?.ok || !Array.isArray(rows)) {
      throw new Error("No se pudo obtener historial de eliminados.");
    }

    state.deletedPagination = sanitizePaginationPayload(
      payload.pagination,
      state.historyPageSize
    );
    if (!payload.pagination) {
      state.deletedPagination.total = rows.length;
      state.deletedPagination.totalPages = 1;
      state.deletedPagination.page = 1;
    }
    renderDeletedHistory(rows);
  } catch (error) {
    elements.deletedHistoryBody.innerHTML =
      `<tr><td colspan="8" class="empty-row">Error cargando eliminados: ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    state.isLoadingDeletedHistory = false;
    renderPaginationControls("deleted");
    if (!state.isLoadingHistory && !state.isExporting && !state.isDeletingTransaction) {
      setAdminActionsDisabled(false);
    }
  }
}

function parseDownloadFileName(response) {
  const contentDisposition = response.headers.get("Content-Disposition") || "";
  const match = /filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i.exec(
    contentDisposition
  );

  if (match) {
    return decodeURIComponent(match[1] || match[2]);
  }

  return `transacciones_${Date.now()}.xlsx`;
}

async function exportHistory() {
  if (!isAdmin() || state.isExporting) {
    return;
  }

  state.isExporting = true;
  setAdminActionsDisabled(true);

  try {
    const query = buildHistoryQuery({ eliminado: 0, includePagination: false });
    const response = await fetch(`/api/historial/export?${query}`, {
      credentials: "same-origin"
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || payload.message || `Error ${response.status}`);
    }

    const blob = await response.blob();
    const fileName = parseDownloadFileName(response);

    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);

    setStatus("Exportación completada.", "success");
  } catch (error) {
    setStatus(`No se pudo exportar: ${error.message}`, "error");
  } finally {
    state.isExporting = false;
    setAdminActionsDisabled(false);
  }
}

async function handleDeleteTransaction(transactionId) {
  if (!isAdmin() || state.isDeletingTransaction) {
    return;
  }

  const id = Number.parseInt(String(transactionId || ""), 10);
  if (!Number.isInteger(id) || id <= 0) {
    setStatus("No se pudo identificar la transacción a eliminar.", "error");
    return;
  }

  const confirmed = window.confirm(
    "Esta acción moverá la transacción a eliminados y aplicará reversa en API si corresponde. ¿Desea continuar?"
  );

  if (!confirmed) {
    return;
  }

  state.isDeletingTransaction = true;
  setAdminActionsDisabled(true);
  setStatus("Eliminando transacción...", "loading");

  try {
    const payload = await fetchJson(`/api/transacciones/${id}/eliminar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        motivo: "Eliminado por administrador"
      })
    });

    if (!payload?.ok) {
      throw new Error("No se pudo eliminar la transacción.");
    }

    setStatus("Transacción movida a eliminados correctamente.", "success");
    await Promise.all([loadHistory(), loadDeletedHistory()]);
  } catch (error) {
    setStatus(`Error al eliminar transacción: ${error.message}`, "error");
  } finally {
    state.isDeletingTransaction = false;
    if (!state.isLoadingHistory && !state.isLoadingDeletedHistory && !state.isExporting) {
      setAdminActionsDisabled(false);
    }
  }
}

async function handleRegister(consumoKey) {
  if (state.isSubmitting) {
    return;
  }

  if (!state.currentUser) {
    forceSignOutUI("Sesión no disponible. Inicie sesión nuevamente.");
    return;
  }

  if (!validateRegistroInputs()) {
    return;
  }

  const normalizedConsumoKey = String(consumoKey || "").trim().toLowerCase();

  const consumoEstado = (state.employeeCheck?.consumos || []).find(
    (item) => String(item?.key || "").trim().toLowerCase() === normalizedConsumoKey
  );

  if (!consumoEstado || !consumoEstado.disponible) {
    setStatus(consumoEstado?.motivo || "Ese consumo no está disponible para este código.", "error");
    return;
  }

  const codigo = readCodigo();
  const monto = getMontoDefaultForConsumo(normalizedConsumoKey);

  if (!monto) {
    setStatus("No se pudo determinar un monto válido para este consumo.", "error");
    return;
  }

  const consumoLabel = getConsumoLabel(normalizedConsumoKey);
  const clienteDisplay = getClienteDisplayName(codigo);

  const confirmed = await openPurchaseConfirmModal({
    cliente: clienteDisplay,
    consumo: consumoLabel,
    monto
  });

  if (!confirmed) {
    setStatus("Compra cancelada por el usuario.", "info");
    return;
  }

  setSubmitting(true);
  setStatus("Registrando...", "loading");

  let wasSuccessful = false;

  try {
    const payload = await fetchJson("/api/consumo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        codigo,
        consumo: normalizedConsumoKey,
        monto
      })
    });

    if (!payload?.ok) {
      throw new Error("No se pudo registrar consumo");
    }

    wasSuccessful = true;
    setStatus("Consumo registrado correctamente", "success");
  } catch (error) {
    setStatus(`Error al registrar consumo: ${error.message}`, "error");
    focusCodigo();
  } finally {
    setSubmitting(false);
  }

  await handleVerifyCodigo({
    keepMainStatus: true,
    fromSuccessfulRegister: wasSuccessful
  });

  if (wasSuccessful && isAdmin()) {
    await loadHistory();
  }
}
