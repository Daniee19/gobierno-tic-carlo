/*
  Consultas de control — deben coincidir con el dashboard Power BI.
*/
USE CarloDW;
GO

SELECT 'staging' AS capa, 'clientes' AS tabla, COUNT(*) AS n FROM stg.clientes
UNION ALL SELECT 'staging', 'vehiculos', COUNT(*) FROM stg.vehiculos
UNION ALL SELECT 'staging', 'inspecciones', COUNT(*) FROM stg.inspecciones
UNION ALL SELECT 'staging', 'ventas', COUNT(*) FROM stg.ventas
UNION ALL SELECT 'staging', 'precios_mercado', COUNT(*) FROM stg.precios_mercado
UNION ALL SELECT 'dw', 'dim_cliente', COUNT(*) FROM dw.dim_cliente
UNION ALL SELECT 'dw', 'fact_inspeccion', COUNT(*) FROM dw.fact_inspeccion
UNION ALL SELECT 'dw', 'fact_venta', COUNT(*) FROM dw.fact_venta
UNION ALL SELECT 'dw', 'duplicados_dni', COUNT(*) FROM dw.bridge_cliente_duplicado;

SELECT * FROM dw.metricas_calidad ORDER BY metrica;

SELECT r.resultado, COUNT(*) AS inspecciones
FROM dw.fact_inspeccion f
JOIN dw.dim_resultado_inspeccion r ON r.sk_resultado = f.sk_resultado
GROUP BY r.resultado
ORDER BY inspecciones DESC;

SELECT
    COUNT(*) AS ventas,
    SUM(precio_venta_usd) AS total_ventas_usd,
    AVG(margen_vs_mercado_usd) AS margen_promedio_usd,
    SUM(CASE WHEN precio_mercado_usd IS NOT NULL THEN 1 ELSE 0 END) AS con_mercado
FROM dw.fact_venta;

SELECT TOP 10
    v.nombre_vendedor,
    COUNT(*) AS n_ventas,
    SUM(f.precio_venta_usd) AS total_usd
FROM dw.fact_venta f
JOIN dw.dim_vendedor v ON v.sk_vendedor = f.sk_vendedor
GROUP BY v.nombre_vendedor
ORDER BY total_usd DESC;
GO
