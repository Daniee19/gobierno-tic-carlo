import { getDeps } from "../../../../lib/container";
import { handleRequestOtp } from "../../../../lib/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// @req RF-01
export async function POST(req: Request) {
  return handleRequestOtp(await getDeps(), req);
}
