import { randomBytes } from "node:crypto";

export interface AppConfig {
  isProd: boolean;
  /** Secreto del servidor para el HMAC de los OTP (nunca se guarda el OTP en claro). */
  otpPepper: string;
  /** Secreto para firmar la cookie de sesión. */
  sessionSecret: string;
  /** Solo para la demo: devuelve el OTP en la respuesta porque no hay proveedor de correo. */
  demoShowOtp: boolean;
  rateLimit: { max: number; windowSec: number };
  sessionTtlSec: number;
}

const devSecrets: Record<string, string> = {};

function secret(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (value && value.length >= 32) return value;
  if (env.NODE_ENV === "production") {
    throw new Error(`${key} es obligatoria en producción (mínimo 32 caracteres).`);
  }
  // En desarrollo y pruebas se genera un secreto efímero por proceso.
  return (devSecrets[key] ??= randomBytes(32).toString("hex"));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    isProd: env.NODE_ENV === "production",
    otpPepper: secret(env, "OTP_PEPPER"),
    sessionSecret: secret(env, "SESSION_SECRET"),
    demoShowOtp: env.DEMO_SHOW_OTP === "true",
    rateLimit: { max: 5, windowSec: 60 }, // 5 intentos por minuto, por IP y por correo
    sessionTtlSec: 30 * 60,
  };
}
