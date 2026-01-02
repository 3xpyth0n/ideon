import { sendEmail } from "@lib/email";
import { adminAction } from "@lib/server-utils";

export const POST = adminAction(
  async (_req, { user }) => {
    if (!user) throw new Error("Unauthorized");
    const success = await sendEmail({
      to: user.email,
      subject: "Ideon SMTP Test",
      html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #000;">SMTP Test Successful</h1>
        <p>This is a test email from your Ideon instance to verify that SMTP settings are correctly configured.</p>
        <p>Sent to: <strong>${user.email}</strong></p>
        <p style="font-size: 12px; color: #666; margin-top: 20px;">
          If you received this email, your SMTP configuration is working correctly.
        </p>
      </div>
    `,
    });

    if (!success) {
      throw {
        status: 500,
        message: "Failed to send test email. Check server logs.",
      };
    }

    return { success: true };
  },
  { requireUser: true },
);
