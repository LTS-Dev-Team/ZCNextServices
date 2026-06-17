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

const EMAIL_SIGNATURE_HTML = `
        <p style="margin:0 0 10px;font-size:14px;font-weight:500;">
          Best regards,
        </p>

        <p dir="ltr" style="color:rgb(34,34,34);line-height:1.38;margin-top:0pt;margin-bottom:0pt"><span style="font-size:10pt;font-family:Calibri,sans-serif;color:rgb(255,79,0);background-color:transparent;font-weight:700;vertical-align:baseline">Learning Technologies Services</span></p>

        <table style="border-collapse:collapse;margin-bottom:16px;">
          <tr>
            <td style="border-left:3px solid #1EACD1;padding-left:14px;">
              <img
                src="https://github.com/LTS-Dev-Team/LTS-Dev-Team/blob/main/images/LTS%20FINAL-03.png?raw=true"
                alt="LTS - Learning Technologies Services"
                style="height:70px;display:block;"
              />
            </td>
          </tr>
        </table>

        <table style="border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:3px 8px 3px 0;vertical-align:middle;">
              <img src="https://cdn-icons-png.flaticon.com/512/732/732200.png" width="14" height="14" alt="" />
            </td>
            <td style="padding:3px 0;">
              <a href="mailto:ltsdevteam@zewailcity.edu.eg" style="color:#1EACD1;text-decoration:none;">
                ltsdevteam@zewailcity.edu.eg
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:3px 8px 3px 0;vertical-align:middle;">
              <img src="https://cdn-icons-png.flaticon.com/512/1006/1006771.png" width="14" height="14" alt="" />
            </td>
            <td style="padding:3px 0;">
              <a href="https://zewailcity.edu.eg" style="color:#1EACD1;text-decoration:none;">
                Zewail City Page
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:3px 8px 3px 0;vertical-align:middle;">
              <img src="https://cdn-icons-png.flaticon.com/512/1483/1483336.png" width="14" height="14" alt="" />
            </td>
            <td style="padding:3px 0;">
              Administrative Building - G20 - IT Department
            </td>
          </tr>
          <tr>
            <td style="padding:3px 8px 3px 0;vertical-align:middle;">
              <img src="https://cdn-icons-png.flaticon.com/512/854/854878.png" width="14" height="14" alt="" />
            </td>
            <td style="padding:3px 0;">
              <a href="https://maps.google.com/?q=Ahmed+Zewail+Road,+October+Gardens,+Giza,+Egypt"
                 style="color:#1EACD1;text-decoration:none;">
                Ahmed Zewail Road, October Gardens, Giza, Egypt
              </a>
            </td>
          </tr>
        </table>

        <br />

        <a href="https://www.facebook.com/ZewailCity">
          <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" width="28" height="28" alt="Facebook" style="border-radius:6px;margin-right:6px;" />
        </a>
        <a href="https://x.com/_ZewailCity_">
          <img src="https://cdn-icons-png.flaticon.com/512/5968/5968830.png" width="28" height="28" alt="Twitter" style="border-radius:6px;margin-right:6px;" />
        </a>
        <a href="https://eg.linkedin.com/school/zewailcityst/">
          <img src="https://cdn-icons-png.flaticon.com/512/733/733561.png" width="28" height="28" alt="LinkedIn" style="border-radius:6px;margin-right:6px;" />
        </a>
        <a href="https://www.instagram.com/zewailcityst/">
          <img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" width="28" height="28" alt="Instagram" style="border-radius:6px;margin-right:6px;" />
        </a>
        <a href="https://www.youtube.com/user/zewailcity">
          <img src="https://cdn-icons-png.flaticon.com/512/733/733558.png" width="28" height="28" alt="YouTube" style="border-radius:6px;" />
        </a>
`;

const EMAIL_SIGNATURE_TEXT = [
  "",
  "Best regards,",
  "",
  "Learning Technologies Services",
  "Email: ltsdevteam@zewailcity.edu.eg",
  "Web: https://zewailcity.edu.eg",
  "Administrative Building - G20 - IT Department",
  "Ahmed Zewail Road, October Gardens, Giza, Egypt",
].join("\n");

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
    EMAIL_SIGNATURE_TEXT,
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
    ${EMAIL_SIGNATURE_HTML}
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
