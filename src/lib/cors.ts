import { NextRequest, NextResponse } from "next/server";

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD";

export function setCorsHeaders(_req: NextRequest, response: NextResponse): void {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  response.headers.set("Access-Control-Allow-Headers", "*");
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
