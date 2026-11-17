import type { Store, Usuario } from "../store/types";
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  generateOtp,
  generateSalt,
  hashOtp,
  verifyOtpHash,
} from "./otp";

export interface OtpDeps {
  store: Store;
  now: () => Date;
  pepper: string;
}

export const ACCION_SOLICITAR = "solicitar_otp";
export const ACCION_VERIFICAR = "verificar_otp";

/**
 * Emite un OTP para un correo registrado. Cada llamada deja exactamente un evento en audit_log.
 * Si el correo no existe no se crea nada, pero el llamador responde igual (anti-enumeración).
 */
// @req RF-01 RNF-06
export async function requestOtp(
  deps: OtpDeps,
  input: { email: string; ip: string },
): Promise<{ code: string | null }> {
  const { store, now, pepper } = deps;
  const user = await store.findUser(input.email);

  if (!user) {
    await store.appendAudit({
      usuario: input.email,
      accion: ACCION_SOLICITAR,
      recurso: "auth",
      ip: input.ip,
      resultado: "fallo",
      detalle: { motivo: "correo_no_registrado" },
    });
    return { code: null };
  }

  const code = generateOtp();
  const salt = generateSalt();
  await store.createChallenge({
    email: input.email,
    salt,
    codeHash: hashOtp(code, input.email, salt, pepper),
    expiresAt: new Date(now().getTime() + OTP_TTL_MS),
  });
  await store.appendAudit({
    usuario: input.email,
    accion: ACCION_SOLICITAR,
    recurso: "auth",
    ip: input.ip,
    resultado: "exito",
  });
  return { code };
}

export type VerifyResult =
  | { ok: true; user: Usuario }
  | { ok: false; status: 401; code: "INVALID_OR_EXPIRED" }
  | { ok: false; status: 429; code: "ATTEMPTS_EXCEEDED" };

/**
 * Verifica un OTP. Cada llamada deja exactamente un evento en audit_log.
 * El cliente recibe siempre el mismo error genérico; el motivo real queda solo en la auditoría.
 */
// @req RF-02 RNF-03 RNF-04 RNF-06 RNF-08 RNF-11
export async function verifyOtp(
  deps: OtpDeps,
  input: { email: string; code: string; ip: string },
): Promise<VerifyResult> {
  const { store, now, pepper } = deps;
  const base = { usuario: input.email, accion: ACCION_VERIFICAR, recurso: "auth", ip: input.ip };
  const invalid = async (motivo: string, extra: Record<string, unknown> = {}): Promise<VerifyResult> => {
    await store.appendAudit({ ...base, resultado: "fallo", detalle: { motivo, ...extra } });
    return { ok: false, status: 401, code: "INVALID_OR_EXPIRED" };
  };

  const challenge = await store.getLatestChallenge(input.email);
  if (!challenge) return invalid("sin_otp_activo");

  if (challenge.expiresAt.getTime() <= now().getTime()) {
    await store.consumeChallenge(challenge.id);
    return invalid("otp_expirado");
  }

  // Se cuenta el intento ANTES de comparar: así un atacante no obtiene un intento "gratis".
  const attempt = await store.registerAttempt(challenge.id, OTP_MAX_ATTEMPTS);
  if (attempt === null) {
    await store.appendAudit({
      ...base,
      resultado: "bloqueado",
      detalle: { motivo: "max_intentos_otp", max: OTP_MAX_ATTEMPTS },
    });
    return { ok: false, status: 429, code: "ATTEMPTS_EXCEEDED" };
  }

  const matches = verifyOtpHash(input.code, input.email, challenge.salt, pepper, challenge.codeHash);
  if (!matches) return invalid("otp_incorrecto", { intento: attempt });

  // Un solo uso: si dos peticiones llegan a la vez con el código correcto, solo una lo consume.
  const consumed = await store.consumeChallenge(challenge.id);
  if (!consumed) return invalid("otp_ya_usado");

  const user = await store.findUser(input.email);
  if (!user) return invalid("usuario_inactivo");

  await store.appendAudit({ ...base, resultado: "exito", detalle: { intento: attempt } });
  return { ok: true, user };
}
