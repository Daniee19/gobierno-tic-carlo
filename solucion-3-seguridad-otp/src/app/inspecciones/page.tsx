import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDeps } from "../../lib/container";
import { contextFromHeaders, queryInspecciones } from "../../lib/handlers";

export const dynamic = "force-dynamic";

// @req RF-03
export default async function InspeccionesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const deps = await getDeps();
  const ctx = contextFromHeaders(deps, await headers());
  const result = await queryInspecciones(deps, ctx, { q, limit: 50 });
  if (result.status === 401) redirect("/login");

  return (
    <div className="card">
      <h1>Inspecciones</h1>
      <form method="get" className="filters" style={{ gridTemplateColumns: "1fr auto" }}>
        <div>
          <label htmlFor="q">Buscar por placa o cliente</label>
          <input id="q" name="q" defaultValue={q ?? ""} />
        </div>
        <button>Buscar</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Fecha</th><th>Cliente</th><th>Placa</th><th>Vehículo</th><th>Resultado</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((i) => (
            <tr key={i.id_inspeccion}>
              <td>{i.id_inspeccion}</td>
              <td>{i.fecha}</td>
              <td>{i.nombre_cliente}</td>
              <td>{i.placa}</td>
              <td>{i.marca} {i.modelo}</td>
              <td>{i.resultado}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="msg" style={{ color: "var(--muted)" }}>
        Prototipo con datos simulados. En producción, las fuentes serían Verificarlo (PostgreSQL) y HubSpot.
      </p>
    </div>
  );
}
