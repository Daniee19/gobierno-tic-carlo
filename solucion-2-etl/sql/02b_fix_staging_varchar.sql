/*
  Unifica staging a VARCHAR (no Unicode) para evitar el error
  "cannot convert between unicode and non-unicode" en SSIS Flat File.
  Ejecutar en CarloDW (SSMS o sqlcmd) y luego en SSIS:
  - Quitar Data Conversion
  - Flat File code page 1252 / DT_STR
  - Mapear directo al OLE DB Destination
*/
USE CarloDW;
GO

IF OBJECT_ID(N'stg.clientes', N'U') IS NOT NULL DROP TABLE stg.clientes;
IF OBJECT_ID(N'stg.vehiculos', N'U') IS NOT NULL DROP TABLE stg.vehiculos;
IF OBJECT_ID(N'stg.inspecciones', N'U') IS NOT NULL DROP TABLE stg.inspecciones;
IF OBJECT_ID(N'stg.ventas', N'U') IS NOT NULL DROP TABLE stg.ventas;
IF OBJECT_ID(N'stg.precios_mercado', N'U') IS NOT NULL DROP TABLE stg.precios_mercado;
GO

CREATE TABLE stg.clientes (
    id_cliente          INT             NULL,
    dni                 VARCHAR(20)     NULL,
    nombre              VARCHAR(100)    NULL,
    apellido_paterno    VARCHAR(100)    NULL,
    apellido_materno    VARCHAR(100)    NULL,
    email               VARCHAR(200)    NULL,
    telefono            VARCHAR(30)     NULL
);

CREATE TABLE stg.vehiculos (
    id_vehiculo         INT             NULL,
    id_cliente          INT             NULL,
    placa               VARCHAR(20)     NULL,
    marca               VARCHAR(50)     NULL,
    modelo              VARCHAR(50)     NULL,
    anio                INT             NULL,
    color               VARCHAR(40)     NULL
);

CREATE TABLE stg.inspecciones (
    id_inspeccion       INT             NULL,
    fecha               DATE            NULL,
    id_cliente          INT             NULL,
    nombre_cliente      VARCHAR(200)    NULL,
    email               VARCHAR(200)    NULL,
    telefono            VARCHAR(30)     NULL,
    id_vehiculo         INT             NULL,
    placa               VARCHAR(20)     NULL,
    marca               VARCHAR(50)     NULL,
    modelo              VARCHAR(50)     NULL,
    resultado           VARCHAR(40)     NULL,
    link_informe        VARCHAR(400)    NULL
);

CREATE TABLE stg.ventas (
    id_venta            INT             NULL,
    fecha               DATE            NULL,
    id_cliente          INT             NULL,
    nombre_cliente      VARCHAR(200)    NULL,
    id_vehiculo         INT             NULL,
    placa               VARCHAR(20)     NULL,
    marca               VARCHAR(50)     NULL,
    modelo              VARCHAR(50)     NULL,
    precio_venta_usd    DECIMAL(12,2)   NULL,
    vendedor            VARCHAR(120)    NULL
);

CREATE TABLE stg.precios_mercado (
    id_precio           INT             NULL,
    marca               VARCHAR(50)     NULL,
    modelo              VARCHAR(50)     NULL,
    anio                INT             NULL,
    precio_mercado_usd  DECIMAL(12,2)   NULL
);
GO
