import type { JWTPayload } from "jose";

export class ResetTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResetTokenError";
  }
}

export interface ResolvedResetIdentity {
  adUsername: string;
  email: string;
  displayName: string;
  role: string;
  userId: string;
}

export function normalizeToken(raw: string): string {
  let token = raw.trim();
  if (!token) return token;

  if (token.includes("%")) {
    try {
      token = decodeURIComponent(token);
    } catch {
      // keep original token
    }
  }

  if (token.includes(" ")) {
    token = token.replace(/ /g, "+");
  }

  return token;
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = normalizeToken(authHeader.slice("Bearer ".length));
  return token || null;
}

export function resolveAdUsername(userEmail: string, studentId?: string): string {
  const normalizedStudentId = studentId?.trim();
  if (normalizedStudentId) return normalizedStudentId;

  const email = userEmail.trim();
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) {
    throw new ResetTokenError("Token UserEmail is invalid");
  }

  const localPart = email.slice(0, atIndex).trim();
  if (!localPart) {
    throw new ResetTokenError("Could not resolve AD username from token");
  }

  return localPart;
}

function getClaim(payload: JWTPayload, ...names: string[]): string {
  for (const name of names) {
    const direct = payload[name];
    if (direct != null && String(direct).trim()) {
      return String(direct).trim();
    }

    const matched = Object.entries(payload).find(
      ([key]) => key.toLowerCase() === name.toLowerCase()
    );
    if (matched && matched[1] != null && String(matched[1]).trim()) {
      return String(matched[1]).trim();
    }
  }

  return "";
}

function resolveResetIdentity(payload: JWTPayload): ResolvedResetIdentity {
  const userId = getClaim(payload, "UserId", "userId", "sub");
  const displayName = getClaim(payload, "Username", "username", "name");
  const userEmail = getClaim(payload, "UserEmail", "userEmail", "email");
  const studentId = getClaim(payload, "StudentId", "studentId");
  const role = getClaim(payload, "Role", "role");

  if (!userEmail) {
    throw new ResetTokenError("Token is missing UserEmail");
  }

  const adUsername = resolveAdUsername(userEmail, studentId || undefined);

  return {
    adUsername,
    email: userEmail,
    displayName: displayName || adUsername,
    role,
    userId,
  };
}

function decodePayloadSegment(segment: string): JWTPayload {
  try {
    const json = Buffer.from(segment, "base64url").toString("utf8");
    return JSON.parse(json) as JWTPayload;
  } catch {
    throw new ResetTokenError("Reset token payload is invalid");
  }
}

function validateExpiration(payload: JWTPayload): void {
  if (typeof payload.exp !== "number") {
    throw new ResetTokenError("Token is missing expiration");
  }

  if (payload.exp * 1000 <= Date.now()) {
    throw new ResetTokenError("Reset link has expired. Request a new one from the portal.");
  }
}

/**
 * Portal tokens carry user data in the JWT payload and expire via `exp`.
 * Signature is not verified here — the portal issues the link and we trust exp + payload.
 */
export async function verifyResetToken(rawToken: string): Promise<ResolvedResetIdentity> {
  const token = normalizeToken(rawToken);
  if (!token) {
    throw new ResetTokenError("Missing reset token");
  }

  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) {
    throw new ResetTokenError("Reset token is malformed");
  }

  const payload = decodePayloadSegment(parts[1]);
  validateExpiration(payload);
  return resolveResetIdentity(payload);
}
