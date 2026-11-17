// Cada prueba lleva entre corchetes el ID del requisito que verifica (ver proceso/requisitos.json).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/lib/config";
import {
  handleAudit,
  handleInspecciones,
  handleLogout,
  handleRequestOtp,
  handleVerifyOtp,
  type AppDeps,
} from "../src/lib/handlers";
import { OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_TTL_MS, generateOtp, hashOtp, verifyOtpHash } from "../src/lib/security/otp";
import { MemoryRateLimiter } from "../src/lib/security/ratelimit";
import { MemoryStore } from "../src/lib/store/memory-store";

// ---------- utilidades de prueba ----------

function makeDeps(overrides: Partial<AppDeps> = {}) {
  const clock = { t: Date.parse("2026-11-05T12:00:00Z") };
  const now = () => new Date(clock.t);
  const store = new MemoryStore(
    undefined,
    [
      {
        id_inspeccion: 1,
        fecha: "2024-01-03",
        nombre_cliente: "Cliente Ficticio",
        placa: "ABC-123",
        marca: "Toyota",
        modelo: "Corolla",
        resultado: "Aprobado",
        link_informe: "https://verificarlo.pe/informes/INS-00001.pdf",
      },
    ],
    now,
  );
  const limiter = new MemoryRateLimiter(5, 60_000, () => clock.t);
  const config = loadConfig({ NODE_ENV: "test", DEMO_SHOW_OTP: "true" } as NodeJS.ProcessEnv);
  const deps: AppDeps = { store, limiter, config, now, deliver: async () => {}, ...overrides };
  return { deps, clock, store };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, { headers });
const cookieFrom = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];

const EMAIL = "asesor1@carlo.demo";
const ADMIN = "admin@carlo.demo";
const IP = { "x-forwarded-for": "203.0.113.7" };

async function requestCode(deps: AppDeps, email = EMAIL, ip: Record<string, string> = IP) {
  const res = await handleRequestOtp(deps, post("/api/auth/request-otp", { email }, ip));
  return { res, otp: (await res.json()).demo_otp as string | undefined };
}
const verify = (deps: AppDeps, email: string, code: unknown, ip: Record<string, string> = IP) =>
  handleVerifyOtp(deps, post("/api/auth/verify-otp", { email, code }, ip));
const wrongCode = (otp: string) => (otp === "000000" ? "111111" : "000000");

async function login(deps: AppDeps, email: string, ip: Record<string, string>) {
  const { otp } = await requestCode(deps, email, ip);
  return cookieFrom(await verify(deps, email, otp, ip));
}

// ---------- OTP ----------

describe("OTP: generación y almacenamiento", () => {
  it("[RNF-01] genera códigos de 6 dígitos numéricos", () => {
    for (let i = 0; i < 200; i++) assert.match(generateOtp(), new RegExp(`^\\d{${OTP_LENGTH}}$`));
  });

  it("[RNF-02] el hash no contiene el código y solo valida con la sal, el correo y el secreto correctos", () => {
    const h = hashOtp("123456", EMAIL, "sal", "pepper");
    assert.ok(!h.includes("123456"));
    assert.ok(verifyOtpHash("123456", EMAIL, "sal", "pepper", h));
    assert.ok(!verifyOtpHash("123457", EMAIL, "sal", "pepper", h));
    assert.ok(!verifyOtpHash("123456", "otro@carlo.demo", "sal", "pepper", h));
    assert.ok(!verifyOtpHash("123456", EMAIL, "sal", "otro-pepper", h));
  });
});

describe("OTP: inicio de sesión", () => {
  it("[RF-01] [RF-02] [RNF-09] un OTP correcto inicia sesión con cookie HttpOnly y SameSite=Lax", async () => {
    const { deps } = makeDeps();
    const { res: req, otp } = await requestCode(deps);
    assert.equal(req.status, 200);
    const res = await verify(deps, EMAIL, otp);
    assert.equal(res.status, 200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
  });

  it("[RF-02] [RNF-08] un OTP incorrecto devuelve 401 con error genérico", async () => {
    const { deps } = makeDeps();
    const { otp } = await requestCode(deps);
    const res = await verify(deps, EMAIL, wrongCode(otp!));
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "INVALID_OR_EXPIRED" });
  });

  it("[RNF-03] un OTP expirado (después de 5 minutos) se rechaza aunque el código sea correcto", async () => {
    const { deps, clock, store } = makeDeps();
    const { otp } = await requestCode(deps);
    clock.t += OTP_TTL_MS + 1000;
    assert.equal((await verify(deps, EMAIL, otp)).status, 401);
    const rows = await store.listAudit({ accion: "verificar_otp", limit: 10 });
    assert.equal(rows[0].detalle?.motivo, "otp_expirado");
  });

  it("[RNF-03] un OTP es de un solo uso: no se puede reutilizar", async () => {
    const { deps } = makeDeps();
    const { otp } = await requestCode(deps);
    assert.equal((await verify(deps, EMAIL, otp)).status, 200);
    assert.equal((await verify(deps, EMAIL, otp)).status, 401);
  });

  it(`[RNF-04] máximo ${OTP_MAX_ATTEMPTS} intentos: el siguiente se bloquea aunque el código sea el correcto`, async () => {
    const { deps } = makeDeps();
    const { otp } = await requestCode(deps);
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      assert.equal((await verify(deps, EMAIL, wrongCode(otp!))).status, 401);
    }
    const res = await verify(deps, EMAIL, otp);
    assert.equal(res.status, 429);
    assert.deepEqual(await res.json(), { error: "ATTEMPTS_EXCEEDED" });
  });

  it("[RF-01] pedir un OTP nuevo invalida el anterior", async () => {
    const { deps, clock } = makeDeps();
    const first = await requestCode(deps);
    clock.t += 61_000; // fuera de la ventana del rate limit
    const second = await requestCode(deps);
    if (first.otp !== second.otp) assert.equal((await verify(deps, EMAIL, first.otp)).status, 401);
    assert.equal((await verify(deps, EMAIL, second.otp)).status, 200);
  });

  it("[RF-02] el OTP de un correo no sirve para otro correo", async () => {
    const { deps } = makeDeps();
    const a = await requestCode(deps, EMAIL);
    const b = await requestCode(deps, ADMIN);
    if (a.otp === b.otp) return; // coincidencia (1 en 1 000 000): la prueba no aplica
    assert.equal((await verify(deps, ADMIN, a.otp)).status, 401);
  });

  it("[RNF-06] un formato inválido devuelve 400 y deja un evento de auditoría", async () => {
    const { deps, store } = makeDeps();
    assert.equal((await verify(deps, EMAIL, "12ab")).status, 400);
    assert.equal((await store.listAudit({ limit: 10 })).length, 1);
  });

  it("[RNF-08] la respuesta es igual para un correo registrado y uno inexistente", async () => {
    const base = makeDeps();
    const deps = { ...base.deps, config: { ...base.deps.config, demoShowOtp: false } };
    const a = await handleRequestOtp(deps, post("/api/auth/request-otp", { email: EMAIL }, { "x-forwarded-for": "1.1.1.1" }));
    const b = await handleRequestOtp(deps, post("/api/auth/request-otp", { email: "nadie@carlo.demo" }, { "x-forwarded-for": "2.2.2.2" }));
    assert.equal(a.status, b.status);
    assert.deepEqual(await a.json(), await b.json());
  });
});

// ---------- Rate limiting ----------

describe("Rate limiting", () => {
  it("[RNF-05] el intento 6 en un minuto recibe 429 con Retry-After y queda auditado como bloqueado", async () => {
    const { deps, store } = makeDeps();
    const { otp } = await requestCode(deps);
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) last = await verify(deps, EMAIL, wrongCode(otp!));
    assert.equal(last!.status, 429);
    assert.ok(Number(last!.headers.get("retry-after")) >= 1);
    const blocked = await store.listAudit({ resultado: "bloqueado", limit: 50 });
    assert.ok(blocked.some((b) => b.detalle?.motivo === "rate_limit"));
  });

  it("[RNF-05] rotar la IP (cabecera falsificada) no evade el límite por correo", async () => {
    const { deps } = makeDeps();
    await requestCode(deps);
    let blocked = 0;
    for (let i = 0; i < 12; i++) {
      const r = await verify(deps, EMAIL, "000000", { "x-forwarded-for": `198.51.100.${i}` });
      if (r.status === 429) blocked++;
    }
    assert.ok(blocked >= 6, `se esperaban >= 6 bloqueos y hubo ${blocked}`);
  });

  it("[RNF-05] el límite se libera cuando termina la ventana", async () => {
    const { deps, clock } = makeDeps();
    for (let i = 0; i < 5; i++) await handleRequestOtp(deps, post("/api/auth/request-otp", { email: EMAIL }, IP));
    assert.equal((await handleRequestOtp(deps, post("/api/auth/request-otp", { email: EMAIL }, IP))).status, 429);
    clock.t += 61_000;
    assert.equal((await handleRequestOtp(deps, post("/api/auth/request-otp", { email: EMAIL }, IP))).status, 200);
  });

  it("[RNF-05] si el limitador falla, el intento se rechaza (503) en lugar de dejarlo pasar", async () => {
    const { deps } = makeDeps({ limiter: { limit: async () => { throw new Error("redis caído"); } } });
    assert.equal((await verify(deps, EMAIL, "123456")).status, 503);
  });

  it("[RNF-11] bloquea al menos 95 % de 100 intentos de fuerza bruta y registra todas las peticiones", async () => {
    const { deps, store } = makeDeps();
    const { otp } = await requestCode(deps);
    let bloqueados = 0;
    for (let i = 0; i < 100; i++) {
      let code = String(i).padStart(6, "0");
      if (code === otp) code = "999999";
      if ((await verify(deps, EMAIL, code)).status === 429) bloqueados++;
    }
    assert.ok(bloqueados >= 95, `bloqueados: ${bloqueados} de 100`);
    assert.equal((await store.listAudit({ limit: 10_000 })).length, 101, "1 solicitud + 100 intentos = 101 eventos");
  });
});

// ---------- Auditoría y control de acceso ----------

describe("Auditoría y acceso", () => {
  it("[RNF-06] cada acción deja exactamente un evento (trazabilidad 100 %)", async () => {
    const { deps, store, clock } = makeDeps();
    let acciones = 0;

    const { otp } = await requestCode(deps); acciones++;
    await verify(deps, EMAIL, wrongCode(otp!)); acciones++;
    await verify(deps, "x", "1"); acciones++;
    const cookie = cookieFrom(await verify(deps, EMAIL, otp)); acciones++;

    await handleInspecciones(deps, get("/api/inspecciones", { cookie })); acciones++;
    await handleInspecciones(deps, get("/api/inspecciones")); acciones++;
    await handleAudit(deps, get("/api/audit", { cookie })); acciones++; // asesor: 403
    await handleLogout(deps, post("/api/auth/logout", {}, { cookie })); acciones++;

    clock.t += 61_000;
    for (let i = 0; i < 7; i++) {
      await handleRequestOtp(deps, post("/api/auth/request-otp", { email: "nadie@carlo.demo" }, IP)); acciones++;
    }
    assert.equal((await store.listAudit({ limit: 500 })).length, acciones);
  });

  it("[RNF-07] el almacén de auditoría no expone operaciones de modificar ni borrar", async () => {
    const { store } = makeDeps();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(store));
    assert.ok(!methods.some((m) => /(update|delete|remove|truncate|clear)audit/i.test(m)));
  });

  it("[RF-04] el filtro de la auditoría devuelve solo lo pedido", async () => {
    const { store } = makeDeps();
    await store.appendAudit({ usuario: "a@x.pe", accion: "verificar_otp", recurso: "auth", ip: "1.1.1.1", resultado: "bloqueado" });
    await store.appendAudit({ usuario: "b@x.pe", accion: "verificar_otp", recurso: "auth", ip: "1.1.1.1", resultado: "exito" });
    const rows = await store.listAudit({ resultado: "bloqueado", limit: 10 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].usuario, "a@x.pe");
  });

  it("[RF-04] [RNF-10] solo el rol admin ve la auditoría; el asesor recibe 403 y el intento queda registrado", async () => {
    const { deps, store, clock } = makeDeps();
    const asesor = await login(deps, EMAIL, { "x-forwarded-for": "10.0.0.1" });
    clock.t += 61_000;
    const admin = await login(deps, ADMIN, { "x-forwarded-for": "10.0.0.2" });

    assert.equal((await handleAudit(deps, get("/api/audit", { cookie: asesor }))).status, 403);
    assert.equal((await handleAudit(deps, get("/api/audit", { cookie: admin }))).status, 200);
    const denied = await store.listAudit({ accion: "consultar_auditoria", resultado: "fallo", limit: 5 });
    assert.equal(denied[0].detalle?.motivo, "rol_insuficiente");
  });

  it("[RF-03] las inspecciones solo se entregan con sesión activa", async () => {
    const { deps } = makeDeps();
    assert.equal((await handleInspecciones(deps, get("/api/inspecciones"))).status, 401);
    const cookie = await login(deps, EMAIL, IP);
    const res = await handleInspecciones(deps, get("/api/inspecciones?q=abc", { cookie }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.length, 1);
  });

  it("[RF-05] cerrar sesión borra la cookie y queda auditado", async () => {
    const { deps, store } = makeDeps();
    const cookie = await login(deps, EMAIL, IP);
    const res = await handleLogout(deps, post("/api/auth/logout", {}, { cookie }));
    assert.match(res.headers.get("set-cookie") ?? "", /Max-Age=0/);
    const rows = await store.listAudit({ accion: "cerrar_sesion", limit: 5 });
    assert.equal(rows[0].resultado, "exito");
  });
});

// ---------- Sesión ----------

describe("Sesión", () => {
  it("[RNF-09] una cookie manipulada se rechaza", async () => {
    const { deps, clock } = makeDeps();
    const cookie = await login(deps, ADMIN, IP);
    const forged = cookie.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    clock.t += 1;
    assert.equal((await handleAudit(deps, get("/api/audit", { cookie: forged }))).status, 401);
    assert.equal((await handleAudit(deps, get("/api/audit", { cookie }))).status, 200);
  });

  it("[RNF-09] la sesión expira a los 30 minutos", async () => {
    const { deps, clock } = makeDeps();
    const cookie = await login(deps, ADMIN, IP);
    clock.t += 31 * 60_000;
    assert.equal((await handleAudit(deps, get("/api/audit", { cookie }))).status, 401);
  });
});
