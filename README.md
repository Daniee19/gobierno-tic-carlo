# Gobierno de TIC — Prototipos CARLO

Prototipos de soluciones tecnológicas para la empresa automotriz CARLO.
Datos simulados. En producción, las fuentes serían Verificarlo (PostgreSQL) y HubSpot.

## Equipo

| # | Solución | Responsable |
|---|----------|-------------|
| 1 | Integración automática Verificarlo → HubSpot | Daniel |
| 2 | ETL con SSIS + dashboard en Power BI | Jorge |
| 3 | Seguridad de Verificarlo: OTP, rate limiting y auditoría | Frantz |
| 4 | Gestión de identidades y accesos (Keycloak + MFA) | Anderson |
| 5 | Gobierno de datos personales (Ley 29733) | Janira |

## Estructura

```
data/                          → Dataset ficticio común (CSVs)
solucion-1-integracion/        → Daniel
solucion-2-etl/                → Jorge
solucion-3-seguridad/          → Frantz
solucion-4-identidades/        → Anderson
solucion-5-gobierno-datos/     → Janira
scripts/                       → Scripts SQL compartidos
```

## Dataset

Todos usan el mismo dataset en `data/`. Nadie inventa datos por su cuenta.

| Archivo | Registros |
|---------|-----------|
| clientes.csv | 500 (20 duplicados sembrados) |
| vehiculos.csv | 600 |
| inspecciones.csv | 800 |
| ventas.csv | 200 |
| precios_mercado.csv | 561 |
