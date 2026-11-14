/*
  CarloDW — base del prototipo ETL SSIS + Power BI
  Ejecutar conectado a master (Windows Auth).
*/
IF DB_ID(N'CarloDW') IS NULL
BEGIN
    CREATE DATABASE CarloDW;
END
GO

ALTER DATABASE CarloDW SET RECOVERY SIMPLE;
GO
