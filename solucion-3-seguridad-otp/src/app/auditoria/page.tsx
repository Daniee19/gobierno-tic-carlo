import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDeps } from "../../lib/container";
import { contextFromHeaders, queryAudit } from "../../lib/handlers";

export const dynamic = "force-dynamic";

type Params = { usuario?: string; accion?: string; resultado?: string };

// @req RF-04 RNF-10
export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const deps = await getDeps();
  const ctx = contextFromHeaders(deps, await headers());
  const result = await queryAudit(deps, ctx, { ...params, limit: 200 });

  if (result.status === 401) redirect("/login");
  if (result.status === 403) {
    return (
      <div className="card">
        <h1>Auditoría</h1>
        <p className="msg error">Solo el rol admin puede ver el registro de auditoría. Este intento quedó registrado.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Registro de auditoría</h1>
      <form method="get" className="filters">
        <div>
          <label htmlFor="usuario">Usuario (correo)</label>
          <input id="usuario" name="usuario" defaultValue={params.usuario ?? ""} />
        </div>
        <div>
          <label htmlFor="accion">Acción</label>
          <select id="accion" name="accion" defaultValue={params.accion ?? ""}>
            <option value="">Todas</option>
            <option value="solicitar_otp">solicitar_otp</option>
            <option value="verificar_otp">verificar_otp</option>
            <option value="cerrar_sesion">cerrar_sesion</option>
            <option value="consultar_inspecciones">consultar_inspecciones</option>
            <option value="consultar_auditoria">consultar_auditoria</option>
          </select>
        </div>
        <div>
          <label htmlFor="resultado">Resultado</label>
          <select id="resultado" name="resultado" defaultValue={params.resultado ?? ""}>
            <option value="">Todos</option>
            <option value="exito">exito</option>
            <option value="fallo">fallo</option>
            <option value="bloqueado">bloqueado</option>
          </select>
        </div>
        <div />
        <button>Filtrar</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Fecha (UTC)</th><th>Usuario</th><th>Acción</th><th>Recurso</th><th>IP</th><th>Resultado</th><th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{new Date(r.ts).toISOString().replace("T", " ").slice(0, 19)}</td>
              <td>{r.usuario ?? "-"}</td>
              <td>{r.accion}</td>
              <td>{r.recurso ?? "-"}</td>
              <td>{r.ip ?? "-"}</td>
              <td><span className={`tag ${r.resultado}`}>{r.resultado}</span></td>
              <td><code>{r.detalle ? JSON.stringify(r.detalle) : ""}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
