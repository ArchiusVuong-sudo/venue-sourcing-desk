import { handle } from "@/lib/http";
import { getRun } from "@/lib/services/requests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async (_req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => getRun((await params).id));
