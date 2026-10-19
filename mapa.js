/* EOAT v3.0 - Touch-first map. Data comes only from the validated main.js snapshot.
 * No network requests, backend, storage, JSON changes or manual rack text.
 */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const STATUS = { unknown: 'Sin informaci\u00f3n', tools: 'EOAT', free: 'Libre', blocked: 'Obstruido', review: 'Revisar datos' };

  function html(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function svgNode(tag, attrs, text) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function mount(container, options = {}) {
    const config = options.config || root.EOAT_MAP_CONFIG;
    const engine = root.EOATMapModel;
    if (!container || !engine) throw new Error('El mapa requiere mapa-model.js y su contenedor.');
    engine.validateConfiguration(config);

    const viewport = container.querySelector('#eoat-map-viewport');
    const svg = container.querySelector('#eoat-map-svg');
    const status = container.querySelector('#eoat-map-status');
    const errorBox = container.querySelector('#eoat-map-error');
    const panel = container.querySelector('#eoat-map-panel');
    const tabs = [...container.querySelectorAll('[data-map-warehouse]')];
    const tabsHost = container.querySelector('.map-tabs');
    const dialog = document.getElementById('eoat-rack-popup');
    const dialogClose = document.getElementById('eoat-rack-close');
    const dialogTitle = document.getElementById('eoat-rack-title');
    const dialogContent = document.getElementById('eoat-rack-levels');
    if (![viewport, svg, status, errorBox, panel, tabsHost, dialog, dialogClose, dialogTitle, dialogContent].every(Boolean)) {
      throw new Error('Faltan elementos de la pantalla del mapa o de su popup.');
    }

    const unlisten = [];
    function listen(target, type, fn, options) {
      target.addEventListener(type, fn, options);
      unlisten.push(() => target.removeEventListener(type, fn, options));
    }
    let warehouse = config.warehouses[0], model = null, modelRecords = null;
    let snapshot = { state: 'idle', records: null, error: '', notice: '' };
    let usable = false, disposed = false, pendingFrame = 0;
    const rackNodes = new Map(), levelNodes = new Map();
    const scrollPositions = new Map();
    // 100% retains the original readable scale for each approved warehouse.
    // No changes to the JSON loader, SVG geometry or rack model.
    const ZOOM_OPTIONS = Object.freeze([50, 75, 100, 125, 150, 175, 200, 225, 250]);
    const ZOOM_MIN = 50, ZOOM_MAX = 250;
    const zoomToolbar = html('div', undefined, 'map-toolbar');
    const zoomRow = html('div', undefined, 'map-zoom-row');
    const zoomLabel = html('label', 'Zoom', 'map-zoom-label');
    const zoomSelect = html('select', undefined, 'map-zoom-select');
    zoomSelect.id = 'eoat-map-zoom';
    zoomLabel.htmlFor = zoomSelect.id;
    zoomSelect.title = 'Acercamiento del mapa en porcentaje';
    for (const percent of ZOOM_OPTIONS) {
      const option = html('option', `${percent}%`);
      option.value = String(percent);
      zoomSelect.append(option);
    }
    zoomRow.append(zoomLabel, zoomSelect);
    tabsHost.before(zoomToolbar);
    zoomToolbar.append(tabsHost, zoomRow);
    let selectedRack = null, dialogOpener = null;
    let restoreScrollOnNextFrame = false;
    // One-finger scrolling is native. Two-finger pinch changes only the SVG size.
    const scales = new Map();
    let pinch = null, ignoreClickUntil = 0, gestureStart = null;

    function baseScale(forWarehouse = warehouse) {
      // Relative 100% = the readable size used before this update.
      return forWarehouse.id === 'almacen-n1' ? 1.45 : 1.2;
    }
    function currentScale() {
      if (!scales.has(warehouse.id)) scales.set(warehouse.id, baseScale());
      return scales.get(warehouse.id);
    }
    function syncZoomSelect() {
      const percentage = Math.round(100 * currentScale() / baseScale());
      let custom = zoomSelect.querySelector('[data-map-custom-zoom]');
      if (ZOOM_OPTIONS.includes(percentage)) {
        if (custom) custom.remove();
      } else {
        if (!custom) {
          custom = html('option');
          custom.dataset.mapCustomZoom = 'true';
          zoomSelect.append(custom);
        }
        custom.value = String(percentage);
        custom.textContent = `${percentage}%`;
      }
      zoomSelect.value = String(percentage);
    }
    function setZoomPercent(percentage) {
      if (!Number.isFinite(percentage)) return;
      const oldScale = currentScale();
      const nextScale = baseScale() * clamp(percentage, ZOOM_MIN, ZOOM_MAX) / 100;
      // Preserve the visible map center when changing zoom through the dropdown.
      const x = viewport.clientWidth / 2;
      const y = viewport.clientHeight / 2;
      const worldX = (viewport.scrollLeft + x) / oldScale;
      const worldY = (viewport.scrollTop + y) / oldScale;
      scales.set(warehouse.id, nextScale);
      fitScrollableSize();
      viewport.scrollLeft = worldX * nextScale - x;
      viewport.scrollTop = worldY * nextScale - y;
      scrollPositions.set(warehouse.id, { left: viewport.scrollLeft, top: viewport.scrollTop });
      onVisible();
    }
    function fitScrollableSize() {
      const [x, y, w, h] = warehouse.viewBox;
      const scale = currentScale();
      svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
      svg.style.width = `${Math.round(w * scale)}px`;
      svg.style.height = `${Math.round(h * scale)}px`;
      viewport.dataset.mapWarehouse = warehouse.id;
      viewport.dataset.mapScale = scale.toFixed(3);
      syncZoomSelect();
    }
    function onVisible() {
      if (disposed || pendingFrame) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        fitScrollableSize();
        if (restoreScrollOnNextFrame && viewport.clientWidth > 0) {
          const old = scrollPositions.get(warehouse.id) || { left: 0, top: 0 };
          viewport.scrollLeft = old.left;
          viewport.scrollTop = old.top;
          restoreScrollOnNextFrame = false;
        }
      });
    }
    function touchPoint(touch) {
      const rect = viewport.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    function touchDistance(first, second) {
      return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    }
    function touchMidpoint(first, second) {
      const a = touchPoint(first), b = touchPoint(second);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    function beginPinch(touches) {
      if (touches.length < 2) return;
      const [a, b] = touches;
      const center = touchMidpoint(a, b), scale = currentScale();
      pinch = {
        distance: Math.max(10, touchDistance(a, b)), scale,
        worldX: (viewport.scrollLeft + center.x) / scale,
        worldY: (viewport.scrollTop + center.y) / scale,
      };
      ignoreClickUntil = performance.now() + 500;
    }
    function onTouchStart(event) {
      if (event.touches.length >= 2) beginPinch(event.touches);
      else if (event.touches.length === 1) gestureStart = touchPoint(event.touches[0]);
    }
    function onTouchMove(event) {
      if (event.touches.length >= 2) {
        // Preserve native one-finger scrollbars; intercept only two-finger pinch.
        if (event.cancelable) event.preventDefault();
        if (!pinch) beginPinch(event.touches);
        const [a, b] = event.touches;
        const targetScale = clamp(pinch.scale * touchDistance(a, b) / pinch.distance,
          baseScale() * ZOOM_MIN / 100, baseScale() * ZOOM_MAX / 100);
        scales.set(warehouse.id, targetScale);
        fitScrollableSize();
        const mid = touchMidpoint(a, b);
        viewport.scrollLeft = pinch.worldX * targetScale - mid.x;
        viewport.scrollTop = pinch.worldY * targetScale - mid.y;
        ignoreClickUntil = performance.now() + 500;
      } else if (event.touches.length === 1 && gestureStart) {
        const point = touchPoint(event.touches[0]);
        if (Math.hypot(point.x - gestureStart.x, point.y - gestureStart.y) > 12) {
          ignoreClickUntil = performance.now() + 400;
        }
      }
    }
    function onTouchEnd(event) {
      if (event.touches.length < 2) pinch = null;
      if (!event.touches.length) gestureStart = null;
    }
    function clickGuard(event) {
      if (event.detail && performance.now() < ignoreClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    function labelFor(rack) {
      const pos = { x: rack.width / 2, y: -20, class: 'map-rack-label' };
      if (rack.display.labelSide === 'below') pos.y = rack.height + 25;
      if (rack.display.labelSide === 'left' || rack.display.labelSide === 'right') {
        pos.x = rack.display.labelSide === 'left' ? -24 : rack.width + 25;
        pos.y = rack.height / 2;
        pos.transform = `rotate(${rack.display.labelSide === 'left' ? -90 : 90} ${pos.x} ${pos.y})`;
      }
      return pos;
    }
    function drawRack(rack) {
      const group = svgNode('g', { class: `map-rack map-rack-n${rack.nave}`,
        transform: `translate(${rack.x} ${rack.y})`, role: 'button', tabindex: '0',
        'aria-label': `Nave ${rack.nave}, columna ${rack.column}. Abrir detalle.`,
        'data-map-rack': rack.key });
      group.append(svgNode('title', {}, `N${rack.nave} / ${rack.column}`));
      group.append(svgNode('rect', { class: 'map-rack-outline', x: 0, y: 0,
        width: rack.width, height: rack.height, rx: 7 }));
      const order = rack.display.levelOrder, inset = 5, gap = 4;
      order.forEach((level, index) => {
        const horizontal = rack.display.axis === 'x';
        const w = horizontal ? (rack.width - 2 * inset - (order.length - 1) * gap) / order.length : rack.width - 2 * inset;
        const h = horizontal ? rack.height - 2 * inset : (rack.height - 2 * inset - (order.length - 1) * gap) / order.length;
        const x = inset + (horizontal ? index * (w + gap) : 0);
        const y = inset + (horizontal ? 0 : index * (h + gap));
        const cell = svgNode('g', { class: 'map-cell', 'data-level': level });
        const title = svgNode('title');
        const bg = svgNode('rect', { class: 'map-cell-bg', x, y, width: w, height: h, rx: 3 });
        const levelText = svgNode('text', { class: 'map-level-label', x: x + w / 2, y: y + h * 0.32 }, `F${level}`);
        const value = svgNode('text', { class: 'map-level-value', x: x + w / 2, y: y + h * (horizontal ? 0.62 : 0.75) }, '\u00b7');
        cell.append(title, bg, levelText, value); group.append(cell);
        levelNodes.set(`${rack.key}-F${level}`, { cell, title, value, rack, level, horizontal });
      });
      group.append(svgNode('text', labelFor(rack), rack.column));
      group.append(svgNode('rect', { class: 'map-select-ring', x: -5, y: -5,
        width: rack.width + 10, height: rack.height + 10, rx: 10 }));
      group.addEventListener('click', (event) => {
        const cell = event.target.closest('[data-level]');
        openRack(rack.key, cell ? Number(cell.dataset.level) : null, group);
      });
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); openRack(rack.key, null, group);
        }
      });
      rackNodes.set(rack.key, group);
      return group;
    }
    function updateCells() {
      levelNodes.forEach(({ cell, title, value, rack, level, horizontal }) => {
        const data = usable && model ? model.getLocation(rack.key, level) : null;
        cell.dataset.status = data ? data.status : 'waiting';
        let shown = '\u00b7', description = 'Inventario no cargado';
        if (data) {
          description = STATUS[data.status];
          if (data.status === 'tools') shown = String(data.toolCount);
          else shown = { unknown: '?', free: horizontal ? 'L' : 'Libre',
            blocked: horizontal ? 'B' : 'Bloq.', review: '!' }[data.status];
          if (data.entries.length) description += ': ' + data.entries.map((e) => e.record.id).join(', ');
        }
        value.textContent = shown;
        title.textContent = `N${rack.nave} / ${rack.column} / F${level}: ${description}`;
      });
      rackNodes.forEach((group, key) => {
        const data = usable && model ? model.getRack(key) : null;
        const r = warehouse.racks.find((item) => item.key === key);
        group.setAttribute('aria-label', `Nave ${r.nave}, columna ${r.column}. ${data ? data.toolCount + ' EOAT registrados.' : 'Sin inventario cargado.'} Abrir detalle.`);
        group.classList.toggle('map-rack-selected', selectedRack === key);
      });
    }

    function makeRecord(entry) {
      const row = html('div', undefined, 'map-popup-record');
      if (entry.kind === 'tool') {
        const button = html('button', entry.record.id, 'map-eoat-button');
        button.type = 'button';
        button.dataset.mapEoat = entry.record.id;
        button.setAttribute('aria-label', `Abrir ficha de ${entry.record.id}`);
        button.addEventListener('click', () => {
          closeRack(false);
          if (typeof options.onOpenRecord === 'function') options.onOpenRecord(entry.record, button);
        });
        row.append(button);
        const subtitle = entry.levels.length > 1 ? `Filas ${entry.record.fila} \u00b7 ${entry.record.estado || 'EOAT'}` : entry.record.estado || 'EOAT';
        row.append(html('span', subtitle, 'map-popup-description'));
      } else {
        row.append(html('strong', STATUS[entry.kind] || entry.record.id));
      }
      if (entry.mapping !== 'complete') row.append(html('small', 'Ubicaci\u00f3n incompleta', 'map-popup-warning'));
      return row;
    }
    function renderRackDialog(rack, level) {
      const data = usable && model ? model.getRack(rack.key) : null;
      dialogTitle.textContent = `Nave ${rack.nave} \u00b7 ${rack.column}`;
      dialogContent.replaceChildren();
      for (const levelData of (data ? data.levels : rack.levels.map((n) => ({ level: n, status: 'unknown', entries: [] })))) {
        const block = html('section', undefined, 'map-popup-level');
        const heading = html('h3', `Fila ${levelData.level}`, 'map-popup-level-title');
        if (level === levelData.level) block.classList.add('map-popup-level-selected');
        block.append(heading);
        if (!usable) block.append(html('p', 'Inventario no disponible', 'map-popup-empty'));
        else if (!levelData.entries.length) block.append(html('p', STATUS.unknown, 'map-popup-empty'));
        else {
          if (levelData.status === 'review') block.append(html('p', STATUS.review, 'map-popup-warning'));
          levelData.entries.forEach((entry) => block.append(makeRecord(entry)));
        }
        dialogContent.append(block);
      }
    }
    function openRack(key, level = null, opener = null) {
      const rack = warehouse.racks.find((r) => r.key === key);
      if (!rack) return;
      selectedRack = key;
      dialogOpener = opener || rackNodes.get(key) || viewport;
      updateCells();
      renderRackDialog(rack, level);
      dialog.classList.remove('hidden');
      dialogClose.focus({ preventScroll: true });
    }
    function closeRack(restoreFocus = true) {
      if (dialog.classList.contains('hidden')) return;
      dialog.classList.add('hidden');
      if (restoreFocus && dialogOpener && dialogOpener.isConnected) dialogOpener.focus({ preventScroll: true });
      dialogOpener = null;
    }
    function showWarehouse(id) {
      const next = config.warehouses.find((w) => w.id === id);
      if (!next || disposed) return;
      if (warehouse.id === id && rackNodes.size) { onVisible(); return; }
      // Remember each warehouse's scrollbar position independently.
      if (rackNodes.size) scrollPositions.set(warehouse.id, {
        left: viewport.scrollLeft, top: viewport.scrollTop,
      });
      closeRack(false);
      warehouse = next; selectedRack = null;
      rackNodes.clear(); levelNodes.clear(); svg.replaceChildren();
      svg.append(svgNode('title', { id: 'eoat-map-svg-title' }, warehouse.label));
      svg.append(svgNode('desc', { id: 'eoat-map-svg-desc' }, warehouse.description));
      warehouse.racks.forEach((rack) => svg.append(drawRack(rack)));
      warehouse.landmarks.forEach((landmark) => {
        const group = svgNode('g', { class: 'map-landmark' });
        group.append(svgNode('rect', { x: landmark.x, y: landmark.y,
          width: landmark.width, height: landmark.height, rx: 6 }));
        group.append(svgNode('text', { x: landmark.x + landmark.width / 2,
          y: landmark.y + landmark.height / 2 }, landmark.label));
        svg.append(group);
      });
      tabs.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mapWarehouse === id)));
      container.dataset.mapWarehouse = id;
      fitScrollableSize();
      restoreScrollOnNextFrame = true;
      updateCells(); onVisible();
    }
    function setSnapshot(next) {
      if (disposed || !next) return;
      if (snapshot.state === next.state && snapshot.records === next.records &&
          snapshot.error === next.error && snapshot.notice === next.notice) return;
      snapshot = next;
      const canUse = ['ready', 'empty', 'stale'].includes(next.state) && Array.isArray(next.records);
      errorBox.classList.add('hidden');
      if (canUse && next.records !== modelRecords) {
        try { model = engine.build(next.records, config); modelRecords = next.records; }
        catch (error) {
          console.error('Error en el modelo de mapas', error);
          errorBox.textContent = `No se pudo dibujar el inventario: ${error.message}`;
          errorBox.classList.remove('hidden');
          model = null; modelRecords = null;
        }
      }
      usable = canUse && Boolean(model);
      const messages = [];
      if (next.state === 'loading') messages.push('Cargando inventario...');
      else if (!usable) messages.push(next.error || 'Inventario no disponible');
      else if (!model.stats.totalRecords) messages.push('Inventario sin registros');
      if (usable && model.issues.length) {
        messages.push(`${model.issues.length} aviso(s) de ubicaci\u00f3n. Consulta el JSON.`);
        console.warn('EOAT: avisos del mapa', model.issues);
      }
      status.textContent = messages.join(' ');
      status.classList.toggle('hidden', !messages.length);
      panel.setAttribute('aria-busy', String(next.state === 'loading'));
      updateCells();
      if (!dialog.classList.contains('hidden') && selectedRack) {
        const rack = warehouse.racks.find((r) => r.key === selectedRack);
        if (rack) renderRackDialog(rack);
      }
    }
    function trapModalFocus(event) {
      if (dialog.classList.contains('hidden')) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRack(); return; }
      if (event.key !== 'Tab') return;
      const focusables = [...dialog.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusables.length) return;
      const index = focusables.indexOf(document.activeElement);
      if (event.shiftKey && (index <= 0)) { event.preventDefault(); focusables[focusables.length - 1].focus(); }
      else if (!event.shiftKey && index === focusables.length - 1) { event.preventDefault(); focusables[0].focus(); }
    }

    tabs.forEach((button) => listen(button, 'click', () => showWarehouse(button.dataset.mapWarehouse)));
    listen(zoomSelect, 'change', () => setZoomPercent(Number(zoomSelect.value)));
    listen(viewport, 'touchstart', onTouchStart, { passive: true });
    listen(viewport, 'touchmove', onTouchMove, { passive: false });
    listen(viewport, 'touchend', onTouchEnd, { passive: true });
    listen(viewport, 'touchcancel', onTouchEnd, { passive: true });
    listen(viewport, 'click', clickGuard, true);
    listen(dialogClose, 'click', () => closeRack());
    listen(dialog, 'click', (event) => { if (event.target === dialog) closeRack(); });
    listen(document, 'keydown', trapModalFocus);
    listen(root, 'resize', onVisible, { passive: true });
    let observer = null;
    if ('ResizeObserver' in root) { observer = new ResizeObserver(onVisible); observer.observe(viewport); }
    showWarehouse(warehouse.id);
    return Object.freeze({ setSnapshot, onVisible, showWarehouse, selectRack: (key) => openRack(key),
      destroy() {
        disposed = true; closeRack(false);
        if (pendingFrame) cancelAnimationFrame(pendingFrame);
        if (observer) observer.disconnect();
        unlisten.forEach((fn) => fn());
        zoomToolbar.replaceWith(tabsHost);
        svg.replaceChildren(); rackNodes.clear(); levelNodes.clear();
      } });
  }
  root.EOATMap = Object.freeze({ mount });
})(typeof window !== 'undefined' ? window : globalThis);
