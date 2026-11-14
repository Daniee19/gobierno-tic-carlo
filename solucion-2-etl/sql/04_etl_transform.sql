/*
  Transformación staging → DW.
  Equivalente a la lógica del Data Flow / Execute SQL Task de SSIS.
*/
USE CarloDW;
GO

SET NOCOUNT ON;

/* Limpiar hechos y dims (carga full refresh — prototipo) */
DELETE FROM dw.fact_venta;
DELETE FROM dw.fact_inspeccion;
DELETE FROM dw.bridge_cliente_duplicado;
DELETE FROM dw.metricas_calidad;
DELETE FROM dw.dim_cliente;
DELETE FROM dw.dim_vehiculo;
DELETE FROM dw.dim_fecha;
DELETE FROM dw.dim_vendedor;
DELETE FROM dw.dim_resultado_inspeccion;

/* Reset identities */
DBCC CHECKIDENT ('dw.dim_cliente', RESEED, 0);
DBCC CHECKIDENT ('dw.dim_vehiculo', RESEED, 0);
DBCC CHECKIDENT ('dw.dim_vendedor', RESEED, 0);
DBCC CHECKIDENT ('dw.dim_resultado_inspeccion', RESEED, 0);
DBCC CHECKIDENT ('dw.fact_inspeccion', RESEED, 0);
DBCC CHECKIDENT ('dw.fact_venta', RESEED, 0);

/* ---------- Deduplicación de clientes por DNI ----------
   Maestro = menor id_cliente por DNI (no nulo).
*/
;WITH ranked AS (
    SELECT
        id_cliente,
        dni,
        ROW_NUMBER() OVER (PARTITION BY dni ORDER BY id_cliente) AS rn
    FROM stg.clientes
    WHERE dni IS NOT NULL AND LTRIM(RTRIM(dni)) <> ''
)
INSERT INTO dw.bridge_cliente_duplicado (id_cliente_duplicado, id_cliente_maestro, dni, criterio)
SELECT r.id_cliente,
       m.id_cliente,
       r.dni,
       N'DNI'
FROM ranked r
INNER JOIN ranked m
    ON m.dni = r.dni AND m.rn = 1
WHERE r.rn > 1;

/* Dim cliente */
INSERT INTO dw.dim_cliente (
    id_cliente, dni, nombre_completo, email, telefono, es_registro_maestro, tiene_duplicados
)
SELECT
    c.id_cliente,
    c.dni,
    CONCAT(c.nombre, N' ', c.apellido_paterno, N' ', c.apellido_materno),
    c.email,
    c.telefono,
    CASE WHEN d.id_cliente_duplicado IS NULL THEN 1 ELSE 0 END,
    CASE WHEN EXISTS (
        SELECT 1 FROM dw.bridge_cliente_duplicado b WHERE b.id_cliente_maestro = c.id_cliente
    ) THEN 1 ELSE 0 END
FROM stg.clientes c
LEFT JOIN dw.bridge_cliente_duplicado d
    ON d.id_cliente_duplicado = c.id_cliente;

/* Dim vehículo */
INSERT INTO dw.dim_vehiculo (id_vehiculo, placa, marca, modelo, anio, color, id_cliente_origen)
SELECT id_vehiculo, placa, marca, modelo, anio, color, id_cliente
FROM stg.vehiculos;

/* Dim fecha a partir de inspecciones y ventas */
;WITH fechas AS (
    SELECT DISTINCT fecha FROM stg.inspecciones WHERE fecha IS NOT NULL
    UNION
    SELECT DISTINCT fecha FROM stg.ventas WHERE fecha IS NOT NULL
)
INSERT INTO dw.dim_fecha (sk_fecha, fecha, anio, mes, nombre_mes, trimestre, dia, nombre_dia)
SELECT
    CONVERT(INT, CONVERT(CHAR(8), f.fecha, 112)),
    f.fecha,
    YEAR(f.fecha),
    MONTH(f.fecha),
    DATENAME(MONTH, f.fecha),
    DATEPART(QUARTER, f.fecha),
    DAY(f.fecha),
    DATENAME(WEEKDAY, f.fecha)
FROM fechas f;

/* Dim vendedor */
INSERT INTO dw.dim_vendedor (nombre_vendedor)
SELECT DISTINCT LTRIM(RTRIM(vendedor))
FROM stg.ventas
WHERE vendedor IS NOT NULL AND LTRIM(RTRIM(vendedor)) <> '';

/* Dim resultado inspección */
INSERT INTO dw.dim_resultado_inspeccion (resultado)
SELECT DISTINCT LTRIM(RTRIM(resultado))
FROM stg.inspecciones
WHERE resultado IS NOT NULL AND LTRIM(RTRIM(resultado)) <> '';

/* Fact inspección — mapear cliente duplicado al maestro cuando exista */
INSERT INTO dw.fact_inspeccion (
    id_inspeccion, sk_fecha, sk_cliente, sk_vehiculo, sk_resultado, link_informe
)
SELECT
    i.id_inspeccion,
    df.sk_fecha,
    dc.sk_cliente,
    dv.sk_vehiculo,
    dr.sk_resultado,
    i.link_informe
FROM stg.inspecciones i
INNER JOIN dw.dim_fecha df
    ON df.fecha = i.fecha
INNER JOIN dw.dim_cliente dc
    ON dc.id_cliente = COALESCE(
        (SELECT b.id_cliente_maestro FROM dw.bridge_cliente_duplicado b WHERE b.id_cliente_duplicado = i.id_cliente),
        i.id_cliente
    )
LEFT JOIN dw.dim_vehiculo dv
    ON dv.id_vehiculo = i.id_vehiculo
INNER JOIN dw.dim_resultado_inspeccion dr
    ON dr.resultado = i.resultado;

/* Fact venta + precio de mercado / margen */
INSERT INTO dw.fact_venta (
    id_venta, sk_fecha, sk_cliente, sk_vehiculo, sk_vendedor,
    precio_venta_usd, precio_mercado_usd, margen_vs_mercado_usd
)
SELECT
    v.id_venta,
    df.sk_fecha,
    dc.sk_cliente,
    dv.sk_vehiculo,
    dvend.sk_vendedor,
    v.precio_venta_usd,
    pm.precio_mercado_usd,
    CASE
        WHEN pm.precio_mercado_usd IS NULL THEN NULL
        ELSE v.precio_venta_usd - pm.precio_mercado_usd
    END
FROM stg.ventas v
INNER JOIN dw.dim_fecha df
    ON df.fecha = v.fecha
INNER JOIN dw.dim_cliente dc
    ON dc.id_cliente = COALESCE(
        (SELECT b.id_cliente_maestro FROM dw.bridge_cliente_duplicado b WHERE b.id_cliente_duplicado = v.id_cliente),
        v.id_cliente
    )
LEFT JOIN dw.dim_vehiculo dv
    ON dv.id_vehiculo = v.id_vehiculo
INNER JOIN dw.dim_vendedor dvend
    ON dvend.nombre_vendedor = LTRIM(RTRIM(v.vendedor))
LEFT JOIN stg.precios_mercado pm
    ON pm.marca = v.marca
   AND pm.modelo = v.modelo
   AND pm.anio = dv.anio;

/* Métricas de calidad para el dashboard */
INSERT INTO dw.metricas_calidad (metrica, valor, detalle)
SELECT N'clientes_staging', COUNT(*), N'Registros en stg.clientes' FROM stg.clientes
UNION ALL
SELECT N'clientes_dw', COUNT(*), N'Registros en dw.dim_cliente' FROM dw.dim_cliente
UNION ALL
SELECT N'duplicados_dni', COUNT(*), N'Clientes marcados como duplicado por DNI' FROM dw.bridge_cliente_duplicado
UNION ALL
SELECT N'vehiculos_staging', COUNT(*), N'Registros en stg.vehiculos' FROM stg.vehiculos
UNION ALL
SELECT N'inspecciones_fact', COUNT(*), N'Hechos de inspección cargados' FROM dw.fact_inspeccion
UNION ALL
SELECT N'ventas_fact', COUNT(*), N'Hechos de venta cargados' FROM dw.fact_venta
UNION ALL
SELECT N'ventas_con_precio_mercado', COUNT(*), N'Ventas con match de precio de mercado'
FROM dw.fact_venta WHERE precio_mercado_usd IS NOT NULL
UNION ALL
SELECT N'emails_duplicados_staging', COUNT(*), N'Emails repetidos en staging'
FROM (
    SELECT email FROM stg.clientes
    WHERE email IS NOT NULL
    GROUP BY email HAVING COUNT(*) > 1
) e;

PRINT 'ETL transform OK';
GO
