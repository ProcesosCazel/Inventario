"""
Script: Conversión de Excel -> CSV -> JSON
Archivo de entrada:
    EOAT_data.xlsx

Archivos generados:
    eoat_data.csv
    eoat_data.json

Reglas:
- Columna "Imagen":
    Espacios vacíos -> null
- Demás columnas:
    Espacios vacíos -> ""

Autor: 
    Ing. José Antonio Guzmán Trujillo 
    Becario de Procesos | Industrias Cazel 
    tecnicosprocesos@cazel.mx 
    2026
"""

import pandas as pd
import json
import math

# =========================================================
# CONFIGURACIÓN
# =========================================================

EXCEL_FILE = "EOAT_data.xlsx"
CSV_FILE = "eoat_data.csv"
JSON_FILE = "eoat_data.json"

# =========================================================
# LEER EXCEL
# =========================================================

df = pd.read_excel(EXCEL_FILE)

# Forzar columna "fila" como texto
df["fila"] = df["fila"].fillna("").astype(str)

# =========================================================
# LIMPIEZA DE DATOS
# =========================================================

for column in df.columns:

    # Columna imagen -> null
    if column.lower() == "imagen":

        df[column] = df[column].apply(
            lambda x: None
            if pd.isna(x) or str(x).strip() == ""
            else x
        )

    # Otras columnas -> ""
    else:
        df[column] = df[column].fillna("")
        df[column] = df[column].replace(r"^\s*$", "", regex=True)

# =========================================================
# EXPORTAR CSV
# =========================================================

df.to_csv(CSV_FILE, index=False, encoding="utf-8-sig")

print(f"CSV generado: {CSV_FILE}")

# =========================================================
# CONVERTIR A JSON CORRECTAMENTE
# =========================================================

# Convertir DataFrame a lista de diccionarios
data = df.to_dict(orient="records")

# Reemplazar manualmente NaN por None
for row in data:
    for key, value in row.items():

        # Detectar NaN reales
        if isinstance(value, float) and math.isnan(value):
            row[key] = None

# =========================================================
# EXPORTAR JSON
# =========================================================

with open(JSON_FILE, "w", encoding="utf-8") as json_file:
    json.dump(
        data,
        json_file,
        indent=4,
        ensure_ascii=False
    )

print(f"JSON generado: {JSON_FILE}")

print("Proceso completado correctamente.")