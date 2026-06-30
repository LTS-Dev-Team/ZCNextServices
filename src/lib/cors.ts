import { NextRequest, NextResponse } from "next/server";

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD";

const DEFAULT_REQUEST_HEADERS =
  "Content-Type, Authorization, Accept, Origin, X-Requested-With, X-CSRF-Token";

function resolveAllowedHeaders(req: NextRequest): string {
  return req.headers.get("Access-Control-Request-Headers") ?? DEFAULT_REQUEST_HEADERS;
}

export function setCorsHeaders(req: NextRequest, response: NextResponse): void {
  const origin = req.headers.get("origin");

  // Reflect any requesting origin so all apps (web, mobile, local dev) are allowed.
  response.headers.set("Access-Control-Allow-Origin", origin ?? "*");
  if (origin) {
    response.headers.set("Vary", "Origin");
  }

  response.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  response.headers.set("Access-Control-Allow-Headers", resolveAllowedHeaders(req));
  response.headers.set("Access-Control-Max-Age", "86400");
}

export function applyCorsHeaders(
  req: NextRequest,
  response: NextResponse
): NextResponse {
  setCorsHeaders(req, response);
  return response;
}

export function corsPreflightResponse(req: NextRequest): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  setCorsHeaders(req, response);
  return response;
}
