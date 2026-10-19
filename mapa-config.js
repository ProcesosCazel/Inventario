/* Inventario EOAT | v3.0 - Paso 1: distribucion de almacenes.
 * SOLO geometria de referencia. No contiene ni modifica el inventario.
 * Coordenadas en unidades de dibujo, NO metros ni un plano a escala.
 * Nave 1: secuencia confirmada por el usuario en esta conversacion.
 * Naves 2/3: distribucion aprobada a partir de los mapas anteriores (retirados en v3).
 * Los niveles se representan como en las imagenes; validar en planta.
 * Script clasico: la vista de revision funciona tambien desde file://.
 */
(function (root) {
  'use strict';

  function column(number) { return `C${String(number).padStart(2, '0')}`; }
  function rack(nave, number, x, y, width, height, area, levelOrder, axis, labelSide) {
    return {
      key: `N${nave}-${column(number)}`,
      nave,
      column: column(number),
      area,
      x, y, width, height,
      levels: [...levelOrder].sort((a, b) => a - b),
      display: { levelOrder: [...levelOrder], axis, labelSide },
    };
  }

  const n1Order = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 16, 15, 14, 13];
  const n1Racks = n1Order.map((number, index) =>
    rack(1, number, 40 + index * 152, 68, 132, 216,
      'Fila lineal única', [1, 2, 3, 4], 'y', 'above'));

  // La pertenencia a nave se cotejo con el JSON del ZIP adjunto.
  // La posicion de los bloques y el orden visible de niveles proceden del JPEG.
  const sharedRacks = [];
  [10, 9, 8, 7, 6, 5, 4, 3].forEach((number, index) => {
    sharedRacks.push(rack(3, number, 168 + index * 174, 76, 132, 132,
      'Tramo superior', [1, 2, 3], 'y', 'above'));
  });
  [11, 12].forEach((number, index) => {
    sharedRacks.push(rack(3, number, 44, 314 + index * 206, 140, 140,
      'Lateral izquierdo', [1, 2, 3], 'x', 'left'));
  });
  [13, 14, 15, 16, 17, 18, 19, 20].forEach((number, index) => {
    sharedRacks.push(rack(number <= 16 ? 2 : 3, number,
      292 + index * 142, 304, 124, 132,
      'Tramo central superior', [3, 2, 1], 'y', 'below'));
  });
  [28, 27, 26, 25, 24, 23, 22, 21].forEach((number, index) => {
    sharedRacks.push(rack(2, number, 292 + index * 142, 544, 124, 132,
      'Tramo central inferior', [1, 2, 3], 'y', 'above'));
  });
  [2, 1].forEach((number, index) => {
    sharedRacks.push(rack(3, number, 1500, 314 + index * 206, 140, 140,
      'Lateral derecho', [3, 2, 1], 'x', 'right'));
  });

  const config = {
    schemaVersion: 1,
    developmentVersion: '3.0',
    inventoryConnected: true,
    warehouses: [
      {
        id: 'almacen-n1',
        label: 'Almacén Nave 1',
        naves: [1],
        layoutType: 'linear',
        coordinateSystem: 'schematic-not-to-scale',
        viewBox: [0, 0, 2492, 334],
        readableWidth: 2492,
        source: 'Secuencia indicada por el usuario; cuatro niveles según la referencia de Nave 1.',
        description: 'Una sola fila continua: C12 a C01, seguida de C16 a C13. Se dibuja de izquierda a derecha; no representa norte/sur.',
        levelsNote: 'F1 a F4 se muestran de arriba abajo. Son niveles del rack, no hileras adicionales de racks.',
        pendingConfirmation: 'Confirmar los cuatro niveles de cada columna. No se añadieron pasillos, giros ni ubicaciones de máquinas.',
        referenceImage: null,
        areas: [{ id: 'Fila lineal única', label: 'Una única fila de racks', x: 40, y: 24 }],
        landmarks: [],
        racks: n1Racks,
      },
      {
        id: 'almacen-n23',
        label: 'Almacén compartido Naves 2 y 3',
        naves: [2, 3],
        layoutType: 'reference-image',
        coordinateSystem: 'schematic-not-to-scale',
        viewBox: [0, 0, 1680, 802],
        readableWidth: 1450,
        source: 'Distribucion fisica confirmada para v3.0 a partir del plano de referencia anterior; los EOAT se obtienen solo del JSON.',
        description: 'Un solo almacén compartido: tramo superior, dos tramos centrales y dos laterales. Se conserva la posición relativa del mapa de referencia.',
        levelsNote: 'La orientación de F1/F2/F3 reproduce la imagen: los bloques centrales superiores y el lateral derecho están invertidos visualmente.',
        pendingConfirmation: 'Validar posición y orientación de bloques, puerta y escalera. Los espacios y dimensiones son esquemáticos, no mediciones.',
        referenceImage: null,
        areas: [
          { id: 'Tramo superior', label: 'Tramo superior', x: 168, y: 30 },
          { id: 'Tramo central superior', label: 'Centro superior', x: 292, y: 265 },
          { id: 'Tramo central inferior', label: 'Centro inferior', x: 292, y: 490 },
        ],
        // Solo las referencias graficas que aparecen en la imagen proporcionada.
        // No se infiere acceso principal, salida de emergencia ni ruta de paso.
        landmarks: [
          { key: 'puerta', label: 'Puerta', x: 1460, y: 722, width: 72, height: 56 },
          { key: 'escalera', label: 'Escalera', x: 1548, y: 722, width: 100, height: 56 },
        ],
        racks: sharedRacks,
      },
    ],
  };

  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  }

  root.EOAT_MAP_CONFIG = deepFreeze(config);
})(typeof window !== 'undefined' ? window : globalThis);
