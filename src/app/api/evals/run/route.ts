import { handle } from "@/lib/http";
import { startSuite } from "@/lib/services/evals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = () => handle(startSuite, 202);
