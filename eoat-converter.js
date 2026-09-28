/*
 * EOAT Excel -> JSON conversion engine
 * Reproduces the legacy json_converter.py data rules while enforcing
 * the fixed six-column EOAT JSON schema.
 *
 * Browser dependency for XLSX parsing: EOATXlsxReader + local JSZip.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EOATConverter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const REQUIRED_HEADERS = Object.freeze([
    "id",
    "estado",
    "nave",
    "columna",
    "fila",
    "imagen",
  ]);

  class EOATConversionError extends Error {
    constructor(message, code, details = {}) {
      super(message);
      this.name = "EOATConversionError";
      this.code = code;
      this.details = details;
    }
  }

  function isBlank(value) {
    return (
      value === null ||
      value === undefined ||
      (typeof value === "number" && Number.isNaN(value)) ||
      (typeof value === "string" && value.trim() === "")
    );
  }

  function normalizeFila(value) {
    // Legacy Python behavior:
    // df["fila"] = df["fila"].fillna("").astype(str)
    if (isBlank(value)) return "";
    if (typeof value === "boolean") return value ? "True" : "False";
    return String(value);
  }

  function normalizeRegular(value) {
    // Legacy Python behavior for all non-image columns after fila coercion:
    // NaN -> "" and whitespace-only strings -> "".
    return isBlank(value) ? "" : value;
  }

  function normalizeImage(value) {
    // Legacy Python behavior for Imagen: blank/whitespace/NaN -> null.
    return isBlank(value) ? null : value;
  }

  function assertHeaders(headers) {
    if (!Array.isArray(headers)) {
      throw new EOATConversionError(
        "No se pudo leer la fila de encabezados del Excel.",
        "HEADERS_MISSING",
      );
    }

    const actual = headers.map((value) => (value == null ? "" : String(value)));
    const exact =
      actual.length === REQUIRED_HEADERS.length &&
      REQUIRED_HEADERS.every((name, index) => actual[index] === name);

    if (!exact) {
      throw new EOATConversionError(
        `El Excel debe contener exactamente estas columnas y en este orden: ${REQUIRED_HEADERS.join(", ")}.`,
        "HEADERS_INVALID",
        { expected: [...REQUIRED_HEADERS], actual },
      );
    }
  }

  function convertRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new EOATConversionError(
        "El Excel no contiene datos.",
        "WORKBOOK_EMPTY",
      );
    }

    assertHeaders(rows[0]);

    const records = [];
    for (let index = 1; index < rows.length; index += 1) {
      const source = Array.isArray(rows[index]) ? rows[index] : [];

      // Preserve internal blank rows exactly as the legacy converter would:
      // non-image fields become "" and image becomes null.
      records.push({
        id: normalizeRegular(source[0]),
        estado: normalizeRegular(source[1]),
        nave: normalizeRegular(source[2]),
        columna: normalizeRegular(source[3]),
        fila: normalizeFila(source[4]),
        imagen: normalizeImage(source[5]),
      });
    }

    return records;
  }

  async function fileToRecords(file, reader) {
    if (!file || typeof file.arrayBuffer !== "function") {
      throw new EOATConversionError(
        "Selecciona un archivo Excel .xlsx válido.",
        "FILE_INVALID",
      );
    }
    const name = typeof file.name === "string" ? file.name : "";
    if (!name.toLowerCase().endsWith(".xlsx")) {
      throw new EOATConversionError(
        "El archivo de entrada debe ser EOAT_data.xlsx o un archivo con extensión .xlsx.",
        "FILE_EXTENSION",
        { fileName: name },
      );
    }

    const xlsxReader = reader || (typeof globalThis !== "undefined" ? globalThis.EOATXlsxReader : null);
    if (!xlsxReader || typeof xlsxReader.readRows !== "function") {
      throw new EOATConversionError(
        "No está disponible el lector local de archivos Excel.",
        "XLSX_LIBRARY_MISSING",
      );
    }

    const { sheetName, rows } = await xlsxReader.readRows(file);
    return { fileName: name, sheetName, records: convertRows(rows) };
  }

  function recordsToJsonText(records, options = {}) {
    if (!Array.isArray(records)) {
      throw new EOATConversionError(
        "No hay registros convertidos para generar el JSON.",
        "RECORDS_INVALID",
      );
    }

    // json.dump(..., indent=4, ensure_ascii=False) formatting.
    // The current production JSON was generated on Windows and uses CRLF,
    // therefore CRLF is the default to reproduce the existing file bytes.
    const lineEnding = options.lineEnding === "LF" ? "\n" : "\r\n";
    return JSON.stringify(records, null, 4).replace(/\n/g, lineEnding);
  }

  function jsonBlob(records) {
    const text = recordsToJsonText(records);
    return new Blob([text], { type: "application/json;charset=utf-8" });
  }

  return Object.freeze({
    REQUIRED_HEADERS,
    EOATConversionError,
    isBlank,
    convertRows,
    fileToRecords,
    recordsToJsonText,
    jsonBlob,
  });
});
