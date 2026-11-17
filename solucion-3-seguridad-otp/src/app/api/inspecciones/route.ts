import { getDeps } from "../../../lib/container";
import { handleInspecciones } from "../../../lib/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// @req RF-03
export async function GET(req: Request) {
  return handleInspecciones(await getDeps(), req);
}
