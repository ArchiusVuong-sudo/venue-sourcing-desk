import { handle } from "@/lib/http";
import { getRequest } from "@/lib/services/requests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async (_req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => getRequest((await params).id));
