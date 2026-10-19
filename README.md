# Inventario Digital EOAT — Release 3.0

**Industrias Cazel | Inventario de herramentales de fin de brazo (EOAT)**
**Versión:** 3.0 | **Fecha:** 19 de octubre de 2026

Sistema web **estático** publicado en GitHub Pages. Permite buscar EOAT, consultar su ubicación registrada, revisar fotografías y explorar **dos mapas interactivos** construidos desde la misma base de datos JSON. No requiere backend ni servicios de mapas externos.

## Funciones

- **Buscador:** busca por ID de EOAT; consulta nave, columna, fila, descripción y fotografía. Incluye impresión de resultados.
- **Mapa interactivo:** dos almacenes — Nave 1 y el almacén compartido de Naves 2/3 — con filas y EOAT generados desde `data/eoat_data.json`.
- **Detalle mediante ventanas:** al tocar una columna se muestra el popup con los niveles y sus EOAT; al seleccionar un EOAT se abre la ficha con fotografía.
- **Navegación del mapa:** scroll horizontal/vertical, arrastre táctil nativo y zoom por porcentaje (50–250%); pellizco con dos dedos en dispositivos compatibles. Se recuerda el nivel de zoom por almacén durante la sesión.
- **Buzón:** reportar quejas, sugerencias y EOAT no registrados.
- **Ayuda → Actualizar la base de datos:** permite convertir Excel a JSON desde `admin.html`, validar diferencias y descargar el resultado para publicarlo manualmente.

**Los mapas representan ubicaciones registradas en el inventario, no presencia física en tiempo real.** Si un nivel no tiene registros, aparece **Sin información**, no necesariamente **Libre**.

## Dos almacenes

**Nave 1:** única línea continua, en este orden:

`C12 → C11 → C10 → C09 → C08 → C07 → C06 → C05 → C04 → C03 → C02 → C01 → C16 → C15 → C14 → C13`.

**Almacén compartido Naves 2/3:** conserva la disposición aprobada de los tramos superior, central superior e inferior y laterales. Los dibujos son **esquemáticos, no a escala**.

El archivo `mapa-config.js` contiene la **distribución física sin IDs de EOAT**. `mapa-model.js` asocia la base validada a cada columna y fila. `mapa.js` dibuja los racks y administra zoom, pestañas y ventanas. El mapa **no descarga ni edita el JSON**: recibe la misma copia validada por `main.js` que utiliza el buscador.

## Estructura principal

```text
index.html                Pantallas Buscador / Mapa / Buzón / Ayuda
styles.css                Estilos generales
main.js                   Carga, validación, búsqueda y ficha de EOAT
mapa-config.js            Distribución física aprobada de los 2 almacenes
mapa-model.js             Agrupación de EOAT por rack y nivel
mapa.js / mapa.css        Mapa interactivo, popups, zoom y desplazamiento
admin.html / admin.css / admin.js
                          Actualizador de base desde Excel
eoat-converter.js         Conversión a JSON
eoat-validator.js         Validación del JSON
eoat-xlsx-reader.js       Lector Excel del navegador
print.css                 Estilos de impresión
manifest.webmanifest      Metadatos de la web
VERSION / RELEASE_NOTES.md
assets/                   Fotos EOAT, íconos, imágenes y sonidos operativos
assets/vendor/            JSZip local y licencia
data/EOAT_data.xlsx       Excel maestro
data/eoat_data.json       Base vigente para Buscador y Mapa
QR code/                  Material para difusión del enlace
```

## Actualizar el inventario (sin cambiar los mapas manualmente)

1. Actualizar `data/EOAT_data.xlsx` conservando sus seis columnas.
2. Entrar a **Ayuda → Actualizar la base de datos**.
3. Seleccionar el Excel `EOAT_data.xlsx`.
4. Presionar **Convertir y validar**; revisar el resumen de cambios.
5. Descargar `eoat_data.json` y **reemplazar manualmente** `data/eoat_data.json` en el repositorio.
6. Publicar los cambios; al recargar la página desde GitHub Pages, Buscador y Mapa usan el JSON actualizado.

**Reglas del convertidor:** `imagen` vacía → `null`; demás celdas vacías → `""`; `fila` siempre texto. Campos JSON (orden fijo): `id`, `estado`, `nave`, `columna`, `fila`, `imagen`. No se agregan coordenadas ni se cambia el esquema.

### Importante sobre la prueba local

GitHub Pages sirve los archivos mediante HTTPS. **Abrir `index.html` con doble clic (`file://`) puede impedir que `fetch()` cargue el JSON**, debido a la seguridad del navegador. El proyecto conserva el cargador estable de v2.0. Para probar la web localmente, ejecuta un servidor **estático** en la carpeta (solo para desarrollo):

```powershell
py -m http.server 8000
```

Abre `http://localhost:8000/` y comprueba Buscador, Mapa y Administrador. Esto **no agrega backend ni modifica la arquitectura de GitHub Pages**.

## Publicación

- **Código:** https://github.com/ProcesosCazel/Inventario
- **Página:** https://procesoscazel.github.io/Inventario/
- **Release:** v3.0 (crear tag después del commit y push)

No subir el ZIP dentro del repositorio: extrae su contenido y conserva el historial Git. Mantener `v2.0` como punto de retorno.

## Código QR

![Código QR del Inventario EOAT](./QR%20code/qr-code.svg)

## Autores

**Ing. Hector Uriel Ramirez Sandoval**  
Auxiliar de robot | Industrias Cazel

**Ing. José Antonio Guzmán Trujillo**  
Becario de Procesos | Industrias Cazel

Este proyecto fue desarrollado para uso interno de Industrias Cazel como herramienta de apoyo para ingenieros, técnicos y personal de procesos.

Copyright 2026 Industrias Cazel.
