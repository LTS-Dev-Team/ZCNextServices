/**
 * app/api/login/route.ts
 * POST /api/login
 *
 * Body: { username, password }
 * Returns: { success, message, data?: { username, displayName, email } }
 */

import { NextRequest, NextResponse } from "next/server";
import { applyCorsHeaders, corsPreflightResponse } from "@/lib/cors";
import { authenticateADUser } from "@/lib/ldap";

export async function OPTIONS(req: NextRequest) {
  return corsPreflightResponse(req);
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_RPM || "5", 10);

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }

  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (isRateLimited(ip)) {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { success: false, message: "Rate limit exceeded. Wait a minute and try again." },
        { status: 429 }
      )
    );
  }

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return applyCorsHeaders(
      req,
      NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 })
    );
  }

  const username = body.username?.trim();
  const password = body.password ?? "";

  if (!username || !password) {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { success: false, message: "Username and password are required" },
        { status: 400 }
      )
    );
  }

  const result = await authenticateADUser(username, password);
  if (!result.success || !result.user) {
    return applyCorsHeaders(
      req,
      NextResponse.json({ success: false, message: result.message }, { status: 401 })
    );
  }
  console.log("result", result);
  return applyCorsHeaders(
    req,
    NextResponse.json({
      success: true,
      message: result.message,
      user: result.user,
    })
  );
}
