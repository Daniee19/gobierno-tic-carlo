"""
Sincronización automática: Verificarlo (CSV) → HubSpot CRM.
Prototipo con datos simulados. En producción, las fuentes serían
Verificarlo (PostgreSQL) y HubSpot.

Uso:
    export HUBSPOT_API_KEY="pat-na1-..."
    python sync_hubspot.py
"""

import csv
import os
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import json

ENV_PATH = Path(__file__).resolve().parent / ".env"
if ENV_PATH.exists():
    for line in ENV_PATH.read_text().strip().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

API_KEY = os.environ.get("HUBSPOT_API_KEY", "")
BASE_URL = "https://api.hubapi.com"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def hubspot(method, endpoint, body=None):
    url = f"{BASE_URL}{endpoint}"
    data = json.dumps(body).encode() if body else None
    req = Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {API_KEY}")
    req.add_header("Content-Type", "application/json")
    try:
        with urlopen(req) as resp:
            return json.loads(resp.read()) if resp.status != 204 else {}
    except HTTPError as e:
        error_body = e.read().decode()
        if e.code == 409:
            return json.loads(error_body)
        raise SystemExit(f"Error {e.code} en {method} {endpoint}: {error_body}")


def ensure_contact_properties():
    """Crea las propiedades personalizadas si no existen."""
    props = [
        {"name": "placa", "label": "Placa del vehículo", "type": "string",
         "fieldType": "text", "groupName": "contactinformation"},
        {"name": "resultado_inspeccion", "label": "Resultado de inspección",
         "type": "enumeration", "fieldType": "select",
         "groupName": "contactinformation",
         "options": [
             {"label": "Aprobado", "value": "Aprobado"},
             {"label": "Desaprobado", "value": "Desaprobado"},
             {"label": "Observado", "value": "Observado"},
         ]},
        {"name": "fecha_inspeccion", "label": "Fecha de última inspección",
         "type": "date", "fieldType": "date",
         "groupName": "contactinformation"},
    ]
    for prop in props:
        hubspot("POST", "/crm/v3/properties/contacts", prop)
        hubspot("PATCH", f"/crm/v3/properties/contacts/{prop['name']}", prop)
        print(f"  Propiedad '{prop['name']}' OK.")


def search_contact_by_email(email):
    body = {
        "filterGroups": [{"filters": [
            {"propertyName": "email", "operator": "EQ", "value": email}
        ]}],
        "properties": ["email", "firstname", "lastname"],
        "limit": 1,
    }
    result = hubspot("POST", "/crm/v3/objects/contacts/search", body)
    results = result.get("results", [])
    return results[0]["id"] if results else None


def upsert_contact(row):
    """Crea o actualiza un contacto. Retorna (contact_id, was_created)."""
    nombres = row["nombre_cliente"].split()
    firstname = nombres[0] if nombres else ""
    lastname = " ".join(nombres[1:]) if len(nombres) > 1 else ""

    from calendar import timegm
    fecha_epoch = timegm(time.strptime(row["fecha"], "%Y-%m-%d")) * 1000

    properties = {
        "email": row["email"],
        "firstname": firstname,
        "lastname": lastname,
        "phone": row["telefono"],
        "placa": row["placa"],
        "resultado_inspeccion": row["resultado"],
        "fecha_inspeccion": str(fecha_epoch),
    }

    existing_id = search_contact_by_email(row["email"])
    if existing_id:
        hubspot("PATCH", f"/crm/v3/objects/contacts/{existing_id}",
                {"properties": properties})
        return existing_id, False

    result = hubspot("POST", "/crm/v3/objects/contacts",
                     {"properties": properties})
    return result["id"], True


def get_deal_stages():
    """Obtiene los stage IDs del pipeline default."""
    result = hubspot("GET", "/crm/v3/pipelines/deals/default")
    key = "stageId" if "stageId" in result["stages"][0] else "id"
    stages = {s["label"].lower(): s[key] for s in result["stages"]}
    last = result["stages"][-1][key]
    first = result["stages"][0][key]
    return stages.get("closed won", last), stages.get("closed lost", first)


STAGE_WON = None
STAGE_LOST = None


def create_deal(row, contact_id):
    """Crea un deal 'Inspección – [placa]' asociado al contacto."""
    global STAGE_WON, STAGE_LOST
    if STAGE_WON is None:
        STAGE_WON, STAGE_LOST = get_deal_stages()
    deal_name = f"Inspección – {row['placa']}"
    deal = hubspot("POST", "/crm/v3/objects/deals", {"properties": {
        "dealname": deal_name,
        "pipeline": "default",
        "dealstage": STAGE_WON if row["resultado"] == "Aprobado" else STAGE_LOST,
    }})
    deal_id = deal["id"]
    hubspot("PUT",
            f"/crm/v3/objects/deals/{deal_id}/associations/contacts/{contact_id}/deal_to_contact",
            None)
    return deal_id


def main():
    if not API_KEY:
        sys.exit("Falta HUBSPOT_API_KEY. Créala en HubSpot → Settings → "
                 "Integrations → Private Apps.")

    inspecciones_path = DATA_DIR / "inspecciones.csv"
    if not inspecciones_path.exists():
        sys.exit(f"No se encontró {inspecciones_path}")

    with open(inspecciones_path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    print(f"Inspecciones a sincronizar: {len(rows)}")
    print("Creando propiedades personalizadas en HubSpot...")
    ensure_contact_properties()

    created = 0
    updated = 0
    deals = 0
    errors = 0
    seen_emails = {}
    start = time.time()

    for i, row in enumerate(rows, 1):
        email = row["email"].strip().lower()
        try:
            if email in seen_emails:
                contact_id = seen_emails[email]
                was_created = False
            else:
                contact_id, was_created = upsert_contact(row)
                seen_emails[email] = contact_id

            if was_created:
                created += 1
            else:
                updated += 1

            create_deal(row, contact_id)
            deals += 1

        except Exception as e:
            errors += 1
            print(f"  Error fila {i} ({email}): {e}")

        if i % 50 == 0:
            print(f"  Progreso: {i}/{len(rows)}")

    elapsed = time.time() - start

    print("\n" + "=" * 50)
    print("RESUMEN DE SINCRONIZACIÓN")
    print("=" * 50)
    print(f"Total inspecciones procesadas: {len(rows)}")
    print(f"Contactos creados:             {created}")
    print(f"Contactos actualizados:        {updated}")
    print(f"Duplicados evitados (cache):   {len(rows) - len(seen_emails)}")
    print(f"Deals creados:                 {deals}")
    print(f"Errores:                       {errors}")
    print(f"Tiempo total:                  {elapsed:.1f}s")
    print(f"Tasa de sincronización:        {(deals / len(rows)) * 100:.1f}%")
    print("=" * 50)

    # KPIs del plan
    sync_rate = (deals / len(rows)) * 100 if rows else 0
    print(f"\nKPI M01 — Inspecciones sincronizadas: {sync_rate:.1f}% (meta ≥ 95%)")
    print(f"KPI M03 — Tiempo automático: {elapsed:.1f}s vs ~{len(rows) * 3}s manual "
          f"(~3s por registro)")
    dup_count = len(rows) - len(seen_emails)
    print(f"KPI Duplicados — Emails repetidos manejados sin crear contactos extra: "
          f"{dup_count}")


if __name__ == "__main__":
    main()
