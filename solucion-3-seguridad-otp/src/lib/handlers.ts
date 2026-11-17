import type { AppConfig } from "./config";
import type { RateLimiter } from "./security/ratelimit";
import {
  ACCION_SOLICITAR,
  ACCION_VERIFICAR,
  requestOtp,
  verifyOtp,
} from "./security/otp-service";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSessionToken,
  readCookie,
  sessionCookie,
  verifySessionToken,
  type Session,
} from "./security/session";
import type { AuditFilters, AuditRow, Inspeccion, Resultado, Store } from "./store/types";

export interface AppDeps {
  store: Store;
  limiter: RateLimiter;
  config: AppConfig;
  now: () => Date;
  /** Entrega del OTP al usuario (correo/SMS). En la demo es un stub. */
  deliver: (email: string, code: string) => Promise<void>;
}

export interface RequestContext {
  ip: string;
  session: Session | null;
}

// ---------- utilidades ----------

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

/** En Vercel, x-forwarded-for lo fija la plataforma. Fuera de ella es falsificable: por eso también se limita por correo. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || headers.get("x-real-ip") || "desconocida").slice(0, 64);
}

export const normalizeEmail = (v: unknown) =>
  typeof v === "string" ? v.trim().toLowerCase().slice(0, 254) : "";
const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text();
    if (text.length > 4096) return null;
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function contextFromHeaders(deps: AppDeps, headers: Headers): RequestContext {
  const token = readCookie(headers.get("cookie"), SESSION_COOKIE);
  return {
    ip: clientIp(headers),
    session: verifySessionToken(token, deps.config.sessionSecret, deps.now()),
  };
}

// ---------- rate limiting (por IP y por correo) ----------

type Guard = { kind: "ok" } | { kind: "blocked"; retryAfterSec: number } | { kind: "unavailable" };

// @req RNF-05 RNF-06 RNF-11
async function guard(deps: AppDeps, accion: string, ip: string, email: string): Promise<Guard> {
  let byIp, byEmail;
  try {
    [byIp, byEmail] = await Promise.all([
      deps.limiter.limit(`${accion}:ip:${ip}`),
      deps.limiter.limit(`${accion}:email:${email || "-"}`),
    ]);
  } catch (err) {
    // Fail closed: si el limitador no responde, no se atiende el intento de autenticación.
    console.error("rate limiter no disponible", err);
    return { kind: "unavailable" };
  }
  if (byIp.success && byEmail.success) return { kind: "ok" };

  await deps.store.appendAudit({
    usuario: email || null,
    accion,
    recurso: "auth",
    ip,
    resultado: "bloqueado",
    detalle: {
      motivo: "rate_limit",
      por: [!byIp.success && "ip", !byEmail.success && "correo"].filter(Boolean),
    },
  });
  const retryAfterSec = Math.max(
    ...[byIp, byEmail].filter((r) => !r.success).map((r) => r.retryAfterSec),
  );
  return { kind: "blocked", retryAfterSec };
}

function guardResponse(g: Guard): Response | null {
  if (g.kind === "unavailable") return json(503, { error: "RATE_LIMITER_UNAVAILABLE" });
  if (g.kind === "blocked")
    return json(
      429,
      { error: "RATE_LIMITED", retry_after_sec: g.retryAfterSec },
      { "retry-after": String(g.retryAfterSec) },
    );
  return null;
}

// ---------- endpoints de autenticación ----------

// @req RF-01 RNF-08
export async function handleRequestOtp(deps: AppDeps, req: Request): Promise<Response> {
  const ip = clientIp(req.headers);
  const body = await readBody(req);
  const email = normalizeEmail(body?.email);

  const g = await guard(deps, ACCION_SOLICITAR, ip, email);
  const blocked = guardResponse(g);
  if (blocked) return blocked;

  if (!isValidEmail(email)) {
    await deps.store.appendAudit({
      usuario: email || null,
      accion: ACCION_SOLICITAR,
      recurso: "auth",
      ip,
      resultado: "fallo",
      detalle: { motivo: "correo_invalido" },
    });
    return json(400, { error: "INVALID_EMAIL" });
  }

  const { code } = await requestOtp(
    { store: deps.store, now: deps.now, pepper: deps.config.otpPepper },
    { email, ip },
  );
  if (code) await deps.deliver(email, code);

  // Respuesta idéntica exista o no el correo.
  return json(200, {
    ok: true,
    message: "Si el correo está registrado, enviamos un código de 6 dígitos válido por 5 minutos.",
    ...(deps.config.demoShowOtp && code ? { demo_otp: code } : {}),
  });
}

// @req RF-02 RNF-09
export async function handleVerifyOtp(deps: AppDeps, req: Request): Promise<Response> {
  const ip = clientIp(req.headers);
  const body = await readBody(req);
  const email = normalizeEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  const g = await guard(deps, ACCION_VERIFICAR, ip, email);
  const blocked = guardResponse(g);
  if (blocked) return blocked;

  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    await deps.store.appendAudit({
      usuario: email || null,
      accion: ACCION_VERIFICAR,
      recurso: "auth",
      ip,
      resultado: "fallo",
      detalle: { motivo: "formato_invalido" },
    });
    return json(400, { error: "INVALID_INPUT" });
  }

  const result = await verifyOtp(
    { store: deps.store, now: deps.now, pepper: deps.config.otpPepper },
    { email, code, ip },
  );
  if (!result.ok) {
    return json(result.status, { error: result.code });
  }

  const token = createSessionToken(result.user, deps.config.sessionSecret, deps.now(), deps.config.sessionTtlSec);
  return json(
    200,
    { ok: true, usuario: { email: result.user.email, nombre: result.user.nombre, rol: result.user.rol } },
    { "set-cookie": sessionCookie(token, deps.config.sessionTtlSec, deps.config.isProd) },
  );
}

// @req RF-05 RNF-06
export async function handleLogout(deps: AppDeps, req: Request): Promise<Response> {
  const ctx = contextFromHeaders(deps, req.headers);
  await deps.store.appendAudit({
    usuario: ctx.session?.sub ?? null,
    accion: "cerrar_sesion",
    recurso: "auth",
    ip: ctx.ip,
    resultado: ctx.session ? "exito" : "fallo",
    detalle: ctx.session ? undefined : { motivo: "sin_sesion" },
  });
  return json(200, { ok: true }, { "set-cookie": clearSessionCookie(deps.config.isProd) });
}

// ---------- consultas protegidas (las usan las API y las páginas) ----------

// @req RF-03 RNF-06
export async function queryInspecciones(
  deps: AppDeps,
  ctx: RequestContext,
  params: { q?: string; limit?: number },
): Promise<{ status: 200; rows: Inspeccion[] } | { status: 401 }> {
  if (!ctx.session) {
    await deps.store.appendAudit({
      usuario: null,
      accion: "consultar_inspecciones",
      recurso: "inspecciones",
      ip: ctx.ip,
      resultado: "fallo",
      detalle: { motivo: "no_autenticado" },
    });
    return { status: 401 };
  }
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const q = params.q?.trim().slice(0, 60) || undefined;
  const rows = await deps.store.listInspecciones({ q, limit });
  await deps.store.appendAudit({
    usuario: ctx.session.sub,
    accion: "consultar_inspecciones",
    recurso: "inspecciones",
    ip: ctx.ip,
    resultado: "exito",
    detalle: { filtro: q ?? null, filas: rows.length },
  });
  return { status: 200, rows };
}

const RESULTADOS: Resultado[] = ["exito", "fallo", "bloqueado"];

// @req RF-04 RNF-10 RNF-06
export async function queryAudit(
  deps: AppDeps,
  ctx: RequestContext,
  params: { usuario?: string; accion?: string; resultado?: string; limit?: number },
): Promise<{ status: 200; rows: AuditRow[] } | { status: 401 | 403 }> {
  const deny = async (status: 401 | 403, motivo: string) => {
    await deps.store.appendAudit({
      usuario: ctx.session?.sub ?? null,
      accion: "consultar_auditoria",
      recurso: "audit_log",
      ip: ctx.ip,
      resultado: "fallo",
      detalle: { motivo },
    });
    return { status } as const;
  };
  if (!ctx.session) return deny(401, "no_autenticado");
  if (ctx.session.rol !== "admin") return deny(403, "rol_insuficiente");

  const filters: AuditFilters = {
    usuario: params.usuario?.trim().toLowerCase() || undefined,
    accion: params.accion?.trim() || undefined,
    resultado: RESULTADOS.find((r) => r === params.resultado),
    limit: Math.min(Math.max(params.limit ?? 100, 1), 500),
  };
  const rows = await deps.store.listAudit(filters);
  await deps.store.appendAudit({
    usuario: ctx.session.sub,
    accion: "consultar_auditoria",
    recurso: "audit_log",
    ip: ctx.ip,
    resultado: "exito",
    detalle: { filtros: { ...filters, limit: undefined } },
  });
  return { status: 200, rows };
}

// @req RF-03
export async function handleInspecciones(deps: AppDeps, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const r = await queryInspecciones(deps, contextFromHeaders(deps, req.headers), {
    q: url.searchParams.get("q") ?? undefined,
    limit: Number(url.searchParams.get("limit")) || undefined,
  });
  return r.status === 200 ? json(200, { data: r.rows }) : json(401, { error: "UNAUTHENTICATED" });
}

// @req RF-04 RNF-10
export async function handleAudit(deps: AppDeps, req: Request): Promise<Response> {
  const p = new URL(req.url).searchParams;
  const r = await queryAudit(deps, contextFromHeaders(deps, req.headers), {
    usuario: p.get("usuario") ?? undefined,
    accion: p.get("accion") ?? undefined,
    resultado: p.get("resultado") ?? undefined,
    limit: Number(p.get("limit")) || undefined,
  });
  if (r.status === 200) return json(200, { data: r.rows });
  return json(r.status, { error: r.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" });
}
