/*
  Vistas amigables para Power BI (star schema aplanado opcional).
*/
USE CarloDW;
GO

CREATE OR ALTER VIEW dw.v_inspecciones AS
SELECT
    f.id_inspeccion,
    d.fecha,
    d.anio,
    d.mes,
    d.nombre_mes,
    d.trimestre,
    c.id_cliente,
    c.nombre_completo AS cliente,
    c.dni,
    c.es_registro_maestro,
    v.placa,
    v.marca,
    v.modelo,
    v.anio AS anio_vehiculo,
    r.resultado,
    f.link_informe
FROM dw.fact_inspeccion f
JOIN dw.dim_fecha d ON d.sk_fecha = f.sk_fecha
JOIN dw.dim_cliente c ON c.sk_cliente = f.sk_cliente
LEFT JOIN dw.dim_vehiculo v ON v.sk_vehiculo = f.sk_vehiculo
JOIN dw.dim_resultado_inspeccion r ON r.sk_resultado = f.sk_resultado;
GO

CREATE OR ALTER VIEW dw.v_ventas AS
SELECT
    f.id_venta,
    d.fecha,
    d.anio,
    d.mes,
    d.nombre_mes,
    d.trimestre,
    c.id_cliente,
    c.nombre_completo AS cliente,
    v.placa,
    v.marca,
    v.modelo,
    v.anio AS anio_vehiculo,
    vend.nombre_vendedor AS vendedor,
    f.precio_venta_usd,
    f.precio_mercado_usd,
    f.margen_vs_mercado_usd,
    CASE
        WHEN f.precio_mercado_usd IS NULL THEN N'Sin precio de mercado'
        WHEN f.margen_vs_mercado_usd >= 0 THEN N'Por encima del mercado'
        ELSE N'Por debajo del mercado'
    END AS posicion_mercado
FROM dw.fact_venta f
JOIN dw.dim_fecha d ON d.sk_fecha = f.sk_fecha
JOIN dw.dim_cliente c ON c.sk_cliente = f.sk_cliente
LEFT JOIN dw.dim_vehiculo v ON v.sk_vehiculo = f.sk_vehiculo
JOIN dw.dim_vendedor vend ON vend.sk_vendedor = f.sk_vendedor;
GO

CREATE OR ALTER VIEW dw.v_calidad_datos AS
SELECT metrica, valor, detalle, fecha_calculo
FROM dw.metricas_calidad;
GO
