# Inventario EOAT - Release 2.0

Fecha de liberación: 2026-09-28

## Resumen

Release 2.0 consolida la versión estable del Inventario Digital EOAT e incorpora la actualización de la base de datos desde la propia página web mediante `admin.html`.

## Funcionalidades principales

- Búsqueda de EOAT por identificador.
- Visualización de nave, columna, fila, estado y fotografía.
- Mapas de almacenes Nave 1 y Nave 2/3.
- Impresión de resultados.
- Buzón de reportes y sugerencias.
- Pantalla de ayuda.
- Enlace **Actualizar la base de datos** desde Ayuda.
- Conversión local de `EOAT_data.xlsx` a `eoat_data.json`.
- Validación del archivo antes de habilitar la descarga.
- Comparación contra la base JSON actual.
- Descarga manual de `eoat_data.json` para reemplazo local o publicación en GitHub.

## Reglas de conversión conservadas

- Columna `imagen` vacía -> `null`.
- Demás columnas vacías -> `""`.
- `fila` se conserva como texto.
- Estructura JSON: `id`, `estado`, `nave`, `columna`, `fila`, `imagen`.

## Limpieza realizada para Release 2.0

Se retiraron del paquete de producción:

- Carpeta de pruebas y capturas de validación.
- `data/eoat_data.csv`.
- `data/json_converter.py`.
- Presentación de actualización basada en Python/CSV, ya obsoleta.
- Copia PDF antigua del README.
- Tres fotografías huérfanas no referenciadas por la base vigente: `I-1768.jpeg`, `I-1769.jpeg`, `I-1770.jpeg`.
- `assets/MainIcon.svg`, no utilizado por la aplicación actual.

## Archivos que permanecen como fuentes oficiales

- `data/EOAT_data.xlsx`: Excel maestro.
- `data/eoat_data.json`: base utilizada por la página.

## Publicación

La aplicación continúa siendo un sitio estático compatible con GitHub Pages. Para actualizar la base:

1. Abrir la sección Ayuda.
2. Seleccionar **Actualizar la base de datos**.
3. Cargar `EOAT_data.xlsx`.
4. Convertir y validar.
5. Revisar el resumen de cambios.
6. Descargar `eoat_data.json`.
7. Reemplazar manualmente `data/eoat_data.json` localmente o en GitHub.
