import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000; // expira a los 5 minutos
export const OTP_MAX_ATTEMPTS = 3; // máximo 3 intentos por código

/**
 * Genera el OTP con el CSPRNG del sistema operativo.
 * crypto.randomInt() elige de forma uniforme (sin sesgo de módulo),
 * a diferencia de Math.random(), que es predecible.
 */
// @req RNF-01
export function generateOtp(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Hash del OTP: HMAC-SHA256 con sal por código y un secreto del servidor (pepper).
 * Un OTP de 6 dígitos solo tiene 1 000 000 de combinaciones, así que un SHA-256
 * simple se rompería por fuerza bruta en milisegundos si se filtra la base de datos;
 * el pepper vive fuera de la base, por lo que el hash filtrado no sirve por sí solo.
 */
// @req RNF-02
export function hashOtp(code: string, email: string, salt: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`${salt}:${email}:${code}`).digest("hex");
}

/** Comparación en tiempo constante. */
export function verifyOtpHash(
  code: string,
  email: string,
  salt: string,
  pepper: string,
  expectedHex: string,
): boolean {
  const actual = Buffer.from(hashOtp(code, email, salt, pepper), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
