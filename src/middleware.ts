import { NextRequest, NextResponse } from "next/server";
import { applyCorsHeaders, corsPreflightResponse } from "@/lib/cors";

export function middleware(req: NextRequest) {
  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  return applyCorsHeaders(req, NextResponse.next());
}

export const config = {
  matcher: "/api/:path*",
};
