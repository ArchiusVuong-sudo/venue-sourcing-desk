import { handle } from "@/lib/http";
import { getEvalsView } from "@/lib/services/evals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = () => handle(getEvalsView);
