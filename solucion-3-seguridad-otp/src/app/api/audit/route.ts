import { getDeps } from "../../../lib/container";
import { handleAudit } from "../../../lib/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// @req RF-04 RNF-10
export async function GET(req: Request) {
  return handleAudit(await getDeps(), req);
}
