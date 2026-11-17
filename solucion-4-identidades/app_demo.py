"""
App demo protegida con Keycloak (OIDC).
Muestra el login con SSO + MFA y el control de acceso por rol.

Uso:
    python app_demo.py   ->  http://localhost:5000
"""
import base64
import json
import os
from functools import wraps
from pathlib import Path

from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv
from flask import Flask, redirect, render_template_string, session, url_for, abort

load_dotenv(Path(__file__).with_name(".env"))

KC_URL = os.getenv("KEYCLOAK_URL", "http://localhost:8080").rstrip("/")
REALM = os.getenv("KEYCLOAK_REALM", "carlo")

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "solo-para-desarrollo")

oauth = OAuth(app)
oauth.register(
    name="keycloak",
    client_id="verificarlo-app",
    client_secret=os.getenv("DEMO_CLIENT_SECRET"),
    server_metadata_url=f"{KC_URL}/realms/{REALM}/.well-known/openid-configuration",
    client_kwargs={"scope": "openid profile email"},
)

PLANTILLA = """
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>CARLO · Identidades</title>
<style>
 body{font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;color:#1a1a1a}
 .card{border:1px solid #ddd;border-radius:8px;padding:16px 20px;margin:16px 0}
 .rol{display:inline-block;background:#e8f0fe;border-radius:12px;padding:2px 10px;margin:2px;font-size:14px}
 a.btn{display:inline-block;background:#1a56db;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none}
 .err{border-color:#d33;color:#a00}
</style></head><body>
<h1>CARLO · Gestión de identidades</h1>
{{ cuerpo|safe }}
</body></html>
"""


def pagina(cuerpo: str, codigo: int = 200):
    return render_template_string(PLANTILLA, cuerpo=cuerpo), codigo


def roles_del_token(access_token: str):
    """Lee los roles del access token (llegó por canal directo desde Keycloak).
    En producción, el token se valida con la clave pública del realm."""
    payload = access_token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    datos = json.loads(base64.urlsafe_b64decode(payload))
    roles = datos.get("realm_access", {}).get("roles", [])
    return sorted(r for r in roles if r in {"admin_ti", "gerente", "inspector", "vendedor", "auditor"})


def requiere_rol(*permitidos):
    def decorador(f):
        @wraps(f)
        def interno(*args, **kwargs):
            if "usuario" not in session:
                return redirect(url_for("login"))
            if not set(permitidos) & set(session["roles"]):
                return pagina(
                    '<div class="card err"><b>403 · Acceso denegado</b><br>'
                    f'Esta sección requiere uno de estos roles: {", ".join(permitidos)}.</div>'
                    '<a href="/panel">Volver</a>', 403
                )
            return f(*args, **kwargs)
        return interno
    return decorador


@app.route("/")
def inicio():
    if "usuario" in session:
        return redirect(url_for("panel"))
    return pagina('<div class="card">Ingresa con tu cuenta corporativa (SSO + MFA).</div>'
                  '<a class="btn" href="/login">Iniciar sesión</a>')


@app.route("/login")
def login():
    return oauth.keycloak.authorize_redirect(url_for("callback", _external=True))


@app.route("/callback")
def callback():
    token = oauth.keycloak.authorize_access_token()
    info = token["userinfo"]
    session["usuario"] = info.get("preferred_username")
    session["nombre"] = info.get("name", info.get("preferred_username"))
    session["roles"] = roles_del_token(token["access_token"])
    session["id_token"] = token["id_token"]
    return redirect(url_for("panel"))


@app.route("/panel")
@requiere_rol("admin_ti", "gerente", "inspector", "vendedor", "auditor")
def panel():
    roles = "".join(f'<span class="rol">{r}</span>' for r in session["roles"]) or "(sin rol)"
    return pagina(
        f'<div class="card"><b>{session["nombre"]}</b> ({session["usuario"]})<br>Roles: {roles}</div>'
        '<ul><li><a href="/inspecciones">Registrar inspecciones</a> (inspector, admin_ti)</li>'
        '<li><a href="/clientes">Gestión de clientes</a> (vendedor, admin_ti)</li>'
        '<li><a href="/auditoria">Logs de auditoría</a> (auditor, admin_ti)</li></ul>'
        '<a href="/logout">Cerrar sesión</a>'
    )


@app.route("/inspecciones")
@requiere_rol("inspector", "admin_ti")
def inspecciones():
    return pagina('<div class="card">Módulo de inspecciones (simulado).</div><a href="/panel">Volver</a>')


@app.route("/clientes")
@requiere_rol("vendedor", "admin_ti")
def clientes():
    return pagina('<div class="card">Módulo de clientes (simulado).</div><a href="/panel">Volver</a>')


@app.route("/auditoria")
@requiere_rol("auditor", "admin_ti")
def auditoria():
    return pagina('<div class="card">Logs de auditoría (simulado).</div><a href="/panel">Volver</a>')


@app.route("/logout")
def logout():
    id_token = session.pop("id_token", None)
    session.clear()
    fin = oauth.keycloak.load_server_metadata().get("end_session_endpoint")
    if fin and id_token:
        return redirect(
            f"{fin}?id_token_hint={id_token}"
            f"&post_logout_redirect_uri={url_for('inicio', _external=True)}"
        )
    return redirect(url_for("inicio"))


if __name__ == "__main__":
    app.run(port=5000, debug=True)
