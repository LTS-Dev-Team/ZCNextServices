import {
  decodeProtectedHeader,
  importSPKI,
  jwtVerify,
  type JWTPayload,
} from "jose";

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

const HMAC_ALGORITHMS = ["HS256", "HS384", "HS512"] as const;
const RSA_ALGORITHMS = ["RS256", "RS384", "RS512"] as const;

function getRawSecret(): string | null {
  const secret = process.env.RESET_TOKEN_SECRET || process.env.JWT_SECRET;
  return secret?.trim() || null;
}

function getSymmetricKeyCandidates(): Uint8Array[] {
  const raw = getRawSecret();
  if (!raw) return [];

  const keys: Uint8Array[] = [new TextEncoder().encode(raw)];

  if (/^[A-Za-z0-9+/=_-]+$/.test(raw)) {
    try {
      const decoded = Buffer.from(raw, "base64");
      if (decoded.length >= 16) {
        keys.push(new Uint8Array(decoded));
      }
    } catch {
      // ignore invalid base64
    }
  }

  return keys;
}

async function getRsaPublicKey(algorithm: string) {
  const pem = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, "\n").trim();
  if (!pem) return null;

  const alg =
    algorithm === "RS512" ? "RS512" : algorithm === "RS384" ? "RS384" : "RS256";
  return importSPKI(pem, alg);
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

function getJwtErrorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code?: string }).code);
  }
  return "";
}

function mapVerifyError(err: unknown): ResetTokenError {
  const code = getJwtErrorCode(err);
  const message = err instanceof Error ? err.message : "Invalid reset token";

  if (code === "ERR_JWT_EXPIRED" || /expired|expiration/i.test(message)) {
    return new ResetTokenError("Reset link has expired. Request a new one from the portal.");
  }

  if (code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED" || /signature/i.test(message)) {
    return new ResetTokenError(
      "Invalid reset token signature. For RS256 tokens set JWT_PUBLIC_KEY. " +
        "For HS256 tokens set RESET_TOKEN_SECRET to match the portal signing key."
    );
  }

  if (code === "ERR_JWS_INVALID" || code === "ERR_JWT_INVALID") {
    return new ResetTokenError("Reset token is malformed");
  }

  return new ResetTokenError("Invalid or expired reset token");
}

function verifyUnsignedPortalToken(token: string): ResolvedResetIdentity {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[1]) {
    throw new ResetTokenError("Reset token is malformed");
  }

  const payload = decodePayloadSegment(parts[1]);
  validateExpiration(payload);
  return resolveResetIdentity(payload);
}

export async function verifyResetToken(rawToken: string): Promise<ResolvedResetIdentity> {
  const token = normalizeToken(rawToken);
  if (!token) {
    throw new ResetTokenError("Missing reset token");
  }

  const parts = token.split(".");

  // Portal sends RS256 header + payload only (no signature segment).
  if (parts.length === 2) {
    return verifyUnsignedPortalToken(token);
  }

  if (parts.length !== 3) {
    throw new ResetTokenError("Reset token is malformed");
  }

  let header;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    throw new ResetTokenError("Reset token is malformed");
  }

  const verifyOptions = {
    issuer: process.env.JWT_ISSUER || undefined,
    audience: process.env.JWT_AUDIENCE || undefined,
  };

  const algorithmsToTry = header.alg
    ? [header.alg]
    : [...HMAC_ALGORITHMS, ...RSA_ALGORITHMS];

  let lastErr: unknown;

  for (const algorithm of algorithmsToTry) {
    let keys: Array<Uint8Array | CryptoKey>;

    if (RSA_ALGORITHMS.includes(algorithm as (typeof RSA_ALGORITHMS)[number])) {
      const rsaKey = await getRsaPublicKey(algorithm);
      if (!rsaKey) continue;
      keys = [rsaKey];
    } else {
      keys = getSymmetricKeyCandidates();
      if (keys.length === 0) continue;
    }

    for (const key of keys) {
      try {
        const { payload } = await jwtVerify(token, key, {
          ...verifyOptions,
          algorithms: [algorithm],
        });
        return resolveResetIdentity(payload);
      } catch (err) {
        lastErr = err;
        const code = getJwtErrorCode(err);
        if (code === "ERR_JWT_EXPIRED") {
          throw mapVerifyError(err);
        }
      }
    }
  }

  if (header.alg?.startsWith("RS") && !process.env.JWT_PUBLIC_KEY) {
    throw new ResetTokenError(
      "This token uses RS256. Set JWT_PUBLIC_KEY in .env.local to the portal public key."
    );
  }

  if (!getRawSecret() && HMAC_ALGORITHMS.includes(header.alg as (typeof HMAC_ALGORITHMS)[number])) {
    throw new ResetTokenError(
      "JWT verification is not configured. Set RESET_TOKEN_SECRET in .env.local."
    );
  }

  throw mapVerifyError(lastErr);
}
