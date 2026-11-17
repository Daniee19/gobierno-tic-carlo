import { getDeps } from "../../../../lib/container";
import { handleLogout } from "../../../../lib/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// @req RF-05
export async function POST(req: Request) {
  return handleLogout(await getDeps(), req);
}
