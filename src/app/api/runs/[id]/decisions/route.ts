import { handle, readJson } from "@/lib/http";
import { decide } from "@/lib/services/review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = async (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  handle(async () => decide((await params).id, await readJson(req)), 201);
