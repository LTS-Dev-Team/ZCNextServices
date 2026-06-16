/**
 * lib/ldap.ts
 * All LDAP logic runs SERVER-SIDE ONLY.
 * Never import this file from a client component.
 */

import {
  Attribute,
  Change,
  Client,
  ConstraintViolationError,
  EqualityFilter,
  InvalidCredentialsError,
  OrFilter,
  ResultCodeError,
} from "ldapts";

// ── Config ────────────────────────────────────────────────────────────────────
const AD_HOSTS = (process.env.AD_HOSTS || process.env.AD_HOST || "10.100.10.20")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const AD_PORT = parseInt(process.env.AD_PORT || "636", 10);
const AD_USE_SSL = process.env.AD_USE_SSL !== "false";
const AD_DOMAIN = process.env.AD_DOMAIN || "zewailcity.local";
const AD_NETBIOS = process.env.AD_NETBIOS || "";
const AD_BASE_DN = process.env.AD_BASE_DN || "DC=zewailcity,DC=local";
const AD_CONNECT_TIMEOUT = parseInt(process.env.AD_CONNECT_TIMEOUT || "8000", 10);
const AD_TIMEOUT = parseInt(process.env.AD_TIMEOUT || "20000", 10);
const AD_MIN_PASSWORD_AGE_HOURS = parseInt(
  process.env.AD_MIN_PASSWORD_AGE_HOURS || "24",
  10
);
const AD_SERVICE_USER = process.env.AD_SERVICE_USER || "";
const AD_SERVICE_PASSWORD = process.env.AD_SERVICE_PASSWORD || "";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function normalizeUsername(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  if (trimmed.includes("\\")) {
    return trimmed.split("\\").pop()!.trim();
  }

  if (trimmed.includes("@")) {
    return trimmed.split("@")[0]!.trim();
  }

  return trimmed;
}

function toUPN(username: string): string {
  const normalized = normalizeUsername(username);
  if (normalized.includes("@")) return normalized;
  if (normalized.includes("\\")) return normalized;
  return `${normalized}@${AD_DOMAIN}`;
}

function bindIdentities(username: string): string[] {
  const normalized = normalizeUsername(username);
  const identities = [toUPN(normalized)];
  if (AD_NETBIOS) {
    identities.push(`${AD_NETBIOS}\\${normalized}`);
  }
  return Array.from(new Set(identities));
}

function encodePassword(password: string): Buffer {
  const quoted = `"${password}"`;
  const buf = Buffer.alloc(quoted.length * 2);
  for (let i = 0; i < quoted.length; i++) {
    buf.writeUInt16LE(quoted.charCodeAt(i), i * 2);
  }
  return buf;
}

function ldapUrl(host: string): string {
  return `${AD_USE_SSL ? "ldaps" : "ldap"}://${host}:${AD_PORT}`;
}

function createClient(host: string): Client {
  return new Client({
    url: ldapUrl(host),
    connectTimeout: AD_CONNECT_TIMEOUT,
    timeout: AD_TIMEOUT,
    tlsOptions: AD_USE_SSL ? { rejectUnauthorized: false } : undefined,
  });
}

function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|timed out|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EHOSTUNREACH|connect/i.test(
    msg
  );
}

async function bindAsUser(
  client: Client,
  username: string,
  password: string
): Promise<void> {
  let lastErr: unknown;
  for (const identity of bindIdentities(username)) {
    try {
      await client.bind(identity, password);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function bindAsServiceAccount(client: Client): Promise<void> {
  if (!AD_SERVICE_USER || !AD_SERVICE_PASSWORD) {
    throw new Error("Password reset service account is not configured");
  }

  await bindAsUser(client, AD_SERVICE_USER, AD_SERVICE_PASSWORD);
}

export interface ADUserRecord {
  dn: string;
  username: string;
  displayName: string;
  email: string;
}

async function searchUserRecord(
  client: Client,
  username: string
): Promise<ADUserRecord | null> {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;

  const { searchEntries } = await client.search(AD_BASE_DN, {
    scope: "sub",
    filter: new OrFilter({
      filters: [
        new EqualityFilter({ attribute: "sAMAccountName", value: normalized }),
        new EqualityFilter({
          attribute: "userPrincipalName",
          value: toUPN(normalized),
        }),
      ],
    }),
    attributes: ["dn", "sAMAccountName", "displayName", "cn", "mail", "userPrincipalName"],
    sizeLimit: 5,
  });

  const entry = searchEntries?.[0];
  if (!entry?.dn) return null;

  const sam = String(entry.sAMAccountName || normalized);
  const displayName = String(entry.displayName || entry.cn || sam);
  const email = String(entry.mail || entry.userPrincipalName || "").trim();

  return {
    dn: entry.dn,
    username: sam,
    displayName,
    email,
  };
}

async function whoAmIDN(client: Client): Promise<string | null> {
  try {
    const { value } = await client.exop("1.3.6.1.4.1.4203.1.11.3");
    if (!value) return null;
    const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
    const match = text.match(/^dn:(.+)$/im);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

async function findUserDN(client: Client, username: string): Promise<string> {
  const fromWhoAmI = await whoAmIDN(client);
  if (fromWhoAmI) return fromWhoAmI;

  const user = await searchUserRecord(client, username);
  if (!user) {
    throw new Error(`User "${normalizeUsername(username)}" not found in Active Directory`);
  }
  return user.dn;
}

async function replaceUnicodePwd(
  client: Client,
  userDN: string,
  newPassword: string
): Promise<void> {
  await client.modify(userDN, [
    new Change({
      operation: "replace",
      modification: new Attribute({
        type: "unicodePwd",
        values: [encodePassword(newPassword)],
      }),
    }),
  ]);
}

async function unlockAccount(client: Client, userDN: string): Promise<void> {
  await client.modify(userDN, [
    new Change({
      operation: "replace",
      modification: new Attribute({
        type: "lockoutTime",
        values: ["0"],
      }),
    }),
  ]);
}

async function attemptResetOnHost(
  host: string,
  username: string,
  newPassword: string
): Promise<ResetPasswordResult> {
  const client = createClient(host);
  try {
    await bindAsServiceAccount(client);
    const user = await searchUserRecord(client, username);
    if (!user) {
      return { success: false, message: "User not found in Active Directory", code: "not_found" };
    }

    if (!user.email) {
      return {
        success: false,
        message: "No email address is registered for this account. Contact IT support.",
        code: "no_email",
      };
    }

    try {
      await replaceUnicodePwd(client, user.dn, newPassword);
    } catch (err) {
      console.log({err})
      return {
        success: false,
        message: mapResetLDAPError(err),
      };
    }

    try {
      await unlockAccount(client, user.dn);
    } catch (err) {
      console.log({err})
      return {
        success: false,
        message: mapResetLDAPError(err),
      };
    }

    return {
      success: true,
      message: "Password reset successfully",
      user,
    };
  } finally {
    try {
      await client.unbind();
    } catch {
      // socket may already be closed
    }
  }
}

async function attemptOnHost(
  host: string,
  username: string,
  oldPassword: string,
  newPassword: string
): Promise<ChangePasswordResult> {
  const client = createClient(host);
  try {
    await bindAsUser(client, username, oldPassword);
    const userDN = await findUserDN(client, username);

    await client.modify(userDN, [
      new Change({
        operation: "delete",
        modification: new Attribute({
          type: "unicodePwd",
          values: [encodePassword(oldPassword)],
        }),
      }),
      new Change({
        operation: "add",
        modification: new Attribute({
          type: "unicodePwd",
          values: [encodePassword(newPassword)],
        }),
      }),
    ]);

    return { success: true, message: "Password changed successfully" };
  } finally {
    try {
      await client.unbind();
    } catch {
      // socket may already be closed
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ChangePasswordResult {
  success: boolean;
  message: string;
}

export interface ResetPasswordResult {
  success: boolean;
  message: string;
  user?: ADUserRecord;
  code?: "not_found" | "no_email" | "not_configured";
}

export async function resetADPassword(
  username: string,
  newPassword: string
): Promise<ResetPasswordResult> {
  if (!AD_SERVICE_USER || !AD_SERVICE_PASSWORD) {
    return {
      success: false,
      message: "Password reset is not configured on the server",
      code: "not_configured",
    };
  }

  const normalized = normalizeUsername(username);
  if (!normalized) {
    return { success: false, message: "Username is required", code: "not_found" };
  }

  let lastErr: unknown = new Error("Could not connect to any Active Directory server");

  const results = await Promise.allSettled(
    AD_HOSTS.map((host) => attemptResetOnHost(host, normalized, newPassword))
  );

  const success = results.find(
    (r): r is PromiseFulfilledResult<ResetPasswordResult> =>
      r.status === "fulfilled" && r.value.success
  );
  if (success) {
    return success.value;
  }

  const fulfilled = results.find(
    (r): r is PromiseFulfilledResult<ResetPasswordResult> => r.status === "fulfilled"
  );
  if (fulfilled && !fulfilled.value.success) {
    return fulfilled.value;
  }

  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason);

  lastErr =
    errors.find((e) => !isNetworkError(e)) ??
    errors[0] ??
    lastErr;

  return { success: false, message: mapResetLDAPError(lastErr) };
}

export async function changeADPassword(
  username: string,
  oldPassword: string,
  newPassword: string
): Promise<ChangePasswordResult> {
  let lastErr: unknown = new Error("Could not connect to any Active Directory server");

  // Try DCs in parallel — first reachable host wins (~8s max, not 50s)
  const results = await Promise.allSettled(
    AD_HOSTS.map((host) => attemptOnHost(host, username, oldPassword, newPassword))
  );

  const success = results.find((r) => r.status === "fulfilled");
  if (success && success.status === "fulfilled") {
    return success.value;
  }

  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason);

  // Prefer a real LDAP error (wrong password, policy) over a generic timeout
  lastErr =
    errors.find((e) => !isNetworkError(e)) ??
    errors[0] ??
    lastErr;

  return { success: false, message: mapLDAPError(lastErr) };
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isUnicodePwdConstraintError(err: unknown, msg: string): boolean {
  return (
    err instanceof ConstraintViolationError ||
    /0000052[dD]|unicodePwd|CONSTRAINT_ATT_TYPE/i.test(msg)
  );
}

function mapPasswordPolicyError(): string {
  const hours = AD_MIN_PASSWORD_AGE_HOURS;
  const waitLabel =
    hours >= 24 && hours % 24 === 0
      ? `${hours / 24} day${hours > 24 ? "s" : ""}`
      : `${hours} hour${hours !== 1 ? "s" : ""}`;

  return (
    `You cannot change your password yet. Wait at least ${waitLabel} after your last change, ` +
    "Also you can use Reset Password."
  );
}

/** Win32 subcode from AD bind/modify errors, e.g. "data 52e" → "52e" */
function parseAdDataSubcode(text: string): string | null {
  const match = text.match(/data\s+([0-9a-fA-F]+)/i);
  return match ? match[1].toLowerCase() : null;
}

const AD_DATA_SUBCODE_MESSAGES: Record<string, string> = {
  // ERROR_LOGON_FAILURE
  "52e": "Incorrect username or current password",
  // ERROR_PASSWORD_RESTRICTION (complexity, history, or minimum age)
  "52d": mapPasswordPolicyError(),
  // ERROR_PASSWORD_EXPIRED
  "532": "Your password has expired — Use Reset Password Request instead",
  // ERROR_ACCOUNT_DISABLED
  "533": "Account is disabled — Use Reset Password Request instead",
  // ERROR_ACCOUNT_LOCKED
  "775": "Account is locked — Use Reset Password Request instead",
};

function mapLDAPError(err: unknown): string {
  const msg = getErrorMessage(err);
  const ldapCode = err instanceof ResultCodeError ? err.code : undefined;

  const subcode = parseAdDataSubcode(msg);
  if (subcode && AD_DATA_SUBCODE_MESSAGES[subcode]) {
    return AD_DATA_SUBCODE_MESSAGES[subcode];
  }

  if (isUnicodePwdConstraintError(err, msg)) {
    return mapPasswordPolicyError();
  }

  if (ldapCode === 49 || err instanceof InvalidCredentialsError) {
    return "Incorrect username or current password";
  }
  if (ldapCode === 19) {
    return "New password does not meet policy requirements (length, complexity, history)";
  }
  if (ldapCode === 53) {
    return "No permission to change password — Use Reset Password Request instead";
  }
  if (ldapCode === 32) {
    return "User not found in Active Directory";
  }
  if (ldapCode === 81) {
    return "Network error — Use Reset Password Request instead";
  }

  if (/password does not meet/i.test(msg)) {
    return mapPasswordPolicyError();
  }
  if (/00000775|account.*locked/i.test(msg)) {
    return "Account is locked — Use Reset Password Request instead";
  }
  if (/00000533|account.*disabled/i.test(msg)) {
    return "Account is disabled — Use Reset Password Request instead";
  }
  if (/00000532|password.*expired/i.test(msg)) {
    return "Your password has expired — Use Reset Password Request instead";
  }
  if (
    /AcceptSecurityContext|80090308|Invalid Credentials|Invalid credentials|00000056/i.test(
      msg
    )
  ) {
    return "Incorrect username or current password";
  }

  if (msg.includes("not found")) {
    return "User not found in Active Directory";
  }
  if (isNetworkError(err)) {
    return "Cannot connect to Active Directory — make sure you are on the internal network or VPN";
  }
  if (msg.includes("closed")) {
    return "Connection to Active Directory was lost — please try again";
  }
  if (msg.includes("insufficient access") || msg.includes("00002028")) {
    return "No permission to change password — Use Reset Password Request instead";
  }

  return "Password change failed — please try again or use Reset Password";
}

function mapResetLDAPError(err: unknown): string {
  const msg = getErrorMessage(err);
  const ldapCode = err instanceof ResultCodeError ? err.code : undefined;
  if (msg.includes("service account is not configured")) {
    return "Password reset is not configured on the server";
  }
  if (ldapCode === 19 || /password does not meet/i.test(msg)) {
    return "Generated password does not meet Active Directory policy requirements";
  }
  if (ldapCode === 32 || msg.includes("not found")) {
    return "User not found in Active Directory";
  }
  if (ldapCode === 50 || ldapCode === 53 || /insufficient access|00002028/i.test(msg)) {
    return "Server does not have permission to reset passwords in Active Directory";
  }
  if (isNetworkError(err)) {
    return "Cannot connect to Active Directory — make sure you are on the internal network or VPN";
  }

  return "Password reset failed — please try again or contact IT support";
}
