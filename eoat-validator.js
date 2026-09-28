/*
 * EOAT validation engine shared by the administrative converter.
 * Rules mirror the validation currently used by the EOAT web application.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EOATValidator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

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
        error("id", "ID_TYPE", "Debe ser texto no vacío; no se convierten números en identificadores.");
      } else {
        const value = input.id.trim();
        const lower = value.toLowerCase();
        id = lower === "libre" ? "Libre" : lower === "obstruido" ? "Obstruido" : value.toUpperCase();
        isTool = rules.idPattern.test(id);
        if (id.length > rules.maxIdLength || (!isTool && id !== "Libre" && id !== "Obstruido")) {
          error("id", "ID_FORMAT", 'Debe usar I- seguido de dígitos, o ser "Libre" u "Obstruido" (máximo 64 caracteres).');
        } else {
          if (id !== input.id) warning("id", "NORMALIZED", "Se normalizaron espacios externos o mayúsculas del identificador, solo en memoria.");
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
        warning("nave", "NORMALIZED", "Se convirtió la nave de texto a número, solo en memoria.");
      }
      if (!Number.isInteger(nave) || !rules.naves.includes(nave)) {
        error("nave", "NAVE_VALUE", "Debe ser 1, 2 o 3, como número o texto equivalente.");
      }

      let columna = "";
      if (typeof input.columna !== "string") {
        error("columna", "COLUMN_TYPE", "Debe ser texto con formato C01, C02, etc.");
      } else {
        columna = input.columna.trim().toUpperCase();
        if (!rules.columnPattern.test(columna)) {
          error("columna", "COLUMN_FORMAT", "Debe usar C y dos dígitos entre 01 y 99; no se inventa el número de columna.");
        } else if (columna !== input.columna) {
          warning("columna", "NORMALIZED", "Se normalizaron espacios externos o mayúsculas de la columna, solo en memoria.");
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
          warning("fila", "NORMALIZED", "Se normalizó el formato de fila a texto, conservando todas las filas indicadas.");
        }
      }

      let estado = "No especificado";
      if (input.estado == null || (typeof input.estado === "string" && !input.estado.trim())) {
        warning("estado", "DESCRIPTION_EMPTY", 'Descripción vacía: se mostrará "No especificado".');
      } else if (typeof input.estado !== "string") {
        error("estado", "DESCRIPTION_TYPE", "La descripción debe ser texto o estar vacía; no se convierten objetos ni números.");
      } else if (input.estado.length > rules.maxDescriptionLength) {
        error("estado", "DESCRIPTION_LENGTH", "La descripción supera el límite de 2048 caracteres; no se recorta automáticamente.");
      } else {
        estado = input.estado;
      }

      let imagen = null;
      if (input.imagen == null || (typeof input.imagen === "string" && !input.imagen.trim())) {
        if (isTool) warning("imagen", "IMAGE_UNASSIGNED", "Herramental sin foto asignada; se usará la imagen de respaldo.");
      } else if (typeof input.imagen !== "string") {
        error("imagen", "IMAGE_TYPE", "Debe ser un nombre de archivo de texto o null.");
      } else {
        const value = input.imagen.trim();
        if (value.length > rules.maxImageLength || !rules.imagePattern.test(value)) {
          error("imagen", "IMAGE_FILENAME", "Usa solo letras A-Z, dígitos, guion o guion bajo y una extensión permitida. No se admiten carpetas, URLs ni ../.");
        } else {
          imagen = value;
          if (imagen !== input.imagen) warning("imagen", "NORMALIZED", "Se quitaron espacios externos al nombre de foto, sin cambiar mayúsculas ni extensión.");
        }
      }

      for (const field of Object.keys(input)) {
        if (!allowedFields.has(field)) {
          warning(field, "EXTRA_FIELD", "Campo no utilizado: se omite de la copia en memoria, sin modificar el JSON.");
        }
      }

      if (errors.length === previousErrors) {
        records.push(Object.freeze({ id, estado, nave, columna, fila, imagen }));
      }
    }

    const ok = errors.length === 0;
    return {
      ok,
      data: ok ? Object.freeze(records) : null,
      totalRecords: rawData.length,
      errors,
      warnings,
    };
  }

  return Object.freeze({
    EOAT_VALIDATION_RULES,
    validateEOATDatabase,
  });
});
