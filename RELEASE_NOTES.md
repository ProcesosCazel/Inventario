# Inventario EOAT — Release 3.0

**Fecha de versión:** 19 de octubre de 2026
**Base estable:** Release 2.0

## Novedad principal: mapas interactivos

- Sustituye los **mapas JPEG con contenido manual** por esquemas interactivos SVG generados a partir de `mapa-config.js` y `data/eoat_data.json`.
- Solo **dos almacenes**: Nave 1 (única línea de 16 columnas) y un almacén compartido para las Naves 2 y 3 (28 columnas).
- Interacción **Mapa → rack → popup con niveles → ficha de EOAT**. Sin botón de «Ver en mapa» desde el buscador, por decisión del proyecto.
- Permite varios EOAT por nivel; niveles múltiples (`2 y 3`) sin duplicar el conteo de herramentales.
- Diferencia `Libre`, `Obstruido`, `Sin información` y registros que requieren revisión.
- **Desplazamiento horizontal y vertical** con scrollbars; interacción táctil y selección de zoom entre 50% y 250%. Se conserva zoom y desplazamiento por almacén durante la sesión.
- Interfaz centrada en los dos mapas; sin panel permanente de detalle, controles de desplazamiento redundantes ni sección «Distribución y símbolos».

## Compatibilidad conservada

- `main.js` conserva **la lógica de descarga y validación del Release 2.0**: `fetch('./data/eoat_data.json')`, timeout, reintento, validación, y última base válida durante la sesión.
- Buscador y mapa comparten **una sola carga validada**. El mapa no hace peticiones adicionales.
- El Excel maestro `data/EOAT_data.xlsx` y la base `data/eoat_data.json` se conservaron **sin modificar**.
- La conversión desde `admin.html` permanece igual (Excel → JSON → comparación → descarga); continúa siendo una página estática compatible con GitHub Pages.
- Se mantienen Buzón, Ayuda, ficha de EOAT, fotografías, impresión y diseños responsivos.
- Sin backend, CDN adicional, Service Worker ni implementación offline de toda la aplicación.

## Limpieza para la entrega

- No se incluyen las pantallas auxiliares `mapa-layout.html` ni `mapa-datos.html`, ni pruebas, capturas, respaldos o clones Git.
- Se retiran `assets/MapaAlmacenN1.jpeg` y `assets/MapaAlmacenN23.jpeg`, porque la pantalla ya dibuja ambos almacenes mediante SVG/JSON; se actualizan las referencias de origen en `mapa-config.js`.
- Se retira `assets/README/Languges.png`, archivo sin referencias en la aplicación ni README.
- Se conservan las fotografías operativas, el ícono de respaldo `no-image.svg`, QR, Excel maestro, licencias y recursos usados por el sitio.
- Los EOAT que no tienen fotografía física permanecen en el inventario sin eliminar ni modificar sus referencias.

## Antes de publicar

1. Verificar en un navegador real (móvil y escritorio) ambos almacenes, scrollbars, zoom, racks, popups y fotografías.
2. Comprobar que `index.html` carga los datos desde GitHub Pages por HTTPS; abrirlo mediante `file://` puede bloquear `fetch` incluso en v2.0.
3. Confirmar que `admin.html` convierte el Excel y genera el mismo JSON para una base sin cambios.
4. Commit/push de `main`, comprobar GitHub Pages y **crear tag `v3.0`**, conservando tag `v2.0`.

**Nota:** incluir `VERSION = 3.0` y las notas en un ZIP no crea automáticamente un tag remoto de GitHub.
