# Proyecto: Página Web para Inventario de Herramental de Fin de Brazo (EOAT)

## Estado del proyecto

Proyecto piloto en fase de pruebas internas.

## Objetivo:
    -Reducir el tiempo de búsqueda y acomodo de los fines de brazo en el almacén
    -Reducir errores en la ubicación de los fines de brazo

## Funciones principales de la página web:
    -Buscar fin de brazo y mostrar
        *Número de fin de brazo
        *Nave
        *Columna
        *Fila
        *Foto (opcional)
    -Mostrar un mapa o diagrama del acomodo de los racks en el almacén
    -Imprimir o descargar como PDF información pertinente
    -Buzon de quejas y sugerencias

## La página funciona en:

- Teléfonos móviles
- Tablets
- Computadoras

Solo requiere un navegador moderno:
- Chrome
- Edge
- Firefox
- Safari

## Arquitectura del proyecto:

    index.html
    main.js
    styles.css
    print.css

    assets/
        EOAT/
        SFX/
        LogoCazel.webp
        MainIcon.svg

    data/
        EOAT_data.xlsx
        eoat_data.csv
        eoat_data.json

### El proyecto fue desarrollado como una pagina web estática utilizando:

- **HTML**
- **CSS**
- **JavaScript**
- **JSON**
- **GitHub Pages** (hosting)
- **Inteligencia Artificial**

No requiere frameworks ni backend.

# Actualización de Base de Datos:
### Para actualizar la base de datos hay que entrar a la carpeta del proyecto "EOAT Project/data/" en el escritorio de la computadora de procesos y seguir las siguientes instrucciones:
1. Abrir Excel maestro "EOAT_data.xlsx".
2. Escribir en la siguiente fila libre:
    -Número de fin de brazo (id)
    -Estado (EOAT)
    -Nave (1, 2 o 3)
    -Columna (C01 - C28)
    -Fila (1,2,3...)
    -Imagen
        *Número del fin de brazo + .jpeg
        *Ejemplo: 
        "I-1850.jpeg"
3. Guardar el archivo de Excel.
4. Guardar como CSV UTF-8 (*.csv) con el nombre "eoat_data.csv" (sobreescribir el archivo).
5. Buscar en internet un convertidor de csv a json.
    -De preferencia "convertcsv.com"
6. Subir el archivo csv y convertirlo a json.
    -Asegurarse que los valores vacíos en la columna de "imagen" se conviertan a "null".
    -Ejemplo:
    {
    "id": "",
    "estado": "Libre",
    "nave": 2,
    "columna": "C28",
    "fila": 3,
    "imagen": null
    }
7. Guardar el archivo json como "eoat_data.json" (sobreescribir el archivo).
8. En caso de que se cuente con la foto del fin de brazo, insertarla en la carpeta "EOAT Project/assets/EOAT/" con el nombre:
    *Número del fin de brazo + .jpeg
    *Ejemplo: 
    "I-1850.jpeg"
9. Actualizar en Github Pages en el repositorio "Inventario", ingresando con la cuenta de tecnicosprocesos@cazel.mx
    -Solicitar apoyo o buscar un tutorial en internet
    -Tambien se puede agregar manualmente sobreescribiendo directamente el archivo .json (¡NO RECOMENDADO!)


# Autor:
    Ing. José Antonio Guzmán Trujillo
    Becario de Procesos | Industrias Cazel
    tecnicosprocesos@cazel.mx

### Este proyecto fue desarrollado para uso interno de Industrias Cazel como herramienta de apoyo para ingenieros, técnicos y personal de procesos. Puede contener información confidencial.

### Copyright 2026 Industrias Cazel.
