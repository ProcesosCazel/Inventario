/*
Proyecto: Sistema de Inventario Digital EOAT
Autor:
  Ing. José Antonio Guzmán Trujillo
  Becario de Procesos | Industrias Cazel
  tecnicosprocesos@cazel.mx
  2026
*/

"use strict";

/* =================================================
   REFERENCIAS DEL DOM (UI ELEMENTS)
   ================================================= */

// Buscador

const searchInput = document.getElementById("eoat-search");
const resultsTable = document.getElementById("results-table");
const resultsCounter = document.getElementById("results-counter");
const resultsTableBody = document.querySelector("#results-table tbody");
const printBtn = document.getElementById("print-btn");

// Popup

const detailsPopup = document.getElementById("details-popup");
const popupContent = document.getElementById("popup-content");
const closePopupBtn = document.getElementById("close-popup-btn");

// Pantallas

const screens = document.querySelectorAll(".screen");

const searchScreenBtn = document.getElementById("search-screen-btn");
const mapScreenBtn = document.getElementById("map-screen-btn");
const inboxScreenBtn = document.getElementById("inbox-screen-btn");
const helpScreenBtn = document.getElementById("help-screen-btn");
const navButtons = document.querySelectorAll(".navbar .btn");
const mainContent = document.querySelector(".main-content");

// Buzon

const inboxForm = document.getElementById("inbox-form");
const typeSelect = document.getElementById("tipo");
const eoatInput = document.getElementById("eoat-numero");
const messageInput = document.getElementById("mensaje");

/* =================================================
   Sonido (SFX)
   ================================================= */

const errorSound = new Audio("./assets/SFX/error.mp3");
const popupSound = new Audio("./assets/SFX/popup.mp3");

function playErrorSound() {
  errorSound.currentTime = 0;
  errorSound.play().catch(() => {});
}

function playPopupSound() {
  popupSound.currentTime = 0;
  popupSound.play().catch(() => {});
}

function vibrate(ms) {
  if (navigator.vibrate) {
    navigator.vibrate(ms);
  }
}

/* =================================================
   VARIABLES GLOBALES
   ================================================= */

// Base de datos

let eoatDatabase = [];

// Paso 3: separar el estado de carga de una consulta sin coincidencias.
const DATABASE_STATE = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  EMPTY: "empty",
  STALE: "stale", // Ultima base valida de esta sesion, no de almacenamiento offline.
  ERROR: "error",
});
const DATABASE_URL = "./data/eoat_data.json";
const DATABASE_TIMEOUT_MS = 20000;

let databaseState = DATABASE_STATE.IDLE;
let databaseLoadPromise = null;
let databaseErrorMessage = "";
let databaseRetryActions = null;
let retryDatabaseBtn = null;

// Paso 4: una descarga no reemplaza la base hasta aprobar TODAS las reglas.
let hasValidatedDatabase = false;
let databaseValidationReport = null;
let databaseNotice = null;
let databaseValidationDetails = null;
let renderedValidationReport = null;


/* =================================================
   PASO 4: VALIDACION PURA DEL INVENTARIO
   No modifica el JSON original ni descarga fotografias.
   ================================================= */
// BEGIN EOAT_VALIDATION

const EOAT_VALIDATION_RULES = Object.freeze({
  naves: Object.freeze([1, 2, 3]),
  idPattern: /^I-[0-9]+$/,
  columnPattern: /^C(?:0[1-9]|[1-9][0-9])$/,
  rowPattern: /^[1-9][0-9]*(?: y [1-9][0-9]*)*$/,
  imagePattern: /^[A-Za-z0-9][A-Za-z0-9_-]*\.(?:jpe?g|png|webp|gif|avif|svg)$/i,
  maxIdLength: 64,
  maxRowLength: 64,
  maxDescriptionLength: 2048,
  maxImageLength: 128,
});

/**
 * @typedef {Object} EOATRecord
 * @property {string} id
 * @property {string} estado Descripcion original de componentes o del espacio.
 * @property {number} nave
 * @property {string} columna
 * @property {string} fila Admite varias filas, p. ej. "2 y 3".
 * @property {string|null} imagen Solo un nombre local, nunca una URL o ruta.
 */

/**
 * @param {unknown} rawData Resultado de response.json(), todavia no confiable.
 * @returns {{ok: boolean, data: ReadonlyArray<EOATRecord>|null,
 *   totalRecords: number, errors: Array<Object>, warnings: Array<Object>}}
 * Los numeros de registro del informe empiezan en 1 (NO son lineas del JSON).
 * La normalizacion solo cambia espacios externos, caja de codigos y tipos
 * expresamente permitidos. No inventa IDs, ubicaciones ni fotografias.
 * Esta validacion de estructura NO sustituye el renderizado seguro del paso 5.
 */
function validateEOATDatabase(rawData) {
  const errors = [];
  const warnings = [];
  const records = [];
  const seenTools = new Map();
  const allowedFields = new Set(["id", "estado", "nave", "columna", "fila", "imagen"]);
  const rules = EOAT_VALIDATION_RULES;

  function issue(target, record, id, field, code, message) {
    target.push({ record, id, field, code, message });
  }

  if (!Array.isArray(rawData)) {
    issue(errors, null, null, "$", "ROOT_TYPE", "El archivo debe contener una lista de registros.");
    return { ok: false, data: null, totalRecords: 0, errors, warnings };
  }

  for (let index = 0; index < rawData.length; index += 1) {
    const input = rawData[index];
    const record = index + 1;
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      issue(errors, record, null, "$", "RECORD_TYPE", "El registro debe ser un objeto, no un valor suelto ni una lista.");
      continue;
    }

    const label = typeof input.id === "string" ? input.id.slice(0, rules.maxIdLength) : null;
    const error = (field, code, message) => issue(errors, record, label, field, code, message);
    const warning = (field, code, message) => issue(warnings, record, label, field, code, message);
    const previousErrors = errors.length;

    let id = "";
    let isTool = false;
    if (typeof input.id !== "string" || !input.id.trim()) {
      error("id", "ID_TYPE", "Debe ser texto no vac\u00edo; no se convierten n\u00fameros en identificadores.");
    } else {
      const value = input.id.trim();
      const lower = value.toLowerCase();
      id = lower === "libre" ? "Libre" : lower === "obstruido" ? "Obstruido" : value.toUpperCase();
      isTool = rules.idPattern.test(id);
      if (id.length > rules.maxIdLength || (!isTool && id !== "Libre" && id !== "Obstruido")) {
        error("id", "ID_FORMAT", 'Debe usar I- seguido de d\u00edgitos, o ser "Libre" u "Obstruido" (m\u00e1ximo 64 caracteres).');
      } else {
        if (id !== input.id) warning("id", "NORMALIZED", "Se normalizaron espacios externos o may\u00fasculas del identificador, solo en memoria.");
        if (isTool) {
          if (seenTools.has(id)) {
            error("id", "DUPLICATE_ID", `Identificador de herramental repetido; ya aparece en el registro ${seenTools.get(id)}.`);
          } else {
            seenTools.set(id, record);
          }
        }
      }
    }

    let nave = input.nave;
    if (typeof nave === "string" && /^[123]$/.test(nave.trim())) {
      nave = Number(nave.trim());
      warning("nave", "NORMALIZED", "Se convirti\u00f3 la nave de texto a n\u00famero, solo en memoria.");
    }
    if (!Number.isInteger(nave) || !rules.naves.includes(nave)) {
      error("nave", "NAVE_VALUE", "Debe ser 1, 2 o 3, como n\u00famero o texto equivalente.");
    }

    let columna = "";
    if (typeof input.columna !== "string") {
      error("columna", "COLUMN_TYPE", "Debe ser texto con formato C01, C02, etc.");
    } else {
      columna = input.columna.trim().toUpperCase();
      if (!rules.columnPattern.test(columna)) {
        error("columna", "COLUMN_FORMAT", "Debe usar C y dos d\u00edgitos entre 01 y 99; no se inventa el n\u00famero de columna.");
      } else if (columna !== input.columna) {
        warning("columna", "NORMALIZED", "Se normalizaron espacios externos o may\u00fasculas de la columna, solo en memoria.");
      }
    }

    let fila = "";
    if (typeof input.fila === "string") {
      fila = input.fila.trim().replace(/\s+/g, " ").toLowerCase();
    } else if (Number.isSafeInteger(input.fila) && input.fila > 0) {
      fila = String(input.fila);
    }
    if (!fila || fila.length > rules.maxRowLength || !rules.rowPattern.test(fila)) {
      error("fila", "ROW_FORMAT", 'Debe indicar filas enteras positivas, por ejemplo "2", "2 y 3" o "3 y 4".');
    } else {
      const rows = fila.split(" y ").map(Number);
      if (rows.some((value, i) => !Number.isSafeInteger(value) || (i > 0 && value <= rows[i - 1]))) {
        error("fila", "ROW_ORDER", "Las filas deben ser enteros seguros, sin repeticiones y en orden ascendente.");
      } else if (fila !== input.fila) {
        warning("fila", "NORMALIZED", "Se normaliz\u00f3 el formato de fila a texto, conservando todas las filas indicadas.");
      }
    }

    let estado = "No especificado";
    if (input.estado == null || (typeof input.estado === "string" && !input.estado.trim())) {
      warning("estado", "DESCRIPTION_EMPTY", 'Descripci\u00f3n vac\u00eda: se mostrar\u00e1 "No especificado".');
    } else if (typeof input.estado !== "string") {
      error("estado", "DESCRIPTION_TYPE", "La descripci\u00f3n debe ser texto o estar vac\u00eda; no se convierten objetos ni n\u00fameros.");
    } else if (input.estado.length > rules.maxDescriptionLength) {
      error("estado", "DESCRIPTION_LENGTH", "La descripci\u00f3n supera el l\u00edmite de 2048 caracteres; no se recorta autom\u00e1ticamente.");
    } else {
      // Conservar literalmente el texto: componentes NO equivalen a disponibilidad.
      estado = input.estado;
    }

    let imagen = null;
    if (input.imagen == null || (typeof input.imagen === "string" && !input.imagen.trim())) {
      if (isTool) warning("imagen", "IMAGE_UNASSIGNED", "Herramental sin foto asignada; se usar\u00e1 la imagen de respaldo.");
    } else if (typeof input.imagen !== "string") {
      error("imagen", "IMAGE_TYPE", "Debe ser un nombre de archivo de texto o null.");
    } else {
      const value = input.imagen.trim();
      if (value.length > rules.maxImageLength || !rules.imagePattern.test(value)) {
        error("imagen", "IMAGE_FILENAME", "Usa solo letras A-Z, d\u00edgitos, guion o guion bajo y una extensi\u00f3n permitida. No se admiten carpetas, URLs ni ../.");
      } else {
        imagen = value; // No cambiar mayusculas: el nombre debe coincidir con el archivo.
        if (imagen !== input.imagen) warning("imagen", "NORMALIZED", "Se quitaron espacios externos al nombre de foto, sin cambiar may\u00fasculas ni extensi\u00f3n.");
      }
    }

    for (const field of Object.keys(input)) {
      if (!allowedFields.has(field)) {
        warning(field, "EXTRA_FIELD", "Campo no utilizado: se omite de la copia en memoria, sin modificar el JSON.");
      }
    }

    if (errors.length === previousErrors) {
      // Copia explicita: no propagar propiedades desconocidas del JSON al modelo.
      records.push(Object.freeze({ id, estado, nave, columna, fila, imagen }));
    }
  }

  const ok = errors.length === 0;
  return {
    ok,
    data: ok ? Object.freeze(records) : null, // Nunca entregar una base parcial.
    totalRecords: rawData.length,
    errors,
    warnings,
  };
}

class DatabaseValidationError extends Error {
  constructor(report) {
    super(`Inventario rechazado: ${report.errors.length} error(es) de validaci\u00f3n.`);
    this.name = "DatabaseValidationError";
    this.report = report;
  }
}

// END EOAT_VALIDATION

/* =================================================
   CARGAR BASE DE DATOS (json)
   ================================================= */

// Reutiliza el contador y las clases del paso 2. No requiere editar HTML/CSS.
function initDatabaseUI() {
  if (retryDatabaseBtn) return;

  resultsCounter.setAttribute("role", "status");
  resultsCounter.setAttribute("aria-live", "polite");
  resultsCounter.setAttribute("aria-atomic", "true");

  databaseRetryActions = document.createElement("div");
  databaseRetryActions.id = "database-retry-actions";
  databaseRetryActions.className = "controls-container hidden";

  retryDatabaseBtn = document.createElement("button");
  retryDatabaseBtn.id = "retry-database-btn";
  retryDatabaseBtn.type = "button";
  retryDatabaseBtn.className = "btn btn--secondary";
  retryDatabaseBtn.textContent = "Reintentar";
  retryDatabaseBtn.setAttribute("aria-describedby", "results-counter");
  retryDatabaseBtn.addEventListener("click", () => {
    void loadDatabase();
  });

  databaseRetryActions.appendChild(retryDatabaseBtn);
  resultsCounter.after(databaseRetryActions);

  databaseNotice = document.createElement("p");
  databaseNotice.id = "database-notice";
  databaseNotice.className = "hidden";
  databaseNotice.setAttribute("role", "status");
  databaseNotice.setAttribute("aria-live", "polite");
  databaseRetryActions.after(databaseNotice);

  databaseValidationDetails = document.createElement("details");
  databaseValidationDetails.id = "database-validation-details";
  databaseValidationDetails.className = "hidden";
  databaseNotice.after(databaseValidationDetails);
}


function canUseDatabase() {
  return databaseState === DATABASE_STATE.READY || databaseState === DATABASE_STATE.STALE;
}

// Los diagnosticos nuevos se construyen con nodos y textContent, nunca con HTML.
function updateValidationUI() {
  const report = databaseValidationReport;
  let notice = "";
  if (databaseState === DATABASE_STATE.STALE) {
    notice = `${databaseErrorMessage} Se conserva el \u00faltimo inventario v\u00e1lido de esta sesi\u00f3n; la actualizaci\u00f3n no se aplic\u00f3.`;
  } else if (report && report.ok && report.warnings.length) {
    notice = `Inventario cargado con ${report.warnings.length} aviso(s). Consulta el detalle de validaci\u00f3n.`;
  }
  if (databaseNotice.textContent !== notice) databaseNotice.textContent = notice;
  databaseNotice.classList.toggle("hidden", !notice);

  // No recrear el detalle ni cerrarlo por cada tecla que escribe el usuario.
  if (renderedValidationReport === report) return;
  renderedValidationReport = report;
  databaseValidationDetails.replaceChildren();
  databaseValidationDetails.open = false;
  const hasIssues = report && (report.errors.length || report.warnings.length);
  databaseValidationDetails.classList.toggle("hidden", !hasIssues);
  if (!hasIssues) return;

  const summary = document.createElement("summary");
  summary.textContent = `Revisar datos: ${report.errors.length} error(es), ${report.warnings.length} aviso(s)`;
  const explanation = document.createElement("p");
  explanation.textContent = "El n\u00famero de registro indica su posici\u00f3n en la lista JSON, comenzando en 1; no es una l\u00ednea del archivo ni una fila del rack.";
  databaseValidationDetails.append(summary, explanation);
  const list = document.createElement("ul");
  const issues = report.errors.map((item) => ({ ...item, level: "Error" }))
    .concat(report.warnings.map((item) => ({ ...item, level: "Aviso" })));
  const visibleLimit = 50;
  for (const item of issues.slice(0, visibleLimit)) {
    const line = document.createElement("li");
    line.style.overflowWrap = "anywhere"; // Un codigo erroneo largo no desborda en movil.
    const where = item.record === null ? "Archivo" : `Registro ${item.record}`;
    const id = item.id ? ` (${item.id})` : "";
    line.textContent = `${item.level} - ${where}${id} - ${item.field}: ${item.message}`;
    list.appendChild(line);
  }
  databaseValidationDetails.appendChild(list);
  if (issues.length > visibleLimit) {
    const remainder = document.createElement("p");
    remainder.textContent = `Se muestran ${visibleLimit} de ${issues.length} incidencias. El informe completo est\u00e1 en la consola del navegador.`;
    databaseValidationDetails.appendChild(remainder);
  }
}

function logValidationReport(report) {
  if (report.errors.length) {
    console.error("EOAT: errores de validacion; NO se aplico la base descargada.");
    console.table(report.errors);
  }
  if (report.warnings.length) {
    console.warn("EOAT: avisos de validacion.");
    console.table(report.warnings);
  }
}

function updateDatabaseUI() {
  const isLoading = databaseState === DATABASE_STATE.LOADING;
  resultsCounter.dataset.loadState = databaseState;
  resultsTable.setAttribute("aria-busy", String(isLoading));

  // Durante un reintento se conserva el boton visible, pero deshabilitado.
  const showRetry =
    databaseState === DATABASE_STATE.ERROR ||
    databaseState === DATABASE_STATE.STALE ||
    (isLoading && !databaseRetryActions.classList.contains("hidden"));
  const restoreSearchFocus =
    !showRetry &&
    document.activeElement === retryDatabaseBtn &&
    !document.getElementById("search-screen").classList.contains("hidden");

  databaseRetryActions.classList.toggle("hidden", !showRetry);
  retryDatabaseBtn.disabled = isLoading;
  retryDatabaseBtn.textContent = isLoading ? "Reintentando…" : "Reintentar";

  if (restoreSearchFocus) searchInput.focus({ preventScroll: true });
  updateValidationUI();
  if (canUseDatabase()) return;

  // No presentar datos anteriores ni permitir imprimir una carga incompleta.
  resultsTableBody.replaceChildren();
  resultsTable.classList.add("hidden");
  printBtn.disabled = true;

  let message = "";
  if (isLoading) {
    message = "Cargando inventario…";
  } else if (databaseState === DATABASE_STATE.ERROR) {
    message = databaseErrorMessage;
  } else if (databaseState === DATABASE_STATE.EMPTY) {
    message = "El inventario no contiene registros.";
  }

  // No anunciar el mismo mensaje otra vez por cada tecla durante la carga.
  if (resultsCounter.textContent !== message) {
    resultsCounter.textContent = message;
  }
}

function loadDatabase() {
  // Todas las llamadas concurrentes comparten la misma solicitud.
  if (databaseLoadPromise) return databaseLoadPromise;

  initDatabaseUI();
  databaseState = DATABASE_STATE.LOADING;
  databaseErrorMessage = "";
  databaseValidationReport = null;
  updateDatabaseUI();

  databaseLoadPromise = requestDatabase().finally(() => {
    databaseLoadPromise = null;
  });
  return databaseLoadPromise;
}

async function requestDatabase() {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, DATABASE_TIMEOUT_MS);

  let data;
  let validation;
  let failureMessage =
    "No se pudo cargar el inventario. Revisa tu conexión y presiona Reintentar.";

  try {
    const response = await fetch(DATABASE_URL, { signal: controller.signal });
    if (!response.ok) {
      failureMessage =
        `No se pudo cargar el inventario (HTTP ${response.status}). Presiona Reintentar.`;
      throw new Error(`Error HTTP: ${response.status}`);
    }

    data = await response.json();

    validation = validateEOATDatabase(data);
    databaseValidationReport = validation;
    logValidationReport(validation);
    if (!validation.ok) throw new DatabaseValidationError(validation);
  } catch (error) {
    if (timedOut) {
      failureMessage =
        "La carga tardó demasiado. Revisa tu conexión y presiona Reintentar.";
    } else if (error instanceof DatabaseValidationError) {
      failureMessage = `No se pudo validar el inventario: ${error.report.errors.length} error(es). Revisa el detalle y corrige eoat_data.json antes de reintentar.`;
    } else if (error instanceof SyntaxError) {
      failureMessage =
        "No se pudo leer el archivo de inventario. Reintenta; si persiste, reporta el problema.";
    }

    console.error("Error cargando la base de datos:", error);
    databaseErrorMessage = failureMessage;
    // Conservar una base ya validada SOLO mientras esta pagina siga abierta.
    databaseState = hasValidatedDatabase ? DATABASE_STATE.STALE : DATABASE_STATE.ERROR;
    updateDatabaseUI();
    if (hasValidatedDatabase) searchEOAT(searchInput.value);
    playErrorSound();
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }

  // No tocar el valor del campo ni cambiar la pantalla activa al terminar.
  eoatDatabase = validation.data;
  hasValidatedDatabase = true;
  databaseState = eoatDatabase.length ? DATABASE_STATE.READY : DATABASE_STATE.EMPTY;
  updateDatabaseUI();
  console.log("EOAT cargados:", eoatDatabase.length);

  // Usar la consulta ACTUAL, incluso si se escribio, cambio o borro al cargar.
  searchEOAT(searchInput.value);
  return true;
}

/* =================================================
   NAVEGACIÓN ENTRE PANTALLAS
   ================================================= */

function setActiveButton(activeId) {
  navButtons.forEach((btn) => btn.classList.remove("active"));
  document.getElementById(activeId).classList.add("active");
}

function showScreen(screenId) {
  if (!detailsPopup.classList.contains("hidden")) closePopup();

  screens.forEach((screen) => {
    screen.classList.add("hidden");
  });

  const targetScreen = document.getElementById(screenId);

  if (!targetScreen) return;

  targetScreen.classList.remove("hidden");

  requestAnimationFrame(() => {
    // El contenido tiene su propio scroll; header y footer no se desplazan.
    if (mainContent) {
      mainContent.scrollTop = 0;
      mainContent.scrollLeft = 0;
    }
  });
}

/* =================================================
   ALTURA VISIBLE: BARRAS DEL NAVEGADOR Y TECLADO MOVIL
   Solo distribucion visual; no cambia busquedas ni datos.
   ================================================= */

function initResponsiveLayout() {
  const viewport = window.visualViewport;
  let pendingFrame = 0;

  function updateHeight() {
    pendingFrame = 0;

    // No reajustar la aplicacion al hacer zoom con los dedos.
    // Mantener el zoom y el desplazamiento nativos del navegador.
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;

    const height = viewport ? viewport.height : window.innerHeight;
    if (!Number.isFinite(height) || height <= 0) return;

    document.documentElement.style.setProperty("--app-height", `${height}px`);

    const active = document.activeElement;
    if (
      mainContent &&
      active instanceof HTMLElement &&
      mainContent.contains(active) &&
      active.matches("input, textarea, select")
    ) {
      // Si el teclado redujo la ventana, mantener el campo dentro de main.
      const field = active.getBoundingClientRect();
      const content = mainContent.getBoundingClientRect();
      if (field.bottom > content.bottom) {
        mainContent.scrollTop += field.bottom - content.bottom + 8;
      } else if (field.top < content.top) {
        mainContent.scrollTop -= content.top - field.top + 8;
      }
    }
  }

  function scheduleUpdate() {
    if (!pendingFrame) pendingFrame = requestAnimationFrame(updateHeight);
  }

  window.addEventListener("resize", scheduleUpdate, { passive: true });
  window.addEventListener("pageshow", scheduleUpdate, { passive: true });
  if (viewport) {
    viewport.addEventListener("resize", scheduleUpdate, { passive: true });
  }
  updateHeight();
}

/* =================================================
   BUSCADOR EOAT
   ================================================= */

function searchEOAT(query) {
  // Escribir durante la carga solo conserva la consulta. Al recibir los datos,
  // requestDatabase() ejecuta automaticamente el valor actual del campo.
  if (!canUseDatabase()) {
    initDatabaseUI();
    updateDatabaseUI();
    return;
  }
  // Una base vacia tambien puede ser la ultima copia valida de la sesion.
  if (eoatDatabase.length === 0) {
    resultsTableBody.replaceChildren();
    resultsTable.classList.add("hidden");
    resultsCounter.textContent = "El inventario no contiene registros.";
    printBtn.disabled = true;
    return;
  }
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery === "") {
    resultsTableBody.replaceChildren();
    resultsTable.classList.add("hidden");
    resultsCounter.textContent = "";
    printBtn.disabled = true;

    return;
  }

  const results = eoatDatabase.filter((item) =>
    item.id.toLowerCase().includes(normalizedQuery),
  );

  renderResults(results);
}

/* =================================================
   RENDERIZAR RESULTADOS
   ================================================= */

/**
 * Crea elementos de etiqueta fija. Los datos se asignan como texto, no marcado.
 * @param {string} tagName Solo etiquetas definidas en este archivo.
 * @param {string|number|null|undefined} value
 * @returns {HTMLElement}
 */
function createEOATTextElement(tagName, value) {
  const element = document.createElement(tagName);
  element.textContent = value == null ? "" : String(value);
  return element;
}

/** @param {number} nave @returns {string} Clase de una lista cerrada. */
function getEOATNaveClass(nave) {
  switch (nave) {
    case 1: return "nave-1";
    case 2: return "nave-2";
    case 3: return "nave-3";
    default: return "";
  }
}

function renderResults(results) {
  resultsTableBody.replaceChildren();

  if (results.length === 0) {
    resultsCounter.textContent = "Sin resultados";
    resultsTable.classList.add("hidden");
    printBtn.disabled = true;
    return;
  }
  resultsCounter.textContent = `${results.length} resultado(s)`;

  // Construir la lista fuera de la tabla y agregarla en una sola operacion.
  const fragment = document.createDocumentFragment();
  results.forEach((eoat) => {
    const row = document.createElement("tr");
    const idCell = createEOATTextElement("td", eoat.id);
    const naveCell = createEOATTextElement("td", `N${eoat.nave}`);
    const naveClass = getEOATNaveClass(eoat.nave);
    if (naveClass) naveCell.classList.add(naveClass);
    const columnCell = createEOATTextElement("td", eoat.columna);
    const rowCell = createEOATTextElement("td", eoat.fila);
    const actionsCell = document.createElement("td");
    const infoBtn = createEOATTextElement("button", "\u2139\uFE0F");
    infoBtn.type = "button";
    infoBtn.className = "info-btn";
    infoBtn.setAttribute("aria-label", `Ver detalles de ${eoat.id}`);
    infoBtn.addEventListener("click", () => {
      openPopup(eoat);
    });

    actionsCell.appendChild(infoBtn);
    row.append(idCell, naveCell, columnCell, rowCell, actionsCell);
    fragment.appendChild(row);
  });
  resultsTableBody.appendChild(fragment);

  resultsTable.classList.remove("hidden");
  printBtn.disabled = false;
}

/* =================================================
   POPUP DETALLES EOAT
   ================================================= */

/**
 * Defensa adicional al asignar src: conservar las reglas de imagen del paso 4.
 * El flujo normal ya recibe el registro validado. No se aceptan URLs ni rutas.
 * @param {unknown} value
 * @returns {string}
 */
function getEOATImageFile(value) {
  const rules = EOAT_VALIDATION_RULES;
  return typeof value === "string" &&
    value.length <= rules.maxImageLength &&
    rules.imagePattern.test(value)
    ? value
    : "no-image.svg";
}

/** @param {EOATRecord} eoat @returns {HTMLImageElement} */
function createEOATImage(eoat) {
  const imageFile = getEOATImageFile(eoat.imagen);
  const fallbackFile = "no-image.svg";
  const image = document.createElement("img");
  image.alt = `Foto EOAT ${eoat.id}`;
  image.className = "eoat-image";
  image.loading = "lazy";
  let usingFallback = imageFile === fallbackFile;

  // Cada ficha tiene su propio manejador: una foto tardia no altera otra ficha.
  function handleImageError() {
    if (!usingFallback) {
      usingFallback = true;
      image.src = `./assets/EOAT/${fallbackFile}`;
      return;
    }
    // Si tambien falta el respaldo, detenerse: nunca reasignarlo en un bucle.
    image.removeEventListener("error", handleImageError);
    const message = createEOATTextElement("p", "Fotograf\u00eda no disponible.");
    message.className = "eoat-image-unavailable";
    image.replaceWith(message);
  }

  image.addEventListener("error", handleImageError);
  image.src = `./assets/EOAT/${imageFile}`;
  return image;
}

/** @param {string} label @param {string|number} value @returns {HTMLParagraphElement} */
function createEOATDetailLine(label, value) {
  const line = document.createElement("p");
  const title = createEOATTextElement("strong", `${label}:`);
  line.append(title, document.createTextNode(` ${value}`));
  return line;
}

function openPopup(eoat) {
  const title = createEOATTextElement("h3", eoat.id);
  const image = createEOATImage(eoat);
  const naveLine = document.createElement("p");
  const naveLabel = createEOATTextElement("strong", "Nave:");
  const naveValue = createEOATTextElement("span", `N${eoat.nave}`);
  const naveClass = getEOATNaveClass(eoat.nave);
  if (naveClass) naveValue.classList.add(naveClass);
  naveValue.classList.add("no-bg");
  naveLine.append(naveLabel, document.createTextNode(" "), naveValue);

  popupContent.replaceChildren(
    title,
    image,
    naveLine,
    createEOATDetailLine("Columna", eoat.columna),
    createEOATDetailLine("Fila", eoat.fila),
    createEOATDetailLine("Estado", eoat.estado || "No especificado"),
  );

  detailsPopup.classList.remove("hidden");
  playPopupSound();
}

function closePopup() {
  if (!detailsPopup.classList.contains("hidden")) {
    detailsPopup.classList.add("hidden");
    playPopupSound();
  }
}

/* =================================================
   BUZON
   ================================================= */

if (inboxForm) {
  inboxForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const tipo = typeSelect.value;
    const eoat = eoatInput.value.trim();
    const mensaje = messageInput.value.trim();

    if (!mensaje) {
      playErrorSound();
      alert("Por favor escribe un mensaje.");
      return;
    }

    let body = `Tipo de mensaje: ${tipo}\n`;

    if (eoat !== "") {
      body += `EOAT: ${eoat}\n`;
    }

    body += `\nMensaje:\n${mensaje}`;

    const fecha = new Date().toLocaleString("es-MX");

    body += `\n\nFecha: ${fecha}`;
    body += `\nDispositivo: ${navigator.userAgent}`;

    const subject = encodeURIComponent("Reporte Sistema EOAT");
    const emailBody = encodeURIComponent(body);

    const mailtoLink = `mailto:tecnicosprocesos@cazel.mx?subject=${subject}&body=${emailBody}`;

    window.location.href = mailtoLink;
  });
}

eoatInput.addEventListener("input", () => {
  eoatInput.value = eoatInput.value.toUpperCase();
});

/* =================================================
   EVENT LISTENERS
   ================================================= */

searchInput.addEventListener("input", (event) => {
  searchEOAT(event.target.value);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === "Search") {
    e.preventDefault();
    searchInput.blur();
  }
});

closePopupBtn.addEventListener("click", closePopup);

detailsPopup.addEventListener("click", (event) => {
  if (event.target === detailsPopup) {
    closePopup();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closePopup();
  }
});

searchScreenBtn.addEventListener("click", () => {
  showScreen("search-screen");
  vibrate(65);
  setActiveButton("search-screen-btn");
});

mapScreenBtn.addEventListener("click", () => {
  showScreen("map-screen");
  vibrate(65);
  setActiveButton("map-screen-btn");
});

inboxScreenBtn.addEventListener("click", () => {
  showScreen("inbox-screen");
  vibrate(65);
  setActiveButton("inbox-screen-btn");
});

helpScreenBtn.addEventListener("click", () => {
  showScreen("help-screen");
  vibrate(65);
  setActiveButton("help-screen-btn");
});

printBtn.addEventListener("click", () => {
  closePopup();
  window.print();
});

/* =================================================
   INICIALIZACIÓN (DOM CONTENT LOADED)
   ================================================= */

document.addEventListener("DOMContentLoaded", () => {
  initResponsiveLayout();
  loadDatabase();
  errorSound.load();
  popupSound.load();
  setActiveButton("search-screen-btn");
});
