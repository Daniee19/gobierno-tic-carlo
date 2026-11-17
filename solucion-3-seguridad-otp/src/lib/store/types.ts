export type Resultado = "exito" | "fallo" | "bloqueado";
export type Rol = "admin" | "asesor";

export interface Usuario {
  email: string;
  nombre: string;
  rol: Rol;
}

export interface AuditEvent {
  usuario: string | null;
  accion: string;
  recurso: string | null;
  ip: string | null;
  resultado: Resultado;
  detalle?: Record<string, unknown>;
}

export interface AuditRow extends AuditEvent {
  id: number;
  ts: Date;
}

export interface AuditFilters {
  usuario?: string;
  accion?: string;
  resultado?: Resultado;
  limit: number;
}

export interface Challenge {
  id: string;
  email: string;
  salt: string;
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
}

export interface Inspeccion {
  id_inspeccion: number;
  fecha: string;
  nombre_cliente: string;
  placa: string;
  marca: string;
  modelo: string;
  resultado: string;
  link_informe: string;
}

/**
 * Contrato de persistencia. La auditoría solo expone appendAudit y listAudit:
 * no existe ninguna operación para modificar ni borrar eventos (solo inserción).
 */
export interface Store {
  findUser(email: string): Promise<Usuario | null>;

  /** Crea un desafío OTP e invalida los anteriores pendientes del mismo correo. */
  createChallenge(c: {
    email: string;
    salt: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<Challenge>;
  /** Último desafío no consumido del correo. */
  getLatestChallenge(email: string): Promise<Challenge | null>;
  /** Suma un intento de forma atómica. Devuelve null si ya se alcanzó el máximo. */
  registerAttempt(id: string, max: number): Promise<number | null>;
  /** Marca el desafío como usado (un solo uso). Devuelve false si ya estaba consumido. */
  consumeChallenge(id: string): Promise<boolean>;

  listInspecciones(opts: { q?: string; limit: number }): Promise<Inspeccion[]>;

  appendAudit(event: AuditEvent): Promise<void>;
  listAudit(filters: AuditFilters): Promise<AuditRow[]>;
}
