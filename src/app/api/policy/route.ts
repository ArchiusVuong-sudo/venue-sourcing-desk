import { handle, readJson } from "@/lib/http";
import { getPolicy, updatePolicy } from "@/lib/services/policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = () => handle(getPolicy);
export const PUT = async (req: Request) => handle(async () => updatePolicy(await readJson(req)));
