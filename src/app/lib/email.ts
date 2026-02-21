import nodemailer from "nodemailer";
import { render } from "@react-email/components";
import { logger } from "./logger";
import InviteEmail from "@emails/InviteEmail";
import ResetPasswordEmail from "@emails/ResetPasswordEmail";

export async function getInvitationEmailTemplate(inviteUrl: string) {
  const emailHtml = await render(InviteEmail({ inviteLink: inviteUrl }));
  return {
    subject: "You've been invited to join Ideon",
    html: emailHtml,
  };
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const host = process.env.SMTP_HOST;
  const fromEmail = process.env.SMTP_FROM_EMAIL;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
  const secure = port === 465;
  const fromName = process.env.SMTP_FROM_NAME || "Ideon";

  if (!host || !fromEmail || !user || !pass) {
    logger.warn(
      { host: !!host, user: !!user, pass: !!pass, from: !!fromEmail },
      "SMTP settings missing",
    );
    return false;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && process.env.SMTP_USE_TLS === "true",
    auth: {
      user,
      pass: pass || "",
    },
  });

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    logger.error(
      { error: err, to, subject },
      "CRITICAL: Failed to send email via Nodemailer",
    );
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, resetLink: string) {
  const emailHtml = await render(ResetPasswordEmail({ resetLink }));
  return sendEmail({
    to: email,
    subject: "Reset your Ideon password",
    html: emailHtml,
  });
}
