import { NextRequest, NextResponse } from "next/server";

export const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://zcltsdev.com",
  "https://zc-lt.com",
  "https://zcportal.zc-lt.com",
  "https://portal.zewailcity.edu.eg",

] as const;

const ALLOWED_REQUEST_HEADERS = "Content-Type, Authorization";

export function isAllowedOrigin(origin: string | null): origin is string {
  return origin !== null && (ALLOWED_ORIGINS as readonly string[]).includes(origin);
}

export function applyCorsHeaders(
  req: NextRequest,
  response: NextResponse
): NextResponse {
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) return response;

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", ALLOWED_REQUEST_HEADERS);
  response.headers.set("Vary", "Origin");
  return response;
}

export function corsPreflightResponse(req: NextRequest): NextResponse {
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return new NextResponse(null, { status: 403 });
  }

  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", ALLOWED_REQUEST_HEADERS);
  response.headers.set("Access-Control-Max-Age", "86400");
  response.headers.set("Vary", "Origin");
  return response;
}
