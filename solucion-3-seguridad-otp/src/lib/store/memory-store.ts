import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type {
  AuditEvent,
  AuditFilters,
  AuditRow,
  Challenge,
  Inspeccion,
  Store,
  Usuario,
} from "./types";

export const DEMO_USERS: Usuario[] = [
  { email: "admin@carlo.demo", nombre: "Admin Demo", rol: "admin" },
  { email: "asesor1@carlo.demo", nombre: "Asesor Uno", rol: "asesor" },
  { email: "asesor2@carlo.demo", nombre: "Asesor Dos", rol: "asesor" },
];

/** Lector CSV mínimo (soporta comillas). Suficiente para inspecciones.csv. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function loadInspeccionesCsv(path: string): Inspeccion[] {
  if (!existsSync(path)) return [];
  const [header, ...rows] = parseCsv(readFileSync(path, "utf8"));
  const idx = (name: string) => header.indexOf(name);
  return rows.map((r) => ({
    id_inspeccion: Number(r[idx("id_inspeccion")]),
    fecha: r[idx("fecha")],
    nombre_cliente: r[idx("nombre_cliente")],
    placa: r[idx("placa")],
    marca: r[idx("marca")],
    modelo: r[idx("modelo")],
    resultado: r[idx("resultado")],
    link_informe: r[idx("link_informe")],
  }));
}

/**
 * Almacén en memoria: pruebas y desarrollo sin base de datos.
 * No se usa en producción (container.ts lo impide).
 */
export class MemoryStore implements Store {
  private challenges: Challenge[] = [];
  private audit: AuditRow[] = [];
  private auditSeq = 0;

  constructor(
    private readonly users: Usuario[] = DEMO_USERS,
    private readonly inspecciones: Inspeccion[] = [],
    private readonly now: () => Date = () => new Date(),
  ) {}

  async findUser(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }

  async createChallenge(c: { email: string; salt: string; codeHash: string; expiresAt: Date }) {
    for (const old of this.challenges) {
      if (old.email === c.email && !old.consumedAt) old.consumedAt = this.now();
    }
    const challenge: Challenge = {
      id: randomUUID(),
      email: c.email,
      salt: c.salt,
      codeHash: c.codeHash,
      createdAt: this.now(),
      expiresAt: c.expiresAt,
      attempts: 0,
      consumedAt: null,
    };
    this.challenges.push(challenge);
    return { ...challenge };
  }

  async getLatestChallenge(email: string) {
    const pending = this.challenges.filter((c) => c.email === email && !c.consumedAt);
    const last = pending[pending.length - 1];
    return last ? { ...last } : null;
  }

  // @req RNF-04
  async registerAttempt(id: string, max: number) {
    const c = this.challenges.find((x) => x.id === id);
    if (!c || c.consumedAt || c.attempts >= max) return null;
    c.attempts += 1;
    return c.attempts;
  }

  // @req RNF-03
  async consumeChallenge(id: string) {
    const c = this.challenges.find((x) => x.id === id);
    if (!c || c.consumedAt) return false;
    c.consumedAt = this.now();
    return true;
  }

  async listInspecciones({ q, limit }: { q?: string; limit: number }) {
    const needle = q?.toLowerCase();
    return this.inspecciones
      .filter(
        (i) =>
          !needle ||
          i.placa.toLowerCase().includes(needle) ||
          i.nombre_cliente.toLowerCase().includes(needle),
      )
      .slice(0, limit);
  }

  // @req RNF-06 RNF-07
  async appendAudit(event: AuditEvent) {
    this.audit.push({ ...event, id: ++this.auditSeq, ts: this.now() });
  }

  async listAudit(f: AuditFilters) {
    return this.audit
      .filter(
        (r) =>
          (!f.usuario || r.usuario === f.usuario) &&
          (!f.accion || r.accion === f.accion) &&
          (!f.resultado || r.resultado === f.resultado),
      )
      .slice()
      .reverse()
      .slice(0, f.limit);
  }
}
