// Sin imports de Node: este módulo es seguro también para el runtime Edge.

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  retryAfterSec: number;
}

export interface RateLimiter {
  limit(key: string): Promise<RateLimitResult>;
}

/**
 * Limitador de ventana deslizante EN MEMORIA.
 *
 * Solo para pruebas y desarrollo local. En Vercel cada instancia serverless tiene
 * su propia memoria y se destruye y recrea sin aviso, así que el contador de una
 * instancia no lo ve la otra: un atacante que cae en instancias distintas recibe
 * un límite nuevo cada vez. Por eso en producción se usa Upstash Redis, que es un
 * estado compartido por todas las instancias.
 */
// @req RNF-05
export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async limit(key: string): Promise<RateLimitResult> {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((ts) => t - ts < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return {
        success: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil((recent[0] + this.windowMs - t) / 1000)),
      };
    }
    recent.push(t);
    this.hits.set(key, recent);
    return { success: true, remaining: this.max - recent.length, retryAfterSec: 0 };
  }
}

/** Limitador distribuido con Upstash Redis (plan gratuito). Requiere UPSTASH_REDIS_REST_URL y _TOKEN. */
// @req RNF-05
export async function createUpstashRateLimiter(
  max: number,
  windowSec: number,
): Promise<RateLimiter> {
  const { Ratelimit } = await import("@upstash/ratelimit");
  const { Redis } = await import("@upstash/redis");
  const rl = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
    prefix: "carlo:verificarlo",
  });
  return {
    async limit(key) {
      const r = await rl.limit(key);
      return {
        success: r.success,
        remaining: r.remaining,
        retryAfterSec: r.success ? 0 : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)),
      };
    },
  };
}
