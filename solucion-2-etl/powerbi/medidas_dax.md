# Medidas DAX — Carlo Dashboard

```dax
Total Ventas USD = SUM( v_ventas[precio_venta_usd] )

Margen Promedio USD = AVERAGE( v_ventas[margen_vs_mercado_usd] )

Ventas Con Mercado = CALCULATE(
    COUNTROWS( v_ventas ),
    NOT ISBLANK( v_ventas[precio_mercado_usd] )
)

% Ventas Con Mercado =
DIVIDE( [Ventas Con Mercado], COUNTROWS( v_ventas ) )

Total Inspecciones = COUNTROWS( v_inspecciones )

Inspecciones Aprobadas = CALCULATE(
    [Total Inspecciones],
    v_inspecciones[resultado] = "Aprobado"
)

% Aprobadas = DIVIDE( [Inspecciones Aprobadas], [Total Inspecciones] )

Duplicados DNI = LOOKUPVALUE(
    v_calidad_datos[valor],
    v_calidad_datos[metrica], "duplicados_dni"
)
```
