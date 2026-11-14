# Guía: paquete SSIS para CarloDW

## Prerrequisito: extensión SSIS en Visual Studio

En este PC está **Visual Studio 18 Community**. Falta confirmar la extensión:

1. Cierra Visual Studio.
2. Descarga e instala (como administrador):  
   [SQL Server Integration Services Projects 2022+](https://marketplace.visualstudio.com/items?itemName=SSIS.MicrosoftDataToolsIntegrationServices)
3. Abre VS → **File → New → Project** → debe aparecer **Integration Services Project**.

También en Visual Studio Installer → Modify → workload **Data storage and processing** → **SQL Server Data Tools**.

## Qué hace el paquete (alineado a `run_etl.ps1`)

```
Control Flow
├── 1. Execute SQL Task     → 01/02/03 (crear DB/staging/DW si aplica)
├── 2. Data Flow Task       → CSV → stg.*  (5 Flat File Sources)
├── 3. Execute SQL Task     → 04_etl_transform.sql
└── 4. Execute SQL Task     → 05_validacion.sql (opcional, log)
```

La transformación de negocio (dedup DNI, dims, facts, margen vs mercado) vive en **`sql/04_etl_transform.sql`**. Así el paquete SSIS queda simple y la lógica es versionable en Git.

## Crear el proyecto

1. New Project → **Integration Services Project**  
   Nombre: `CarloETL`  
   Ubicación sugerida: `solucion-2-etl/ssis/CarloETL`
2. Renombra `Package.dtsx` → `Carlo_ETL_CargaDW.dtsx`

### Connection Managers

| Nombre | Tipo | Valor |
|--------|------|-------|
| `cm_sql_CarloDW` | OLE DB / ADO.NET | `localhost`, DB `CarloDW`, Windows Auth, Trust server certificate |
| `cm_ff_clientes` | Flat File | `..\..\data\clientes.csv` (UTF-8, coma, primera fila = nombres) |
| `cm_ff_vehiculos` | Flat File | `vehiculos.csv` |
| `cm_ff_inspecciones` | Flat File | `inspecciones.csv` |
| `cm_ff_ventas` | Flat File | `ventas.csv` |
| `cm_ff_precios` | Flat File | `precios_mercado.csv` |

Usa **Project parameter** `DataFolder` apuntando a la carpeta `data` del repo para no hardcodear rutas.

### Data Flow (tarea 2)

Para cada CSV:

1. **Flat File Source** → columnas según el CSV.
2. **OLE DB Destination** → tabla `stg.*` correspondiente.
3. Antes del Data Flow: **Execute SQL** con `TRUNCATE TABLE` de las 5 tablas staging.

Mapeo 1:1 (mismos nombres de columna que en `sql/02_create_staging.sql`).

### Execute SQL (tarea 3)

- Connection: `cm_sql_CarloDW`
- SQLSourceType: **File connection** → `sql/04_etl_transform.sql`  
  o pega el contenido / llama un stored procedure si lo creas:

```sql
-- Opcional: envolver el transform
CREATE OR ALTER PROCEDURE dw.usp_etl_transform AS
BEGIN
  -- contenido de 04_etl_transform.sql
END
```

## Ejecutar / evidencias para el informe

1. Clic derecho en el paquete → **Execute Package**.
2. Captura: Control Flow en verde + Progress.
3. En SSMS: corre `sql/05_validacion.sql` y captura resultados (500/600/800/200, 21 duplicados DNI).

## Equivalencia con el prototipo ya ejecutado

| SSIS | Ya entregado en repo |
|------|----------------------|
| Flat File → Staging | `run_etl.ps1` (SqlBulkCopy) |
| Transform | `sql/04_etl_transform.sql` |
| Validación | `sql/05_validacion.sql` |

Si el docente pide ver el `.dtsx`, sigue esta guía (15–25 min una vez instalada la extensión).
