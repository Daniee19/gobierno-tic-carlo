/*
  Data Warehouse dimensional (estrella) para Power BI.
*/
USE CarloDW;
GO

IF SCHEMA_ID(N'dw') IS NULL EXEC(N'CREATE SCHEMA dw');
GO

/* Hechos primero por FKs */
IF OBJECT_ID(N'dw.fact_venta', N'U') IS NOT NULL DROP TABLE dw.fact_venta;
IF OBJECT_ID(N'dw.fact_inspeccion', N'U') IS NOT NULL DROP TABLE dw.fact_inspeccion;
IF OBJECT_ID(N'dw.dim_cliente', N'U') IS NOT NULL DROP TABLE dw.dim_cliente;
IF OBJECT_ID(N'dw.dim_vehiculo', N'U') IS NOT NULL DROP TABLE dw.dim_vehiculo;
IF OBJECT_ID(N'dw.dim_fecha', N'U') IS NOT NULL DROP TABLE dw.dim_fecha;
IF OBJECT_ID(N'dw.dim_vendedor', N'U') IS NOT NULL DROP TABLE dw.dim_vendedor;
IF OBJECT_ID(N'dw.dim_resultado_inspeccion', N'U') IS NOT NULL DROP TABLE dw.dim_resultado_inspeccion;
IF OBJECT_ID(N'dw.bridge_cliente_duplicado', N'U') IS NOT NULL DROP TABLE dw.bridge_cliente_duplicado;
IF OBJECT_ID(N'dw.metricas_calidad', N'U') IS NOT NULL DROP TABLE dw.metricas_calidad;
GO

CREATE TABLE dw.dim_cliente (
    sk_cliente          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_cliente          INT             NOT NULL,
    dni                 VARCHAR(20)     NULL,
    nombre_completo     NVARCHAR(300)   NULL,
    email               NVARCHAR(200)   NULL,
    telefono            VARCHAR(30)     NULL,
    es_registro_maestro BIT             NOT NULL DEFAULT 1,
    tiene_duplicados    BIT             NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX UX_dim_cliente_id ON dw.dim_cliente(id_cliente);

CREATE TABLE dw.dim_vehiculo (
    sk_vehiculo         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_vehiculo         INT             NOT NULL,
    placa               VARCHAR(20)     NULL,
    marca               NVARCHAR(50)    NULL,
    modelo              NVARCHAR(50)    NULL,
    anio                INT             NULL,
    color               NVARCHAR(40)    NULL,
    id_cliente_origen   INT             NULL
);

CREATE UNIQUE INDEX UX_dim_vehiculo_id ON dw.dim_vehiculo(id_vehiculo);

CREATE TABLE dw.dim_fecha (
    sk_fecha            INT             NOT NULL PRIMARY KEY, -- yyyymmdd
    fecha               DATE            NOT NULL,
    anio                INT             NOT NULL,
    mes                 INT             NOT NULL,
    nombre_mes          NVARCHAR(20)    NOT NULL,
    trimestre           INT             NOT NULL,
    dia                 INT             NOT NULL,
    nombre_dia          NVARCHAR(20)    NOT NULL
);

CREATE TABLE dw.dim_vendedor (
    sk_vendedor         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    nombre_vendedor     NVARCHAR(120)   NOT NULL
);

CREATE UNIQUE INDEX UX_dim_vendedor_nombre ON dw.dim_vendedor(nombre_vendedor);

CREATE TABLE dw.dim_resultado_inspeccion (
    sk_resultado        INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    resultado           NVARCHAR(40)    NOT NULL
);

CREATE UNIQUE INDEX UX_dim_resultado ON dw.dim_resultado_inspeccion(resultado);

CREATE TABLE dw.bridge_cliente_duplicado (
    id_cliente_duplicado INT            NOT NULL,
    id_cliente_maestro   INT            NOT NULL,
    dni                  VARCHAR(20)    NULL,
    criterio             NVARCHAR(40)   NOT NULL,
    PRIMARY KEY (id_cliente_duplicado)
);

CREATE TABLE dw.fact_inspeccion (
    sk_inspeccion       INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_inspeccion       INT             NOT NULL,
    sk_fecha            INT             NOT NULL,
    sk_cliente          INT             NOT NULL,
    sk_vehiculo         INT             NULL,
    sk_resultado        INT             NOT NULL,
    link_informe        NVARCHAR(400)   NULL,
    CONSTRAINT FK_fi_fecha FOREIGN KEY (sk_fecha) REFERENCES dw.dim_fecha(sk_fecha),
    CONSTRAINT FK_fi_cliente FOREIGN KEY (sk_cliente) REFERENCES dw.dim_cliente(sk_cliente),
    CONSTRAINT FK_fi_vehiculo FOREIGN KEY (sk_vehiculo) REFERENCES dw.dim_vehiculo(sk_vehiculo),
    CONSTRAINT FK_fi_resultado FOREIGN KEY (sk_resultado) REFERENCES dw.dim_resultado_inspeccion(sk_resultado)
);

CREATE TABLE dw.fact_venta (
    sk_venta            INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    id_venta            INT             NOT NULL,
    sk_fecha            INT             NOT NULL,
    sk_cliente          INT             NOT NULL,
    sk_vehiculo         INT             NULL,
    sk_vendedor         INT             NOT NULL,
    precio_venta_usd    DECIMAL(12,2)   NOT NULL,
    precio_mercado_usd  DECIMAL(12,2)   NULL,
    margen_vs_mercado_usd DECIMAL(12,2) NULL,
    CONSTRAINT FK_fv_fecha FOREIGN KEY (sk_fecha) REFERENCES dw.dim_fecha(sk_fecha),
    CONSTRAINT FK_fv_cliente FOREIGN KEY (sk_cliente) REFERENCES dw.dim_cliente(sk_cliente),
    CONSTRAINT FK_fv_vehiculo FOREIGN KEY (sk_vehiculo) REFERENCES dw.dim_vehiculo(sk_vehiculo),
    CONSTRAINT FK_fv_vendedor FOREIGN KEY (sk_vendedor) REFERENCES dw.dim_vendedor(sk_vendedor)
);

CREATE TABLE dw.metricas_calidad (
    metrica             NVARCHAR(80)    NOT NULL PRIMARY KEY,
    valor               INT             NOT NULL,
    detalle             NVARCHAR(400)   NULL,
    fecha_calculo       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
