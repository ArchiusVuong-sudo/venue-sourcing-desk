import { handle, readJson } from "@/lib/http";
import { createRequest, listRequests } from "@/lib/services/requests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = () => handle(listRequests);
export const POST = async (req: Request) => handle(async () => createRequest(await readJson(req)), 201);
