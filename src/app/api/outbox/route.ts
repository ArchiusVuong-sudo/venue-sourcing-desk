import { handle } from "@/lib/http";
import { listOutbox } from "@/lib/services/review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = () => handle(listOutbox);
