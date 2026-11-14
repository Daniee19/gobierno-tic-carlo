<#
.SYNOPSIS
  Orquesta el ETL CarloDW: crea DB, carga staging desde CSV y transforma al DW.

.DESCRIPTION
  Equivalente ejecutable al Control Flow de SSIS (prototipo).
  El paquete SSIS llama la misma lógica SQL (ver ssis/GUIA_SSIS.md).

.EXAMPLE
  .\run_etl.ps1
  .\run_etl.ps1 -ServerInstance "localhost" -DataDir "..\data"
#>
[CmdletBinding()]
param(
    [string]$ServerInstance = "localhost",
    [string]$Database = "CarloDW",
    [string]$DataDir = "",
    [string]$SqlCmdPath = ""
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $DataDir) { $DataDir = Join-Path (Split-Path $here -Parent) "data" }
$sqlDir = Join-Path $here "sql"

if (-not $SqlCmdPath) {
    $candidates = @(
        "C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\180\Tools\Binn\SQLCMD.EXE",
        "C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE"
    )
    $SqlCmdPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $SqlCmdPath -or -not (Test-Path $SqlCmdPath)) {
    throw "No se encontró sqlcmd.exe. Instala las herramientas de cliente de SQL Server."
}
if (-not (Test-Path $DataDir)) { throw "No existe DataDir: $DataDir" }

function Invoke-SqlFile {
    param([string]$File, [string]$Db = "master")
    Write-Host ">> SQL: $(Split-Path $File -Leaf)" -ForegroundColor Cyan
    & $SqlCmdPath -S $ServerInstance -E -C -d $Db -b -i $File
    if ($LASTEXITCODE -ne 0) { throw "Falló $File (exit $LASTEXITCODE)" }
}

function Get-SqlConnection {
    Add-Type -AssemblyName System.Data
    # ODBC 18 / SqlClient: confiar en certificado local
    $cs = "Server=$ServerInstance;Database=$Database;Integrated Security=True;TrustServerCertificate=True;"
    $conn = New-Object System.Data.SqlClient.SqlConnection $cs
    $conn.Open()
    return $conn
}

function Import-CsvToTable {
    param(
        [System.Data.SqlClient.SqlConnection]$Connection,
        [string]$CsvPath,
        [string]$DestinationTable,
        [hashtable]$ColumnMap
    )
    if (-not (Test-Path $CsvPath)) { throw "CSV no encontrado: $CsvPath" }

    $rows = Import-Csv -Path $CsvPath -Encoding UTF8
    if ($rows.Count -eq 0) { Write-Warning "CSV vacío: $CsvPath"; return 0 }

    $table = New-Object System.Data.DataTable
    foreach ($col in $ColumnMap.Keys) {
        [void]$table.Columns.Add($col)
    }

    foreach ($r in $rows) {
        $dr = $table.NewRow()
        foreach ($dest in $ColumnMap.Keys) {
            $src = $ColumnMap[$dest]
            $val = $r.$src
            if ($null -eq $val -or $val -eq "") {
                $dr[$dest] = [DBNull]::Value
            } else {
                $dr[$dest] = $val
            }
        }
        $table.Rows.Add($dr)
    }

    $bulk = New-Object System.Data.SqlClient.SqlBulkCopy $Connection
    $bulk.DestinationTableName = $DestinationTable
    $bulk.BatchSize = 500
    foreach ($dest in $ColumnMap.Keys) {
        [void]$bulk.ColumnMappings.Add($dest, $dest)
    }
    $bulk.WriteToServer($table)
    Write-Host "   Cargados $($table.Rows.Count) -> $DestinationTable" -ForegroundColor Green
    return $table.Rows.Count
}

Write-Host "=== CarloDW ETL ===" -ForegroundColor Yellow
Write-Host "Server: $ServerInstance | Data: $DataDir"

Invoke-SqlFile (Join-Path $sqlDir "01_create_database.sql") "master"
Invoke-SqlFile (Join-Path $sqlDir "02_create_staging.sql") $Database
Invoke-SqlFile (Join-Path $sqlDir "03_create_dw.sql") $Database

Write-Host ">> Truncate staging + bulk load CSV" -ForegroundColor Cyan
$conn = Get-SqlConnection
try {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = @"
TRUNCATE TABLE stg.clientes;
TRUNCATE TABLE stg.vehiculos;
TRUNCATE TABLE stg.inspecciones;
TRUNCATE TABLE stg.ventas;
TRUNCATE TABLE stg.precios_mercado;
"@
    [void]$cmd.ExecuteNonQuery()

    Import-CsvToTable $conn (Join-Path $DataDir "clientes.csv") "stg.clientes" @{
        id_cliente="id_cliente"; dni="dni"; nombre="nombre";
        apellido_paterno="apellido_paterno"; apellido_materno="apellido_materno";
        email="email"; telefono="telefono"
    } | Out-Null

    Import-CsvToTable $conn (Join-Path $DataDir "vehiculos.csv") "stg.vehiculos" @{
        id_vehiculo="id_vehiculo"; id_cliente="id_cliente"; placa="placa";
        marca="marca"; modelo="modelo"; anio="anio"; color="color"
    } | Out-Null

    Import-CsvToTable $conn (Join-Path $DataDir "inspecciones.csv") "stg.inspecciones" @{
        id_inspeccion="id_inspeccion"; fecha="fecha"; id_cliente="id_cliente";
        nombre_cliente="nombre_cliente"; email="email"; telefono="telefono";
        id_vehiculo="id_vehiculo"; placa="placa"; marca="marca"; modelo="modelo";
        resultado="resultado"; link_informe="link_informe"
    } | Out-Null

    Import-CsvToTable $conn (Join-Path $DataDir "ventas.csv") "stg.ventas" @{
        id_venta="id_venta"; fecha="fecha"; id_cliente="id_cliente";
        nombre_cliente="nombre_cliente"; id_vehiculo="id_vehiculo"; placa="placa";
        marca="marca"; modelo="modelo"; precio_venta_usd="precio_venta_usd";
        vendedor="vendedor"
    } | Out-Null

    Import-CsvToTable $conn (Join-Path $DataDir "precios_mercado.csv") "stg.precios_mercado" @{
        id_precio="id_precio"; marca="marca"; modelo="modelo";
        anio="anio"; precio_mercado_usd="precio_mercado_usd"
    } | Out-Null
}
finally {
    $conn.Close()
}

Invoke-SqlFile (Join-Path $sqlDir "04_etl_transform.sql") $Database
Invoke-SqlFile (Join-Path $sqlDir "05_validacion.sql") $Database

Write-Host "=== ETL completado. Conecta Power BI a CarloDW (esquema dw). ===" -ForegroundColor Yellow
