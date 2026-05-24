/**
 * lib/ldap.ts
 * All LDAP logic runs SERVER-SIDE ONLY.
 * Never import this file from a client component.
 */

import {
  Attribute,
  Change,
  Client,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function toUPN(username: string): string {
  if (username.includes("@")) return username;
  if (username.includes("\\")) return username;
  return `${username}@${AD_DOMAIN}`;
}

function bindIdentities(username: string): string[] {
  const identities = [toUPN(username)];
  if (AD_NETBIOS) {
    identities.push(`${AD_NETBIOS}\\${username}`);
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

  const { searchEntries } = await client.search(AD_BASE_DN, {
    scope: "sub",
    filter: new OrFilter({
      filters: [
        new EqualityFilter({ attribute: "sAMAccountName", value: username }),
        new EqualityFilter({
          attribute: "userPrincipalName",
          value: toUPN(username),
        }),
      ],
    }),
    attributes: ["dn"],
    sizeLimit: 5,
  });

  const dn = searchEntries?.[0]?.dn;
  if (!dn) {
    throw new Error(`User "${username}" not found in Active Directory`);
  }
  return dn;
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

  const message =
    lastErr instanceof Error ? lastErr.message : "An unexpected error occurred";
  return { success: false, message: mapLDAPError(lastErr, message) };
}

function mapLDAPError(err: unknown, msg: string): string {
  console.log({msg})
  if (err instanceof InvalidCredentialsError || err instanceof ResultCodeError) {
    if (err.code === 49) {
      return "Incorrect username or current password";
    }
    if (err.code === 53) {
      return "No permission to change password — contact your system administrator";
    }
    if (err.code === 19) {
      return "New password does not meet policy requirements (length, complexity, history)";
    }
    if (err.code === 32) {
      return "User not found in Active Directory";
    }
  }

  if (msg.includes("current password")) return msg;
  if (msg.includes("not found")) return "User not found in Active Directory";
  if (
    msg.includes("Invalid Credentials") ||
    msg.includes("Invalid credentials") ||
    msg.includes("AcceptSecurityContext") ||
    msg.includes("80090308") ||
    msg.includes("00000056")
  )
    return "Incorrect username or current password";
  if (
    msg.includes("timeout") ||
    msg.includes("Timeout") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ENOTFOUND")
  )
    return "Cannot connect to Active Directory — make sure you are on the internal network or VPN";
  if (msg.includes("connect"))
    return "Cannot connect to Active Directory — make sure you are on the internal network or VPN";
  if (msg.includes("closed"))
    return "Connection to Active Directory was lost — please try again";
  if (msg.includes("0000052D") || msg.includes("password does not meet"))
    return "New password does not meet policy requirements (length, complexity, history)";
  if (msg.includes("0000775"))
    return "Account is locked — contact your system administrator";
  if (msg.includes("00000533"))
    return "Account is disabled — contact your system administrator";
  if (msg.includes("00002028") || msg.includes("insufficient access"))
    return "No permission to change password — contact your system administrator";
  return `Error: ${msg}`;
}
