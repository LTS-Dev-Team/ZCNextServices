/**
 * app/api/change-password/route.ts
 * POST /api/change-password
 *
 * Body: { username, oldPassword, newPassword, confirmPassword }
 * Returns: { success: boolean, message: string }
 *
 * Everything here is SERVER SIDE — LDAP credentials never reach the browser.
 */

import { NextRequest, NextResponse } from "next/server";
import { applyCorsHeaders, corsPreflightResponse } from "@/lib/cors";
import { changeADPassword } from "@/lib/ldap";

export async function OPTIONS(req: NextRequest) {
  return corsPreflightResponse(req);
}

// Simple in-memory rate limiter (per IP, resets on server restart)
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
  // ── Rate limiting ──────────────────────────────────────────────────────────
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

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { success: false, message: "Invalid request" },
        { status: 400 }
      )
    );
  }

  const { username, oldPassword, newPassword, confirmPassword } = body;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!username || !oldPassword || !newPassword || !confirmPassword) {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { success: false, message: "All fields are required" },
        { status: 400 }
      )
    );
  }

  if (newPassword !== confirmPassword) {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { success: false, message: "New password and confirmation do not match" },
        { status: 400 }
      )
    );
  }

  if (newPassword.length < 8) {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { success: false, message: "New password must be at least 8 characters" },
        { status: 400 }
      )
    );
  }

  if (newPassword === oldPassword) {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { success: false, message: "New password must be different from the current one" },
        { status: 400 }
      )
    );
  }

  // ── Change password via LDAP ──────────────────────────────────────────────
  const result = await changeADPassword(username, oldPassword, newPassword);
  return applyCorsHeaders(
    req,
    NextResponse.json(result, {
      status: result.success ? 200 : 400,
    })
  );
}
