/* Inventario EOAT v3.0 | Paso 2. Modelo de ubicaciones (solo lectura).
 * Recibe registros ya aprobados por el validador de v2.0. No hace fetch,
 * no modifica datos/configuracion y no conoce el DOM ni fotografias.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EOATMapModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STATUS = Object.freeze({ UNKNOWN: 'unknown', TOOLS: 'tools', FREE: 'free', BLOCKED: 'blocked', REVIEW: 'review' });
  const rackKey = (nave, column) => `N${nave}-${column}`;
  const locationKey = (key, level) => `${key}-F${level}`;
  const freezeList = (values) => Object.freeze(values);

  function parseLevels(text) {
    if (typeof text !== 'string' || !/^[1-9][0-9]*(?: y [1-9][0-9]*)*$/.test(text)) {
      throw new TypeError('Fila sin validar: se esperaba texto como "2" o "2 y 3".');
    }
    const values = text.split(' y ').map(Number);
    if (values.some((n, i) => !Number.isSafeInteger(n) || (i > 0 && n <= values[i - 1]))) {
      throw new TypeError('Fila sin validar: niveles repetidos, fuera de orden o no seguros.');
    }
    return freezeList(values);
  }

  function validateConfiguration(config) {
    if (!config || !Array.isArray(config.warehouses) || config.warehouses.length !== 2) {
      throw new TypeError('El mapa requiere los dos almacenes configurados.');
    }
    const keys = new Set(), ids = new Set(), naves = new Set();
    for (const warehouse of config.warehouses) {
      if (!warehouse.id || ids.has(warehouse.id)) throw new Error('Identificador de almac\u00e9n duplicado o vac\u00edo.');
      ids.add(warehouse.id);
      if (!Array.isArray(warehouse.naves) || !warehouse.naves.length) throw new Error('Faltan naves del almac\u00e9n.');
      for (const nave of warehouse.naves) {
        if (![1, 2, 3].includes(nave) || naves.has(nave)) throw new Error('Nave repetida o no reconocida en la configuraci\u00f3n.');
        naves.add(nave);
      }
      const box = warehouse.viewBox;
      if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) throw new Error('ViewBox no v\u00e1lido.');
      if (!Array.isArray(warehouse.racks) || !warehouse.racks.length) throw new Error('Faltan columnas configuradas.');
      for (const rack of warehouse.racks) {
        if (keys.has(rack.key) || rack.key !== rackKey(rack.nave, rack.column) || !/^C(?:0[1-9]|[1-9][0-9])$/.test(rack.column) || !warehouse.naves.includes(rack.nave)) throw new Error(`Columna no v\u00e1lida: ${rack.key}.`);
        keys.add(rack.key);
        if (![rack.x, rack.y, rack.width, rack.height].every(Number.isFinite) || rack.width <= 0 || rack.height <= 0 || rack.x < box[0] || rack.y < box[1] || rack.x + rack.width > box[0] + box[2] || rack.y + rack.height > box[1] + box[3]) throw new Error(`Columna fuera del dibujo: ${rack.key}.`);
        if (!Array.isArray(rack.levels) || !rack.levels.length || rack.levels.some((n) => !Number.isSafeInteger(n) || n <= 0) || new Set(rack.levels).size !== rack.levels.length) throw new Error(`Niveles no v\u00e1lidos: ${rack.key}.`);
        const display = rack.display;
        if (!display || !['x', 'y'].includes(display.axis) || !['above', 'below', 'left', 'right'].includes(display.labelSide) || !Array.isArray(display.levelOrder) || [...display.levelOrder].sort((a,b) => a-b).join(',') !== [...rack.levels].sort((a,b) => a-b).join(',')) throw new Error(`Orientaci\u00f3n no v\u00e1lida: ${rack.key}.`);
      }
    }
    return true;
  }

  function classify(entries) {
    if (!entries.length) return STATUS.UNKNOWN;
    const kinds = new Set(entries.map((entry) => entry.kind));
    if (kinds.size > 1) return STATUS.REVIEW;
    return entries[0].kind === 'tool' ? STATUS.TOOLS : entries[0].kind === 'free' ? STATUS.FREE : STATUS.BLOCKED;
  }

  function build(records, config) {
    if (!Array.isArray(records)) throw new TypeError('El modelo requiere una lista validada.');
    validateConfiguration(config);
    const racks = new Map(), cells = new Map(), entries = [], issues = [], unmapped = [];
    const warehouseByNave = new Map(), toolIds = new Set();
    config.warehouses.forEach((warehouse) => {
      warehouse.naves.forEach((nave) => warehouseByNave.set(nave, warehouse.id));
      warehouse.racks.forEach((rack) => {
        racks.set(rack.key, { config: rack, warehouseId: warehouse.id, entries: [], levels: [] });
        rack.levels.forEach((level) => {
          const cell = { key: locationKey(rack.key, level), rackKey: rack.key, level, entries: [] };
          cells.set(cell.key, cell); racks.get(rack.key).levels.push(cell);
        });
      });
    });
    function issue(code, message, entry, key, level) {
      issues.push(Object.freeze({ code, message, recordIndex: entry ? entry.index : null, id: entry ? entry.record.id : null, rackKey: key || null, level: level || null }));
    }
    records.forEach((record, index) => {
      if (!record || typeof record !== 'object' || typeof record.id !== 'string' || ![1,2,3].includes(record.nave) || typeof record.columna !== 'string') throw new TypeError(`Registro ${index + 1} sin validar.`);
      const kind = /^I-[0-9]+(?: \([1-9][0-9]*\))?$/.test(record.id) ? 'tool' : record.id === 'Libre' ? 'free' : record.id === 'Obstruido' ? 'blocked' : null;
      if (!kind) throw new TypeError(`Registro ${index + 1}: ID sin validar.`);
      if (kind === 'tool') {
        if (toolIds.has(record.id)) throw new TypeError(`Registro ${index + 1}: ID duplicado sin validar.`);
        toolIds.add(record.id);
      }
      const key = rackKey(record.nave, record.columna);
      const levels = parseLevels(record.fila);
      const rack = racks.get(key);
      const matched = rack ? levels.filter((level) => cells.has(locationKey(key, level))) : [];
      const missing = levels.filter((level) => !matched.includes(level));
      const entry = Object.freeze({ index: index + 1, record, kind, rackKey: key,
        warehouseId: warehouseByNave.get(record.nave) || null, levels,
        mappedLevels: freezeList(matched), missingLevels: freezeList(missing),
        mapping: matched.length === levels.length ? 'complete' : matched.length ? 'partial' : 'none' });
      entries.push(entry);
      if (rack) rack.entries.push(entry);
      matched.forEach((level) => cells.get(locationKey(key, level)).entries.push(entry));
      if (!rack) issue('UNMAPPED_COLUMN', 'La columna no existe en la distribuci\u00f3n aprobada.', entry, key);
      else if (missing.length) issue('UNMAPPED_LEVEL', `Nivel(es) sin configurar: ${missing.map((n) => `F${n}`).join(', ')}.`, entry, key);
      if (entry.mapping !== 'complete') unmapped.push(entry);
    });
    for (const cell of cells.values()) {
      cell.status = classify(cell.entries);
      cell.toolCount = cell.entries.filter((entry) => entry.kind === 'tool').length;
      if (cell.status === STATUS.REVIEW) issue('LOCATION_CONFLICT', 'Coexisten herramentales y/o estados de espacio incompatibles; no se elige uno autom\u00e1ticamente.', null, cell.rackKey, cell.level);
      for (const kind of ['free', 'blocked']) {
        if (cell.entries.filter((entry) => entry.kind === kind).length > 1) issue('REPEATED_MARKER', 'El mismo estado de espacio est\u00e1 registrado m\u00e1s de una vez en este nivel.', null, cell.rackKey, cell.level);
      }
      freezeList(cell.entries); Object.freeze(cell);
    }
    for (const rack of racks.values()) {
      rack.toolCount = new Set(rack.entries.filter((entry) => entry.kind === 'tool').map((entry) => entry.record.id)).size;
      rack.hasIssues = issues.some((item) => item.rackKey === rack.config.key);
      freezeList(rack.entries); freezeList(rack.levels); Object.freeze(rack);
    }
    function summarize(subset, rackSubset) {
      const localCells = rackSubset.flatMap((rack) => rack.levels);
      return Object.freeze({ totalRecords: subset.length, toolCount: new Set(subset.filter((e) => e.kind === 'tool').map((e) => e.record.id)).size,
        freeRecords: subset.filter((e) => e.kind === 'free').length, blockedRecords: subset.filter((e) => e.kind === 'blocked').length,
        multipleLevelTools: subset.filter((e) => e.kind === 'tool' && e.levels.length > 1).length,
        completeRecords: subset.filter((e) => e.mapping === 'complete').length,
        partialRecords: subset.filter((e) => e.mapping === 'partial').length,
        unmappedRecords: subset.filter((e) => e.mapping === 'none').length,
        columns: rackSubset.length, locations: localCells.length,
        unknownLocations: localCells.filter((c) => c.status === STATUS.UNKNOWN).length,
        conflictLocations: localCells.filter((c) => c.status === STATUS.REVIEW).length });
    }
    const warehouses = new Map();
    config.warehouses.forEach((warehouse) => {
      const localRacks = warehouse.racks.map((rack) => racks.get(rack.key));
      warehouses.set(warehouse.id, summarize(entries.filter((e) => e.warehouseId === warehouse.id), localRacks));
    });
    return Object.freeze({ entries: freezeList(entries), issues: freezeList(issues), unmapped: freezeList(unmapped),
      stats: summarize(entries, [...racks.values()]),
      getRack: (key) => racks.get(key) || null,
      getLocation: (key, level) => cells.get(locationKey(key, level)) || null,
      getWarehouseStats: (id) => warehouses.get(id) || null });
  }
  return Object.freeze({ STATUS, parseLevels, validateConfiguration, build });
});
