import { NextRequest, NextResponse } from "next/server";
import { corsPreflightResponse, setCorsHeaders } from "@/lib/cors";

export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  const response = NextResponse.next();
  setCorsHeaders(req, response);
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
