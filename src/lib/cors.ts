import { NextRequest, NextResponse } from "next/server";

const DEFAULT_REQUEST_HEADERS = "Content-Type, Authorization";

function resolveAllowedHeaders(req: NextRequest): string {
  return req.headers.get("Access-Control-Request-Headers") ?? DEFAULT_REQUEST_HEADERS;
}

function setCorsHeaders(req: NextRequest, response: NextResponse): void {
  const origin = req.headers.get("origin");
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  } else {
    response.headers.set("Access-Control-Allow-Origin", "*");
  }
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", resolveAllowedHeaders(req));
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
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}
