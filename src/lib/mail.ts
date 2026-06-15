import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER?.trim() || "";
  const password = (process.env.SMTP_PASSWORD || "").replace(/\s/g, "");
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host || !from) return null;
  if (Boolean(user) !== Boolean(password)) return null;
  if (!user || !password) return null;

  return { host, port, secure, user, password, from };
}

export function isMailConfigured(): boolean {
  return readSmtpConfig() !== null;
}

function isGmailHost(host: string): boolean {
  return /gmail\.com|googlemail\.com/i.test(host);
}

function createTransport() {
  const config = readSmtpConfig();
  if (!config) {
    throw new Error("Email is not configured on the server");
  }

  const options: SMTPTransport.Options = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  };

  // Gmail on port 587 uses STARTTLS (secure: false)
  if (isGmailHost(config.host) && config.port === 587) {
    options.secure = false;
    options.requireTLS = true;
  }

  return nodemailer.createTransport(options);
}

export interface ResetPasswordEmailParams {
  to: string;
  displayName: string;
  username: string;
  newPassword: string;
}

export async function sendResetPasswordEmail(
  params: ResetPasswordEmailParams
): Promise<void> {
  const config = readSmtpConfig();
  if (!config) {
    throw new Error("Email is not configured on the server");
  }

  const { to, displayName, username, newPassword } = params;
  const transport = createTransport();
  const subject = "Your Active Directory password has been reset";
  const text = [
    `Hello ${displayName},`,
    "",
    "Your Active Directory password has been reset as requested.",
    "",
    `Username: ${username}`,
    `Temporary password: ${newPassword}`,
    "",
    "Sign in with this password, then change it from the password change page if your account policy allows it.",
    "",
    "If you did not request this reset, contact IT support immediately.",
  ].join("\n");

  const html = `
    <p>Hello ${escapeHtml(displayName)},</p>
    <p>Your Active Directory password has been reset as requested.</p>
    <table style="border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#555">Username</td><td><strong>${escapeHtml(username)}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555">Temporary password</td><td><strong>${escapeHtml(newPassword)}</strong></td></tr>
    </table>
    <p>Sign in with this password, then change it from the password change page if your account policy allows it.</p>
    <p style="color:#666;font-size:13px">If you did not request this reset, contact IT support immediately.</p>
  `;

  try {
    await transport.sendMail({
      from: config.from,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    const authUser = config.user;
    const message =
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "EAUTH"
        ? `SMTP authentication failed for ${authUser}. Check SMTP_USER and SMTP_PASSWORD in the production environment.`
        : err instanceof Error
          ? err.message
          : "Failed to send email";
    throw new Error(message, { cause: err });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
