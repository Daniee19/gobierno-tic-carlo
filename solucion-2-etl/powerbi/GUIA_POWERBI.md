# Guía: Dashboard Power BI — CARLO

## Conectar al DW

1. Abre **Power BI Desktop**.
2. **Obtener datos → SQL Server**.
3. Servidor: `localhost`  
   Base de datos: `CarloDW`  
   Modo: **Importar**.
4. Si avisa de certificado: marca confiar en el certificado del servidor.
5. Selecciona (recomendado, más simple):

| Objeto | Uso |
|--------|-----|
| `dw.v_ventas` | Página Ventas vs mercado |
| `dw.v_inspecciones` | Página Inspecciones |
| `dw.v_calidad_datos` | Página Calidad de datos |

Alternativa estrella: carga `fact_*` + `dim_*` y relaciona por `sk_*` en el modelo.

6. **Cerrar y aplicar**.

Antes de conectar, asegúrate de haber corrido el ETL (`run_etl.ps1` o el paquete SSIS).

## Páginas del reporte (mínimo 3)

### 1. Ventas vs mercado
- KPI: Total ventas USD → `SUM(precio_venta_usd)`
- KPI: Margen promedio vs mercado → `AVERAGE(margen_vs_mercado_usd)`
- KPI: % ventas con precio de mercado
- Gráfico de barras: ventas por `vendedor`
- Gráfico de columnas: ventas por `marca`
- Segmentador: `posicion_mercado`, `anio`, `mes`

### 2. Inspecciones
- KPI: Total inspecciones
- Donut / barras: conteo por `resultado` (Aprobado / Observado / Desaprobado)
- Tendencia: inspecciones por `mes` / `nombre_mes`
- Tabla: últimas inspecciones (`fecha`, `cliente`, `placa`, `resultado`)

### 3. Calidad de datos
- Tarjetas desde `v_calidad_datos` (una por métrica o matriz)
- Destacar: `duplicados_dni` = 21, `emails_duplicados_staging` = 15
- Texto/título: “Limpieza ETL: duplicados por DNI mapeados al cliente maestro”

## Medidas DAX sugeridas

Ver `medidas_dax.md`. Crea una tabla vacía **Medidas** o pégalas en `v_ventas`.

## Guardar el archivo

Guarda como:

`solucion-2-etl/powerbi/Carlo_Dashboard.pbix`

No subas credenciales. El `.pbix` puede versionarse si el repo lo permite (aviso: es binario).

## Evidencias para la matriz ISO 12207

- Captura página Ventas  
- Captura página Inspecciones  
- Captura página Calidad (21 duplicados DNI)  
- Captura del modelo de datos (Vista de modelo)
