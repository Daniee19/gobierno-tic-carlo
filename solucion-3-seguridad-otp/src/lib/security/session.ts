import { createHmac, timingSafeEqual } from "node:crypto";
import type { Rol } from "../store/types";

export const SESSION_COOKIE = "vd_session";

export interface Session {
  sub: string; // correo
  rol: Rol;
  exp: number; // epoch en segundos
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

// @req RNF-09
export function createSessionToken(
  user: { email: string; rol: Rol },
  secret: string,
  now: Date,
  ttlSec: number,
): string {
  const payload = b64(
    JSON.stringify({ sub: user.email, rol: user.rol, exp: Math.floor(now.getTime() / 1000) + ttlSec }),
  );
  return `${payload}.${sign(payload, secret)}`;
}

// @req RNF-09
export function verifySessionToken(token: string | undefined, secret: string, now: Date): Session | null {
  if (!token) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (typeof s.sub !== "string" || typeof s.exp !== "number") return null;
    if (s.exp <= Math.floor(now.getTime() / 1000)) return null;
    return s;
  } catch {
    return null;
  }
}

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

export function sessionCookie(token: string, maxAgeSec: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  return sessionCookie("", 0, secure);
}
