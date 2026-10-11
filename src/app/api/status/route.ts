import { agentModel, resolveMode } from "@/lib/agent/provider";
import { handle } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = () => handle(async () => ({ ...resolveMode(), model: agentModel() }));
