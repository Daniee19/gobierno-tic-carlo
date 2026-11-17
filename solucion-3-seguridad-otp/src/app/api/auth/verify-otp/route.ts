import { getDeps } from "../../../../lib/container";
import { handleVerifyOtp } from "../../../../lib/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// @req RF-02
export async function POST(req: Request) {
  return handleVerifyOtp(await getDeps(), req);
}
