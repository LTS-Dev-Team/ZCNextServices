/**
 * app/api/reset-password/route.ts
 * POST /api/reset-password
 *
 * Authorization: Bearer <JWT>
 * Body: none
 *
 * JWT payload:
 * { UserId, Username, UserEmail, StudentId?, Role, exp }
 *
 * AD username = StudentId if present, otherwise email local-part before @.
 * Email is sent to UserEmail from the token.
 */

import { NextRequest, NextResponse } from "next/server";
import { applyCorsHeaders, corsPreflightResponse } from "@/lib/cors";
import { generateSecurePassword } from "@/lib/generate-password";
import { resetADPassword } from "@/lib/ldap";
import { isMailConfigured, sendResetPasswordEmail } from "@/lib/mail";
import {
  extractBearerToken,
  ResetTokenError,
  verifyResetToken,
} from "@/lib/reset-token";

export async function OPTIONS(req: NextRequest) {
  return corsPreflightResponse(req);
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = parseInt(process.env.RESET_RATE_LIMIT_RPM || "3", 10);

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

  if (!isMailConfigured()) {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { success: false, message: "Password reset email is not configured on the server." },
        { status: 503 }
      )
    );
  }

  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) {
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { success: false, message: "Missing Authorization Bearer token" },
        { status: 401 }
      )
    );
  }
  let identity;
  try {
    identity = await verifyResetToken(token);
  } catch (err) {
    const message =
      err instanceof ResetTokenError ? err.message : "Invalid or expired reset token";
    return applyCorsHeaders(
      req,
      NextResponse.json({ success: false, message }, { status: 401 })
    );
  }

  const newPassword = generateSecurePassword();
  const result = await resetADPassword(identity.adUsername, newPassword);
  if (!result.success) {
    return applyCorsHeaders(
      req,
      NextResponse.json({ success: false, message: result.message }, { status: 400 })
    );
  }

  try {
    await sendResetPasswordEmail({
      to: result.user?.email || "",
      displayName: result.user?.displayName || "",
      username: result.user?.username || "",
      newPassword,
    });
  } catch (err) {
    console.error("Failed to send reset password email:", err);
    return applyCorsHeaders(
      req,
      NextResponse.json(
        { success: false, message: "Password was reset but the email could not be sent. Contact IT support." },
        { status: 500 }
      )
    );
  }

  return applyCorsHeaders(
    req,
    NextResponse.json({
      success: true,
      message: `A new password has been sent to ${maskEmail(result.user?.email || '')}.`,
    })
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0] ?? "*"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}
