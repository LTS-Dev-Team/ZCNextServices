import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER || "learningtechnologies@zewailcity.edu.eg";
const SMTP_PASSWORD = (process.env.SMTP_PASSWORD || "kzouecddkhuelloa").replace(/\s/g, "");
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

function hasSmtpAuth(): boolean {
  return Boolean(SMTP_USER && SMTP_PASSWORD);
}

export function isMailConfigured(): boolean {
  if (!SMTP_HOST || !SMTP_FROM) return false;
  // Both user and password must be set together, or neither (IP-relay mode).
  if (Boolean(SMTP_USER) !== Boolean(SMTP_PASSWORD)) return false;
  return true;
}

function isGmailHost(host: string): boolean {
  return /gmail\.com|googlemail\.com/i.test(host);
}

function createTransport() {
  if (!isMailConfigured()) {
    throw new Error("Email is not configured on the server");
  }

  const options: SMTPTransport.Options = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: hasSmtpAuth() ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
  };

  // Gmail on port 587 uses STARTTLS (secure: false)
  if (isGmailHost(SMTP_HOST) && SMTP_PORT === 587) {
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

  await transport.sendMail({
    from: SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
