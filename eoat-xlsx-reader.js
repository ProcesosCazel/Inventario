/*
 * EOAT XLSX reader (browser-only)
 * Reads .xlsx files locally with JSZip and exposes the first worksheet as
 * row arrays compatible with the EOAT conversion engine.
 *
 * External dependency: ./assets/vendor/jszip.min.js
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EOATXlsxReader = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

  class EOATXlsxReadError extends Error {
    constructor(message, code, details = {}) {
      super(message);
      this.name = "EOATXlsxReadError";
      this.code = code;
      this.details = details;
    }
  }

  function parseXml(text, label) {
    const parser = new DOMParser();
    const documentNode = parser.parseFromString(text, "application/xml");
    const parserError = documentNode.querySelector("parsererror");
    if (parserError) {
      throw new EOATXlsxReadError(
        `No se pudo interpretar ${label} del archivo Excel.`,
        "XML_INVALID",
        { label },
      );
    }
    return documentNode;
  }

  async function zipText(zip, path, required = true) {
    const entry = zip.file(path);
    if (!entry) {
      if (!required) return null;
      throw new EOATXlsxReadError(
        `El archivo Excel no contiene ${path}.`,
        "XLSX_PART_MISSING",
        { path },
      );
    }
    return entry.async("text");
  }

  function normalizedPath(baseFolder, target) {
    const clean = String(target || "").replace(/\\/g, "/");
    if (!clean || clean.includes(":") || clean.startsWith("//")) {
      throw new EOATXlsxReadError(
        "El Excel contiene una referencia de hoja no compatible.",
        "XLSX_RELATIONSHIP_INVALID",
        { target: clean },
      );
    }

    const parts = (clean.startsWith("/") ? clean.slice(1) : `${baseFolder}/${clean}`).split("/");
    const stack = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") {
        if (!stack.length) {
          throw new EOATXlsxReadError(
            "El Excel contiene una ruta interna no válida.",
            "XLSX_RELATIONSHIP_INVALID",
            { target: clean },
          );
        }
        stack.pop();
      } else {
        stack.push(part);
      }
    }
    return stack.join("/");
  }

  function xmlTextContent(node) {
    if (!node) return "";
    const textNodes = Array.from(node.getElementsByTagNameNS("*", "t"));
    if (textNodes.length) return textNodes.map((item) => item.textContent || "").join("");
    return node.textContent || "";
  }

  function parseSharedStrings(xml) {
    if (!xml) return [];
    const documentNode = parseXml(xml, "sharedStrings.xml");
    return Array.from(documentNode.getElementsByTagNameNS("*", "si")).map(xmlTextContent);
  }

  function firstWorksheetInfo(workbookXml, relationshipsXml) {
    const workbook = parseXml(workbookXml, "workbook.xml");
    const relationships = parseXml(relationshipsXml, "workbook.xml.rels");
    const firstSheet = workbook.getElementsByTagNameNS("*", "sheet")[0];

    if (!firstSheet) {
      throw new EOATXlsxReadError(
        "El archivo Excel no contiene hojas.",
        "SHEET_MISSING",
      );
    }

    const sheetName = firstSheet.getAttribute("name") || "Hoja1";
    const relationId =
      firstSheet.getAttributeNS(REL_NS, "id") ||
      firstSheet.getAttribute("r:id") ||
      "";

    const relationship = Array.from(
      relationships.getElementsByTagNameNS("*", "Relationship"),
    ).find((item) => item.getAttribute("Id") === relationId);

    if (!relationship) {
      throw new EOATXlsxReadError(
        "No se pudo localizar la primera hoja del Excel.",
        "SHEET_RELATIONSHIP_MISSING",
        { sheetName, relationId },
      );
    }

    const target = relationship.getAttribute("Target");
    return {
      sheetName,
      sheetPath: normalizedPath("xl", target),
    };
  }

  function columnIndex(cellReference) {
    const match = /^([A-Z]+)[0-9]+$/i.exec(String(cellReference || ""));
    if (!match) return -1;
    let index = 0;
    for (const char of match[1].toUpperCase()) {
      index = index * 26 + (char.charCodeAt(0) - 64);
    }
    return index - 1;
  }

  function dimensionBounds(documentNode) {
    const dimension = documentNode.getElementsByTagNameNS("*", "dimension")[0];
    const reference = dimension ? dimension.getAttribute("ref") : "";
    const end = String(reference || "").split(":").pop();
    const match = /^([A-Z]+)([0-9]+)$/i.exec(end || "");
    if (!match) return { maxColumn: 0, maxRow: 0 };
    return {
      maxColumn: columnIndex(`${match[1]}1`) + 1,
      maxRow: Number(match[2]) || 0,
    };
  }

  function cellValue(cell, sharedStrings) {
    const type = cell.getAttribute("t") || "";
    const valueNode = cell.getElementsByTagNameNS("*", "v")[0];

    if (type === "inlineStr") {
      const inline = cell.getElementsByTagNameNS("*", "is")[0];
      return inline ? xmlTextContent(inline) : "";
    }

    if (!valueNode) return null;
    const raw = valueNode.textContent || "";

    switch (type) {
      case "s": {
        const index = Number(raw);
        return Number.isInteger(index) && index >= 0 && index < sharedStrings.length
          ? sharedStrings[index]
          : "";
      }
      case "b":
        return raw === "1";
      case "str":
      case "d":
      case "e":
        return raw;
      default: {
        if (raw === "") return null;
        const numeric = Number(raw);
        return Number.isNaN(numeric) ? raw : numeric;
      }
    }
  }

  function worksheetRows(sheetXml, sharedStrings) {
    const documentNode = parseXml(sheetXml, "la primera hoja");
    const bounds = dimensionBounds(documentNode);
    const rowNodes = Array.from(documentNode.getElementsByTagNameNS("*", "row"));

    let maxRow = bounds.maxRow;
    let maxColumn = bounds.maxColumn;
    for (const rowNode of rowNodes) {
      const rowNumber = Number(rowNode.getAttribute("r"));
      if (Number.isInteger(rowNumber) && rowNumber > maxRow) maxRow = rowNumber;
      for (const cell of Array.from(rowNode.getElementsByTagNameNS("*", "c"))) {
        const index = columnIndex(cell.getAttribute("r"));
        if (index + 1 > maxColumn) maxColumn = index + 1;
      }
    }

    if (!maxRow || !maxColumn) return [];

    const rows = Array.from({ length: maxRow }, () => Array(maxColumn).fill(null));

    let fallbackRowNumber = 1;
    for (const rowNode of rowNodes) {
      const explicitRow = Number(rowNode.getAttribute("r"));
      const rowNumber = Number.isInteger(explicitRow) && explicitRow > 0 ? explicitRow : fallbackRowNumber;
      fallbackRowNumber = rowNumber + 1;
      const targetRow = rows[rowNumber - 1];
      if (!targetRow) continue;

      let fallbackColumn = 0;
      for (const cell of Array.from(rowNode.getElementsByTagNameNS("*", "c"))) {
        const explicitColumn = columnIndex(cell.getAttribute("r"));
        const column = explicitColumn >= 0 ? explicitColumn : fallbackColumn;
        fallbackColumn = column + 1;
        if (column >= targetRow.length) continue;
        targetRow[column] = cellValue(cell, sharedStrings);
      }
    }

    return rows;
  }

  async function readRows(file) {
    if (!file || typeof file.arrayBuffer !== "function") {
      throw new EOATXlsxReadError(
        "Selecciona un archivo Excel .xlsx válido.",
        "FILE_INVALID",
      );
    }
    if (!root.JSZip || typeof root.JSZip.loadAsync !== "function") {
      throw new EOATXlsxReadError(
        "No está disponible el lector local de archivos Excel.",
        "ZIP_LIBRARY_MISSING",
      );
    }

    let zip;
    try {
      zip = await root.JSZip.loadAsync(await file.arrayBuffer());
    } catch (error) {
      throw new EOATXlsxReadError(
        "El archivo seleccionado no es un .xlsx válido o está dañado.",
        "XLSX_ZIP_INVALID",
        { cause: String(error && error.message ? error.message : error) },
      );
    }

    const workbookXml = await zipText(zip, "xl/workbook.xml");
    const relationshipsXml = await zipText(zip, "xl/_rels/workbook.xml.rels");
    const sharedStringsXml = await zipText(zip, "xl/sharedStrings.xml", false);
    const sharedStrings = parseSharedStrings(sharedStringsXml);
    const { sheetName, sheetPath } = firstWorksheetInfo(workbookXml, relationshipsXml);
    const sheetXml = await zipText(zip, sheetPath);
    const rows = worksheetRows(sheetXml, sharedStrings);

    return { sheetName, rows };
  }

  return Object.freeze({
    EOATXlsxReadError,
    readRows,
  });
});
