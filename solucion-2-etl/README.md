# Solución 2 — ETL con SSIS + dashboard en Power BI

**Responsable:** Jorge (Contreras Delgado, Jorge Renzo Paolo)  
**Empresa:** CARLO (prototipo Gobierno de TIC)  
**Alineación:** RN-02, RN-03, RN-04, RN-08 · OTI3 · ISO/IEC 12207 (planificación preliminar)

## Qué resuelve

Centraliza clientes, vehículos, inspecciones, ventas y precios de mercado en un **Data Warehouse** (`CarloDW`), con limpieza de duplicados (DNI) y un **dashboard Power BI** para decisiones comerciales y control de calidad de datos.

## Arquitectura

```
data/*.csv  →  staging (stg)  →  transformación  →  DW estrella (dw)  →  Power BI
                 ▲                    ▲
            SSIS Data Flow     sql/04_etl_transform.sql
            (o run_etl.ps1)
```

### Modelo dimensional

| Tipo | Objetos |
|------|---------|
| Dimensiones | `dim_cliente`, `dim_vehiculo`, `dim_fecha`, `dim_vendedor`, `dim_resultado_inspeccion` |
| Hechos | `fact_inspeccion`, `fact_venta` (+ margen vs mercado) |
| Calidad | `bridge_cliente_duplicado`, `metricas_calidad` |
| Vistas BI | `v_ventas`, `v_inspecciones`, `v_calidad_datos` |

## Estructura

```
solucion-2-etl/
├── README.md
├── run_etl.ps1                 # Orquestación local (equivalente al Control Flow)
├── sql/
│   ├── 01_create_database.sql
│   ├── 02_create_staging.sql
│   ├── 03_create_dw.sql
│   ├── 04_etl_transform.sql    # Dedup + dims + facts
│   ├── 05_validacion.sql
│   └── 06_views_powerbi.sql
├── ssis/
│   └── GUIA_SSIS.md            # Cómo armar el .dtsx en Visual Studio
└── powerbi/
    ├── GUIA_POWERBI.md
    └── medidas_dax.md
```

## Cómo ejecutar (demo local)

### 1. ETL

En PowerShell (desde esta carpeta):

```powershell
.\run_etl.ps1
```

Requisitos: SQL Server local, Windows Auth, `sqlcmd` (Client SDK).

### 2. Vistas Power BI (si no las creó el script)

Ejecutar en SSMS / sqlcmd: `sql/06_views_powerbi.sql`

### 3. Dashboard

Sigue `powerbi/GUIA_POWERBI.md` → conectar a `localhost` / `CarloDW` → 3 páginas.

### 4. Paquete SSIS (para la rúbrica)

Sigue `ssis/GUIA_SSIS.md`. Instala la extensión **SQL Server Integration Services Projects 2022+** si aún no aparece el template en Visual Studio.

## Resultados esperados (dataset actual)

| Métrica | Valor |
|---------|------:|
| Clientes staging/DW | 500 |
| Vehículos | 600 |
| Inspecciones | 800 |
| Ventas | 200 |
| Duplicados DNI detectados | 21 |
| Emails duplicados (staging) | 15 |
| Ventas con precio de mercado | 116 |
| Inspecciones Aprobado / Observado / Desaprobado | 581 / 133 / 86 |

## Trazabilidad rápida (ISO 12207)

| Requisito | Artefacto | Evidencia |
|-----------|-----------|-----------|
| RN-02 información centralizada | `CarloDW` + ETL | `05_validacion.sql` |
| RN-08 / RN-04 decisiones y precios | Power BI ventas vs mercado | `.pbix` página 1 |
| RN-03 menos errores / duplicidad | Dedup DNI en transform | métrica `duplicados_dni` |
