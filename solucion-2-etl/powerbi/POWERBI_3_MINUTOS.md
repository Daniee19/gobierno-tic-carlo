# Terminar el .pbix en ~3 minutos (datos ya cargados)

Tienes `dw v_ventas`, `dw v_inspecciones`, `dw v_calidad_datos` y un gráfico con `Sum of precio_venta_usd`.

## Página 1 — Ventas vs mercado

1. Doble clic en **Page 1** (abajo) → renombra a `Ventas`.
2. Selecciona el gráfico de columnas.
3. En Data (`dw v_ventas`), marca **`vendedor`** → debe ir al **eje X**.
4. Inserta un **Card**: campo `precio_venta_usd` (total).
5. Inserta otro **Card**: `margen_vs_mercado_usd` → en el campo cambia a **Average**.
6. Inserta **Slicer**: campo `posicion_mercado`.
7. Opcional: otro gráfico de barras con `marca` en X y `precio_venta_usd` en Y.

## Página 2 — Inspecciones

1. Icono **+** abajo → página nueva → nombre `Inspecciones`.
2. Gráfico de dona o barras: `resultado` + conteo (arrastra `id_inspeccion` o cualquier campo y pon **Count**).
3. Card: conteo total de filas de `dw v_inspecciones`.

## Página 3 — Calidad

1. Nueva página → `Calidad`.
2. Visual **Table**: de `dw v_calidad_datos` pon `metrica`, `valor`, `detalle`.
3. Card filtrada o resaltada: busca la fila `duplicados_dni` = **21**.

## Guardar

`Archivo → Guardar como` →  
`C:\Users\jorgi\Downloads\gobierno-tic-carlo-repo\solucion-2-etl\powerbi\Carlo_Dashboard.pbix`

## Demo alternativa (ya lista)

Abre en el navegador: `Carlo_Dashboard.html` (mismas 3 páginas con datos reales del DW).
