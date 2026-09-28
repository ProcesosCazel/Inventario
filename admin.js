/*
 * EOAT administrative updater
 * - Reads EOAT_data.xlsx locally in the browser.
 * - Converts with EOATConverter using legacy Python rules.
 * - Validates before enabling download.
 * - Compares against ./data/eoat_data.json when available.
 * - Never writes to GitHub or to the local project automatically.
 */

"use strict";

const excelFileInput = document.getElementById("excel-file");
const fileSummary = document.getElementById("file-summary");
const convertBtn = document.getElementById("convert-btn");
const resetBtn = document.getElementById("reset-btn");
const downloadBtn = document.getElementById("download-btn");
const adminStatus = document.getElementById("admin-status");
const validationCard = document.getElementById("validation-card");
const validationSummary = document.getElementById("validation-summary");
const validationDetails = document.getElementById("validation-details");
const validationList = document.getElementById("validation-list");
const comparisonCard = document.getElementById("comparison-card");
const comparisonNote = document.getElementById("comparison-note");
const changesDetails = document.getElementById("changes-details");
const changesBody = document.getElementById("changes-body");
const metricNew = document.getElementById("metric-new");
const metricModified = document.getElementById("metric-modified");
const metricRemoved = document.getElementById("metric-removed");
const metricSame = document.getElementById("metric-same");
const mainContent = document.querySelector(".main-content");

const EXPECTED_FILE_NAME = "EOAT_data.xlsx";
const CURRENT_JSON_URL = "./data/eoat_data.json";
const OUTPUT_FILE_NAME = "eoat_data.json";
const RECORD_FIELDS = Object.freeze(["id", "estado", "nave", "columna", "fila", "imagen"]);

let selectedFile = null;
let generatedRecords = null;
let generatedJsonText = null;
let currentDatabase = null;
let currentDatabaseError = "";

function setStatus(message, state = "") {
  adminStatus.textContent = message;
  if (state) {
    adminStatus.dataset.state = state;
  } else {
    delete adminStatus.dataset.state;
  }
}

function setButtonBusy(button, busy, busyText, idleText) {
  button.disabled = busy;
  button.dataset.busy = String(busy);
  button.textContent = busy ? busyText : idleText;
}

function resetResults() {
  generatedRecords = null;
  generatedJsonText = null;
  downloadBtn.disabled = true;

  validationCard.classList.add("hidden");
  validationSummary.replaceChildren();
  validationDetails.classList.add("hidden");
  validationDetails.open = false;
  validationList.replaceChildren();

  comparisonCard.classList.add("hidden");
  comparisonNote.textContent = "";
  changesDetails.classList.add("hidden");
  changesDetails.open = false;
  changesBody.replaceChildren();
  metricNew.textContent = "0";
  metricModified.textContent = "0";
  metricRemoved.textContent = "0";
  metricSame.textContent = "0";
}

function validateSelectedFile(file) {
  if (!file) {
    return { ok: false, message: "Selecciona EOAT_data.xlsx para comenzar." };
  }

  if (file.name !== EXPECTED_FILE_NAME) {
    return {
      ok: false,
      message: `El archivo debe llamarse exactamente ${EXPECTED_FILE_NAME}. Archivo seleccionado: ${file.name}`,
    };
  }

  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, message: "El archivo de entrada debe tener extensión .xlsx." };
  }

  return { ok: true, message: `${file.name} listo para convertir.` };
}

function issueText(item, level) {
  const where = item.record == null ? "Archivo" : `Registro ${item.record}`;
  const id = item.id ? ` (${item.id})` : "";
  return `${level} - ${where}${id} - ${item.field}: ${item.message}`;
}

function renderValidation(report) {
  validationCard.classList.remove("hidden");
  validationSummary.replaceChildren();
  validationList.replaceChildren();

  const summary = document.createElement("p");
  if (report.ok) {
    summary.textContent = `Validación correcta: ${report.totalRecords} registro(s), ${report.errors.length} error(es) y ${report.warnings.length} aviso(s).`;
  } else {
    summary.textContent = `Validación rechazada: ${report.totalRecords} registro(s), ${report.errors.length} error(es) y ${report.warnings.length} aviso(s).`;
  }
  validationSummary.appendChild(summary);

  const issues = report.errors
    .map((item) => ({ item, level: "Error", className: "error-item" }))
    .concat(report.warnings.map((item) => ({ item, level: "Aviso", className: "warning-item" })));

  validationDetails.classList.toggle("hidden", issues.length === 0);
  if (!issues.length) return;

  for (const entry of issues) {
    const li = document.createElement("li");
    li.className = entry.className;
    li.textContent = issueText(entry.item, entry.level);
    validationList.appendChild(li);
  }
}

function canonicalRecord(record) {
  const copy = {};
  for (const field of RECORD_FIELDS) copy[field] = record[field];
  return copy;
}

function recordsEqual(a, b) {
  return RECORD_FIELDS.every((field) => Object.is(a[field], b[field]));
}

function baseKeyForRecord(record) {
  const id = String(record.id ?? "");
  if (/^I-[0-9]+$/.test(id)) return `tool:${id}`;
  return `slot:${String(record.nave)}|${String(record.columna)}|${String(record.fila)}`;
}

function indexRecords(records) {
  const map = new Map();
  const occurrences = new Map();

  records.forEach((record, index) => {
    const base = baseKeyForRecord(record);
    const occurrence = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, occurrence);
    const key = `${base}#${occurrence}`;
    map.set(key, { record: canonicalRecord(record), index });
  });

  return map;
}

function describeRecord(record) {
  const id = String(record.id ?? "");
  const location = `N${String(record.nave ?? "")} / ${String(record.columna ?? "")} / fila ${String(record.fila ?? "")}`;
  return id ? `${id} — ${location}` : location;
}

function describeModifications(before, after) {
  const changes = [];
  for (const field of RECORD_FIELDS) {
    if (!Object.is(before[field], after[field])) {
      const oldValue = before[field] === null ? "null" : JSON.stringify(before[field]);
      const newValue = after[field] === null ? "null" : JSON.stringify(after[field]);
      changes.push(`${field}: ${oldValue} → ${newValue}`);
    }
  }
  return changes.join("; ");
}

function compareDatabases(previous, next) {
  const beforeMap = indexRecords(previous);
  const afterMap = indexRecords(next);
  const added = [];
  const removed = [];
  const modified = [];
  let unchanged = 0;

  for (const [key, afterEntry] of afterMap) {
    const beforeEntry = beforeMap.get(key);
    if (!beforeEntry) {
      added.push(afterEntry.record);
      continue;
    }

    if (recordsEqual(beforeEntry.record, afterEntry.record)) {
      unchanged += 1;
    } else {
      modified.push({ before: beforeEntry.record, after: afterEntry.record });
    }
  }

  for (const [key, beforeEntry] of beforeMap) {
    if (!afterMap.has(key)) removed.push(beforeEntry.record);
  }

  return { added, removed, modified, unchanged };
}

function addChangeRow(type, label, detail) {
  const row = document.createElement("tr");
  const typeCell = document.createElement("td");
  const labelCell = document.createElement("td");
  const detailCell = document.createElement("td");

  typeCell.textContent = type;
  labelCell.textContent = label;
  detailCell.textContent = detail;
  row.append(typeCell, labelCell, detailCell);
  changesBody.appendChild(row);
}

function renderComparison(records) {
  comparisonCard.classList.remove("hidden");
  changesBody.replaceChildren();
  changesDetails.open = false;

  if (!currentDatabase) {
    metricNew.textContent = "—";
    metricModified.textContent = "—";
    metricRemoved.textContent = "—";
    metricSame.textContent = "—";
    comparisonNote.textContent = currentDatabaseError || "No se pudo cargar la base actual para comparar. La conversión puede continuar.";
    changesDetails.classList.add("hidden");
    return;
  }

  const comparison = compareDatabases(currentDatabase, records);
  metricNew.textContent = String(comparison.added.length);
  metricModified.textContent = String(comparison.modified.length);
  metricRemoved.textContent = String(comparison.removed.length);
  metricSame.textContent = String(comparison.unchanged);
  comparisonNote.textContent = `Base actual: ${currentDatabase.length} registro(s). Excel convertido: ${records.length} registro(s).`;

  for (const record of comparison.added) {
    addChangeRow("Nuevo", describeRecord(record), "Registro presente en el Excel nuevo y ausente en la base actual.");
  }

  for (const change of comparison.modified) {
    addChangeRow("Modificado", describeRecord(change.after), describeModifications(change.before, change.after));
  }

  for (const record of comparison.removed) {
    addChangeRow("Eliminado", describeRecord(record), "Registro presente en la base actual y ausente en el Excel nuevo.");
  }

  const totalChanges = comparison.added.length + comparison.modified.length + comparison.removed.length;
  changesDetails.classList.toggle("hidden", totalChanges === 0);
}

async function loadCurrentDatabase() {
  try {
    const response = await fetch(CURRENT_JSON_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("La base actual no contiene una lista JSON.");

    const validation = EOATValidator.validateEOATDatabase(data);
    if (!validation.ok) {
      throw new Error(`La base actual tiene ${validation.errors.length} error(es) de validación.`);
    }

    currentDatabase = data;
    currentDatabaseError = "";
  } catch (error) {
    currentDatabase = null;
    currentDatabaseError = `No se pudo cargar ./data/eoat_data.json para comparación (${error.message}). Esto no impide generar un JSON nuevo.`;
    console.warn("EOAT admin: comparación no disponible.", error);
  }
}

async function convertSelectedFile() {
  if (!selectedFile) return;

  const check = validateSelectedFile(selectedFile);
  if (!check.ok) {
    setStatus(check.message, "error");
    return;
  }

  if (!globalThis.JSZip || !globalThis.EOATXlsxReader || !globalThis.EOATConverter || !globalThis.EOATValidator) {
    setStatus("No se pudo cargar el lector local de Excel o los módulos del convertidor. Recarga la página e inténtalo de nuevo.", "error");
    return;
  }

  resetResults();
  convertBtn.disabled = true;
  excelFileInput.disabled = true;
  setStatus("Convirtiendo EOAT_data.xlsx y validando los registros…", "working");

  try {
    const converted = await EOATConverter.fileToRecords(selectedFile, EOATXlsxReader);
    const report = EOATValidator.validateEOATDatabase(converted.records);
    renderValidation(report);

    if (!report.ok) {
      setStatus(`El JSON no se generó: corrige ${report.errors.length} error(es) en EOAT_data.xlsx y vuelve a convertir.`, "error");
      renderComparison(converted.records);
      return;
    }

    // IMPORTANT: use the original conversion output for download. Validation may
    // normalize values in memory, but it must never rewrite the converted JSON.
    generatedRecords = converted.records;
    generatedJsonText = EOATConverter.recordsToJsonText(generatedRecords);
    renderComparison(generatedRecords);

    downloadBtn.disabled = false;
    const warningText = report.warnings.length ? ` con ${report.warnings.length} aviso(s)` : "";
    setStatus(`Conversión correcta: ${generatedRecords.length} registro(s)${warningText}. Ya puedes descargar ${OUTPUT_FILE_NAME}.`, report.warnings.length ? "warning" : "success");
  } catch (error) {
    console.error("EOAT admin: error de conversión", error);
    const message = error && error.message ? error.message : "No se pudo convertir el Excel.";
    setStatus(message, "error");
  } finally {
    excelFileInput.disabled = false;
    convertBtn.disabled = !validateSelectedFile(selectedFile).ok;
  }
}

function downloadGeneratedJson() {
  if (!generatedJsonText) return;

  const blob = new Blob([generatedJsonText], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = OUTPUT_FILE_NAME;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);

  setStatus(`${OUTPUT_FILE_NAME} descargado. Reemplaza manualmente data/${OUTPUT_FILE_NAME} en el proyecto o repositorio.`, "success");
}

function resetAdmin() {
  selectedFile = null;
  excelFileInput.value = "";
  excelFileInput.disabled = false;
  fileSummary.textContent = "Ningún archivo seleccionado.";
  convertBtn.disabled = true;
  resetResults();
  setStatus(`Selecciona ${EXPECTED_FILE_NAME} para comenzar.`);
  excelFileInput.focus({ preventScroll: true });
}

function initResponsiveLayout() {
  const viewport = window.visualViewport;
  let frame = 0;

  function update() {
    frame = 0;
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    const height = viewport ? viewport.height : window.innerHeight;
    if (Number.isFinite(height) && height > 0) {
      document.documentElement.style.setProperty("--app-height", `${height}px`);
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  window.addEventListener("resize", schedule, { passive: true });
  window.addEventListener("pageshow", schedule, { passive: true });
  if (viewport) viewport.addEventListener("resize", schedule, { passive: true });
  update();
}

excelFileInput.addEventListener("change", () => {
  resetResults();
  selectedFile = excelFileInput.files && excelFileInput.files[0] ? excelFileInput.files[0] : null;
  const check = validateSelectedFile(selectedFile);

  if (!selectedFile) {
    fileSummary.textContent = "Ningún archivo seleccionado.";
    convertBtn.disabled = true;
    setStatus(check.message);
    return;
  }

  const sizeKb = Math.max(1, Math.round(selectedFile.size / 1024));
  fileSummary.textContent = `${selectedFile.name} — ${sizeKb} KB`;
  convertBtn.disabled = !check.ok;
  setStatus(check.message, check.ok ? "success" : "error");
});

convertBtn.addEventListener("click", () => {
  void convertSelectedFile();
});

resetBtn.addEventListener("click", resetAdmin);
downloadBtn.addEventListener("click", downloadGeneratedJson);

document.addEventListener("DOMContentLoaded", () => {
  initResponsiveLayout();
  resetAdmin();
  void loadCurrentDatabase();

  if (!globalThis.JSZip || !globalThis.EOATXlsxReader) {
    setStatus("No se pudo cargar el lector local de Excel. Verifica que assets/vendor/jszip.min.js y eoat-xlsx-reader.js estén publicados y recarga la página.", "error");
  }

  if (mainContent) mainContent.scrollTop = 0;
});
