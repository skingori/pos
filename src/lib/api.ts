import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function parseBody<T>(schema: ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

export function zodErrorResponse(e: unknown) {
  if (e instanceof ZodError) {
    const msg = e.issues.map((i) => i.message).join("; ") || "Validation failed";
    return jsonError(msg, 400);
  }
  if (e instanceof Error) return jsonError(e.message, 400);
  return jsonError("Unexpected error", 500);
}
