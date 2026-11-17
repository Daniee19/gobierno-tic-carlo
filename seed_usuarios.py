"""
Crea usuarios de prueba por rol en el realm 'carlo' de Keycloak.

Los nombres de vendedores e inspectores se toman del dataset común (../data/)
si las columnas existen; si no, se usan nombres de respaldo.
Es idempotente: si el usuario ya existe, solo se vuelve a asignar el rol.

Uso:
    python seed_usuarios.py
"""
import csv
import os
import sys
import unicodedata
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

KC_URL = os.getenv("KEYCLOAK_URL", "http://localhost:8080").rstrip("/")
REALM = os.getenv("KEYCLOAK_REALM", "carlo")
ADMIN_USER = os.getenv("KEYCLOAK_ADMIN", "admin")
ADMIN_PASS = os.getenv("KEYCLOAK_ADMIN_PASSWORD")
PASS_TEMP = os.getenv("USUARIOS_PASSWORD_TEMPORAL")
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DOMINIO = "carlo.test"  # correos ficticios

USUARIOS_BASE = [
    ("admin.carlo", "Administrador", "TI", "admin_ti"),
    ("gerente.carlo", "Gerente", "General", "gerente"),
    ("auditor.carlo", "Auditor", "Interno", "auditor"),
]


def normalizar(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFD", texto)
    return "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn")


def nombres_desde_csv(archivo: str, palabra_columna: str, maximo: int = 3):
    """Devuelve hasta 'maximo' nombres distintos de la primera columna cuyo
    encabezado contenga 'palabra_columna'. Si no hay, devuelve []."""
    ruta = DATA_DIR / archivo
    if not ruta.exists():
        return []
    with open(ruta, newline="", encoding="utf-8-sig") as f:
        lector = csv.DictReader(f)
        columna = next(
            (c for c in (lector.fieldnames or []) if palabra_columna in c.lower()), None
        )
        if not columna:
            return []
        vistos = []
        for fila in lector:
            valor = (fila.get(columna) or "").strip()
            if valor and valor not in vistos:
                vistos.append(valor)
            if len(vistos) >= maximo:
                break
        return vistos


def armar_usuarios():
    usuarios = list(USUARIOS_BASE)
    for archivo, columna, rol, respaldo in [
        ("inspecciones.csv", "inspector", "inspector", ["Luis Ramos", "Rosa Medina"]),
        ("ventas.csv", "vendedor", "vendedor", ["Carlos Quispe", "Ana Torres"]),
    ]:
        nombres = nombres_desde_csv(archivo, columna) or respaldo
        for completo in nombres:
            partes = normalizar(completo).lower().split()
            username = ".".join(partes[:2]) if len(partes) > 1 else partes[0]
            nombre = completo.split()[0]
            apellido = " ".join(completo.split()[1:]) or "CARLO"
            usuarios.append((username, nombre, apellido, rol))
    return usuarios


def obtener_token() -> str:
    r = requests.post(
        f"{KC_URL}/realms/master/protocol/openid-connect/token",
        data={
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": ADMIN_USER,
            "password": ADMIN_PASS,
        },
        timeout=15,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def main():
    if not ADMIN_PASS or not PASS_TEMP:
        sys.exit("Falta KEYCLOAK_ADMIN_PASSWORD o USUARIOS_PASSWORD_TEMPORAL en el .env")

    try:
        token = obtener_token()
    except requests.RequestException as e:
        sys.exit(f"No se pudo conectar a Keycloak en {KC_URL}: {e}")

    h = {"Authorization": f"Bearer {token}"}
    base = f"{KC_URL}/admin/realms/{REALM}"

    print(f"{'usuario':<22}{'rol':<12}estado")
    print("-" * 46)
    for username, nombre, apellido, rol in armar_usuarios():
        cuerpo = {
            "username": username,
            "email": f"{username}@{DOMINIO}",
            "firstName": nombre,
            "lastName": apellido,
            "enabled": True,
            "emailVerified": True,
            "requiredActions": ["CONFIGURE_TOTP"],
            "credentials": [{"type": "password", "value": PASS_TEMP, "temporary": True}],
        }
        r = requests.post(f"{base}/users", json=cuerpo, headers=h, timeout=15)
        if r.status_code == 201:
            user_id = r.headers["Location"].rstrip("/").split("/")[-1]
            estado = "creado"
        elif r.status_code == 409:
            q = requests.get(
                f"{base}/users", params={"username": username, "exact": "true"},
                headers=h, timeout=15,
            )
            user_id = q.json()[0]["id"]
            estado = "ya existía"
        else:
            print(f"{username:<22}{rol:<12}ERROR {r.status_code}: {r.text}")
            continue

        rol_rep = requests.get(f"{base}/roles/{rol}", headers=h, timeout=15).json()
        requests.post(
            f"{base}/users/{user_id}/role-mappings/realm",
            json=[rol_rep], headers=h, timeout=15,
        ).raise_for_status()
        print(f"{username:<22}{rol:<12}{estado}")

    print("\nListo. En el primer login cada usuario cambia la contraseña y configura el MFA (TOTP).")


if __name__ == "__main__":
    main()
