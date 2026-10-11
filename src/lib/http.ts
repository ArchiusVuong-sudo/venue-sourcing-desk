import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConflictError, NotFoundError } from "./services/requests";

/** Maps domain errors to HTTP: invalid input 400, missing 404, wrong state 409, anything else 500. */
export async function handle<T>(fn: () => Promise<T>, status = 200): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn(), { status });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues.map((i) => i.message).join("; "), issues: err.issues }, { status: 400 });
    }
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ConflictError) return NextResponse.json({ error: err.message }, { status: 409 });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong on the server" }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
