"""Exporta agregados de CarloDW para el dashboard HTML de respaldo/demo."""
import json
import subprocess
from pathlib import Path

SQLCMD = r"C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\180\Tools\Binn\SQLCMD.EXE"
OUT = Path(__file__).resolve().parent


def q(sql: str) -> list[str]:
    r = subprocess.run(
        [SQLCMD, "-S", "localhost", "-E", "-C", "-d", "CarloDW", "-h", "-1", "-W", "-s", "|", "-Q", sql],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return [l.strip() for l in r.stdout.splitlines() if l.strip() and not l.startswith("(")]


def main() -> None:
    vendedores = []
    for line in q(
        "SET NOCOUNT ON; SELECT vendedor + '|' + CAST(SUM(precio_venta_usd) AS varchar(30)) "
        "+ '|' + CAST(AVG(margen_vs_mercado_usd) AS varchar(30)) "
        "FROM dw.v_ventas GROUP BY vendedor ORDER BY SUM(precio_venta_usd) DESC;"
    ):
        p = line.split("|")
        if len(p) >= 3:
            vendedores.append(
                {
                    "vendedor": p[0],
                    "total": float(p[1]),
                    "margen": None if p[2] in ("NULL", "") else float(p[2]),
                }
            )

    inspecciones = []
    for line in q(
        "SET NOCOUNT ON; SELECT resultado + '|' + CAST(COUNT(*) AS varchar(20)) "
        "FROM dw.v_inspecciones GROUP BY resultado;"
    ):
        p = line.split("|")
        if len(p) == 2:
            inspecciones.append({"resultado": p[0], "n": int(p[1])})

    calidad = []
    for line in q(
        "SET NOCOUNT ON; SELECT metrica + '|' + CAST(valor AS varchar(20)) + '|' + ISNULL(detalle, '') "
        "FROM dw.v_calidad_datos;"
    ):
        p = line.split("|")
        if len(p) >= 2:
            calidad.append(
                {"metrica": p[0], "valor": int(p[1]), "detalle": p[2] if len(p) > 2 else ""}
            )

    marcas = []
    for line in q(
        "SET NOCOUNT ON; SELECT TOP 8 marca + '|' + CAST(SUM(precio_venta_usd) AS varchar(30)) "
        "FROM dw.v_ventas GROUP BY marca ORDER BY SUM(precio_venta_usd) DESC;"
    ):
        p = line.split("|")
        if len(p) == 2:
            marcas.append({"marca": p[0], "total": float(p[1])})

    posicion = []
    for line in q(
        "SET NOCOUNT ON; SELECT posicion_mercado + '|' + CAST(COUNT(*) AS varchar(20)) "
        "FROM dw.v_ventas GROUP BY posicion_mercado;"
    ):
        p = line.split("|")
        if len(p) == 2:
            posicion.append({"pos": p[0], "n": int(p[1])})

    data = {
        "vendedores": vendedores,
        "inspecciones": inspecciones,
        "calidad": calidad,
        "marcas": marcas,
        "posicion": posicion,
        "kpis": {
            "total_ventas": sum(r["total"] for r in vendedores),
            "n_ventas": 200,
            "n_insp": 800,
            "dup": next((c["valor"] for c in calidad if c["metrica"] == "duplicados_dni"), 21),
        },
    }
    (OUT / "dashboard_data.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("OK", OUT / "dashboard_data.json")


if __name__ == "__main__":
    main()
