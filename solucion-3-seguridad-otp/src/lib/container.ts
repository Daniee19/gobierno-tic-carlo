import { existsSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "./config";
import type { AppDeps } from "./handlers";
import { MemoryRateLimiter, createUpstashRateLimiter, type RateLimiter } from "./security/ratelimit";
import { MemoryStore, loadInspeccionesCsv } from "./store/memory-store";
import { createPgStore } from "./store/pg-store";
import type { Store } from "./store/types";

const g = globalThis as unknown as { __verificarloDeps?: Promise<AppDeps> };

/** Stub de entrega. [SUPUESTO] En producción se reemplaza por un proveedor de correo (Resend, SES, etc.). */
async function deliver(email: string, code: string) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[DEMO] OTP para ${email}: ${code}`);
  }
}

async function build(): Promise<AppDeps> {
  const config = loadConfig();

  let store: Store;
  if (process.env.DATABASE_URL) {
    store = await createPgStore(process.env.DATABASE_URL);
  } else if (config.isProd) {
    throw new Error("DATABASE_URL es obligatoria en producción.");
  } else {
    console.warn("[DEV] Sin DATABASE_URL: usando almacén en memoria (los datos se pierden al reiniciar).");
    // Dataset común del equipo: ../data (carpeta dentro del repositorio) o ./data (copia local).
    const candidates = [
      path.join(process.cwd(), "..", "data", "inspecciones.csv"),
      path.join(process.cwd(), "data", "inspecciones.csv"),
    ];
    const csv = candidates.find((p) => existsSync(p)) ?? candidates[0];
    store = new MemoryStore(undefined, loadInspeccionesCsv(csv));
  }

  let limiter: RateLimiter;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    limiter = await createUpstashRateLimiter(config.rateLimit.max, config.rateLimit.windowSec);
  } else if (config.isProd) {
    throw new Error("UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN son obligatorias en producción.");
  } else {
    console.warn("[DEV] Sin Upstash: usando limitador en memoria (no sirve en serverless).");
    limiter = new MemoryRateLimiter(config.rateLimit.max, config.rateLimit.windowSec * 1000);
  }

  return { store, limiter, config, now: () => new Date(), deliver };
}

export function getDeps(): Promise<AppDeps> {
  return (g.__verificarloDeps ??= build());
}
