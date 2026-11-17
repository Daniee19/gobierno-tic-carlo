import type {
  AuditEvent,
  AuditFilters,
  AuditRow,
  Challenge,
  Inspeccion,
  Resultado,
  Store,
  Usuario,
} from "./types";

interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

const toChallenge = (r: any): Challenge => ({
  id: r.id,
  email: r.email,
  salt: r.salt,
  codeHash: r.code_hash,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  attempts: r.attempts,
  consumedAt: r.consumed_at,
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** PostgreSQL (Supabase o Docker). Todas las consultas están parametrizadas. */
export async function createPgStore(connectionString: string): Promise<Store> {
  const pg: any = await import("pg");
  const Pool = pg.Pool ?? pg.default.Pool;
  const pool = new Pool({
    connectionString,
    max: 5,
    // Supabase exige SSL. Defina PGSSL=require para activarlo.
    ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined,
  });
  const db: Queryable = pool;

  return {
    async findUser(email): Promise<Usuario | null> {
      const { rows } = await db.query(
        "select email, nombre, rol from usuarios where email = $1 and activo",
        [email],
      );
      return rows[0] ?? null;
    },

    async createChallenge({ email, salt, codeHash, expiresAt }) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(
          "update otp_challenges set consumed_at = now() where email = $1 and consumed_at is null",
          [email],
        );
        const { rows } = await client.query(
          `insert into otp_challenges (email, salt, code_hash, expires_at)
           values ($1, $2, $3, $4) returning *`,
          [email, salt, codeHash, expiresAt],
        );
        await client.query("commit");
        return toChallenge(rows[0]);
      } catch (e) {
        await client.query("rollback");
        throw e;
      } finally {
        client.release();
      }
    },

    async getLatestChallenge(email) {
      const { rows } = await db.query(
        `select * from otp_challenges
         where email = $1 and consumed_at is null
         order by created_at desc limit 1`,
        [email],
      );
      return rows[0] ? toChallenge(rows[0]) : null;
    },

    // El UPDATE condicional hace atómico el conteo: dos peticiones simultáneas
    // no pueden superar el máximo de intentos.
    // @req RNF-04
    async registerAttempt(id, max) {
      const { rows } = await db.query(
        `update otp_challenges set attempts = attempts + 1
         where id = $1 and consumed_at is null and attempts < $2
         returning attempts`,
        [id, max],
      );
      return rows[0]?.attempts ?? null;
    },

    // @req RNF-03
    async consumeChallenge(id) {
      const { rowCount } = await db.query(
        "update otp_challenges set consumed_at = now() where id = $1 and consumed_at is null",
        [id],
      );
      return rowCount === 1;
    },

    async listInspecciones({ q, limit }): Promise<Inspeccion[]> {
      const like = q ? `%${escapeLike(q)}%` : null;
      const { rows } = await db.query(
        `select id_inspeccion, fecha::text as fecha, nombre_cliente, placa, marca, modelo,
                resultado, link_informe
         from inspecciones
         where $1::text is null or placa ilike $1 or nombre_cliente ilike $1
         order by id_inspeccion
         limit $2`,
        [like, limit],
      );
      return rows;
    },

    // @req RNF-06 RNF-07
    async appendAudit(e: AuditEvent) {
      await db.query(
        `insert into audit_log (usuario, accion, recurso, ip, resultado, detalle)
         values ($1, $2, $3, $4, $5, $6)`,
        [e.usuario, e.accion, e.recurso, e.ip, e.resultado, e.detalle ?? null],
      );
    },

    async listAudit(f: AuditFilters): Promise<AuditRow[]> {
      const where: string[] = [];
      const params: unknown[] = [];
      if (f.usuario) {
        params.push(f.usuario);
        where.push(`usuario = $${params.length}`);
      }
      if (f.accion) {
        params.push(f.accion);
        where.push(`accion = $${params.length}`);
      }
      if (f.resultado) {
        params.push(f.resultado);
        where.push(`resultado = $${params.length}`);
      }
      params.push(f.limit);
      const { rows } = await db.query(
        `select id, ts, usuario, accion, recurso, ip, resultado, detalle
         from audit_log
         ${where.length ? "where " + where.join(" and ") : ""}
         order by id desc
         limit $${params.length}`,
        params,
      );
      return rows.map((r) => ({
        id: Number(r.id),
        ts: r.ts,
        usuario: r.usuario,
        accion: r.accion,
        recurso: r.recurso,
        ip: r.ip,
        resultado: r.resultado as Resultado,
        detalle: r.detalle ?? undefined,
      }));
    },
  };
}
